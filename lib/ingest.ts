import type { RawItem, SourceAdapter } from "@/lib/sources/base";
import { hackerNewsAdapter } from "@/lib/sources/hackernews";
import { rssAdapter } from "@/lib/sources/rss";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/db/types";

type RawItemInsert = Database["public"]["Tables"]["raw_items"]["Insert"];
type ServiceClient = ReturnType<typeof createServiceRoleClient>;

const ADAPTERS: SourceAdapter[] = [hackerNewsAdapter, rssAdapter];

export interface SourceResult {
  name: string;
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
}

export interface IngestResult {
  durationMs: number;
  sources: SourceResult[];
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
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
    console.error(`[ingest] ${adapter.name} upsert failed:`, error.message);
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

/**
 * Run every source adapter and upsert the results into `raw_items`.
 * Adapters are isolated (Promise.allSettled) — one failing never sinks the
 * rest. Never throws. Shared by the cron route and the dashboard action.
 */
export async function runIngest(): Promise<IngestResult> {
  const startedAt = Date.now();
  const supabase = createServiceRoleClient();

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

  return { durationMs: Date.now() - startedAt, sources };
}
