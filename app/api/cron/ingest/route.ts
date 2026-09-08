import { hackerNewsAdapter } from "@/lib/sources/hackernews";
import { rssAdapter } from "@/lib/sources/rss";
import type { RawItem, SourceAdapter } from "@/lib/sources/base";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/db/types";

export const runtime = "nodejs"; // needs AbortController + rss-parser, not edge
export const maxDuration = 60; // Vercel free-tier cap (seconds)

type RawItemInsert = Database["public"]["Tables"]["raw_items"]["Insert"];
type ServiceClient = ReturnType<typeof createServiceRoleClient>;

const ADAPTERS: SourceAdapter[] = [hackerNewsAdapter, rssAdapter];

interface SourceResult {
  name: string;
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function toRow(item: RawItem): RawItemInsert {
  return {
    source: item.source,
    external_id: item.externalId,
    title: item.title,
    url: item.url,
    body: item.body,
    lang: item.lang,
    category_hint: item.categoryHint,
    engagement: item.engagement,
    engagement_raw: item.engagementRaw,
    published_at: item.publishedAt,
    // fetched_at, embedding, trend_id left to their column defaults.
  };
}

/** Fetch one adapter and upsert its items; never throws upward on DB errors. */
async function ingestAdapter(
  adapter: SourceAdapter,
  supabase: ServiceClient,
): Promise<SourceResult> {
  const items = await adapter.fetch();
  const fetched = items.length;

  if (fetched === 0) {
    return { name: adapter.name, fetched: 0, inserted: 0, skipped: 0 };
  }

  const { data, error } = await supabase
    .from("raw_items")
    .upsert(items.map(toRow), {
      onConflict: "source,external_id",
      ignoreDuplicates: true, // on conflict do nothing (adapter-spec §10)
    })
    .select("id");

  if (error) {
    console.error(`[cron/ingest] ${adapter.name} upsert failed:`, error.message);
    return {
      name: adapter.name,
      fetched,
      inserted: 0,
      skipped: 0,
      error: error.message,
    };
  }

  const inserted = data?.length ?? 0;
  return { name: adapter.name, fetched, inserted, skipped: fetched - inserted };
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

  // Isolate adapters from each other — one failing must not sink the rest.
  const settled = await Promise.allSettled(
    ADAPTERS.map((adapter) => ingestAdapter(adapter, supabase)),
  );

  const sources: SourceResult[] = settled.map((result, i) =>
    result.status === "fulfilled"
      ? result.value
      : {
          name: ADAPTERS[i].name,
          fetched: 0,
          inserted: 0,
          skipped: 0,
          error: errorMessage(result.reason),
        },
  );

  return Response.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    sources,
  });
}
