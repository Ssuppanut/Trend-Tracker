import type { createServiceRoleClient } from "@/lib/supabase/service";

import { buildEmbeddingInput } from "./input";
import { tryGetEmbeddingProvider } from "./index";
import type { EmbeddingProvider } from "./types";
import { toVectorLiteral } from "./vector";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/** Max rows embedded per invocation (bounds cost + request size per run). */
const DEFAULT_LIMIT = 200;
/** Concurrency for the write-back updates (one UPDATE per row). */
const WRITE_CONCURRENCY = 20;

export interface EmbedPendingResult {
  /** raw_items with a null embedding that were selected this run. */
  candidates: number;
  /** rows successfully embedded and written back. */
  embedded: number;
  /** true when no provider is configured — embedding was skipped, not failed. */
  skipped: boolean;
  /** why it was skipped (only when `skipped`). */
  reason?: string;
  /** set when a real failure occurred (provider threw, or DB read failed). */
  error?: string;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Run `tasks` with bounded concurrency, returning how many resolved truthy. */
async function runWithConcurrency(
  tasks: Array<() => Promise<boolean>>,
  concurrency: number,
): Promise<number> {
  let ok = 0;
  for (let i = 0; i < tasks.length; i += concurrency) {
    const slice = tasks.slice(i, i + concurrency);
    const settled = await Promise.allSettled(slice.map((t) => t()));
    for (const r of settled) if (r.status === "fulfilled" && r.value) ok++;
  }
  return ok;
}

/**
 * Embed raw_items that don't have an embedding yet and write the vectors back.
 *
 * Safe "build now, wire key later" behavior: if no embedding provider is
 * configured, this is a clean no-op (`skipped: true`) — it never writes
 * placeholder or zero vectors. A provider failure is reported via `error`
 * and leaves the rows un-embedded for the next run to retry.
 *
 * Never throws; returns a summary the caller can log.
 */
export async function embedPendingItems(
  supabase: ServiceClient,
  opts: {
    limit?: number;
    /** Inject a provider (tests); `undefined` = resolve from env, `null` = force-skip. */
    provider?: EmbeddingProvider | null;
    /** Provider name to resolve when `provider` is not injected. */
    providerName?: string | null;
    /** Reference time for embedding_generated_at (ms); injected in tests. */
    now?: number;
  } = {},
): Promise<EmbedPendingResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const provider =
    opts.provider !== undefined ? opts.provider : tryGetEmbeddingProvider(opts.providerName);

  if (!provider) {
    return {
      candidates: 0,
      embedded: 0,
      skipped: true,
      reason: "embedding provider not configured (set DEEPINFRA_API_KEY)",
    };
  }

  // Oldest-first so a persistent backlog drains fairly across runs.
  const { data, error } = await supabase
    .from("raw_items")
    .select("id, title, body")
    .is("embedding", null)
    .order("fetched_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { candidates: 0, embedded: 0, skipped: false, error: error.message };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { candidates: 0, embedded: 0, skipped: false };
  }

  const inputs = rows.map((r) => buildEmbeddingInput({ title: r.title, body: r.body }));

  let vectors: number[][];
  try {
    vectors = await provider.embed(inputs);
  } catch (err) {
    return {
      candidates: rows.length,
      embedded: 0,
      skipped: false,
      error: `embed failed: ${errorMessage(err)}`,
    };
  }

  if (vectors.length !== rows.length) {
    return {
      candidates: rows.length,
      embedded: 0,
      skipped: false,
      error: `provider returned ${vectors.length} vectors for ${rows.length} rows`,
    };
  }

  const generatedAt = new Date(opts.now ?? Date.now()).toISOString();
  const writes = rows.map((row, i) => async () => {
    const { error: upErr } = await supabase
      .from("raw_items")
      .update({
        embedding: toVectorLiteral(vectors[i]),
        // Stamp the space so clustering never mixes providers/models.
        embedding_provider: provider.name,
        embedding_model: provider.model,
        embedding_dim: provider.dimensions,
        embedding_generated_at: generatedAt,
      })
      .eq("id", row.id);
    if (upErr) {
      console.error(`[embed] update id=${row.id} failed: ${upErr.message}`);
      return false;
    }
    return true;
  });

  const embedded = await runWithConcurrency(writes, WRITE_CONCURRENCY);

  console.log(
    `[embed] provider=${provider.name} candidates=${rows.length} embedded=${embedded}`,
  );
  return { candidates: rows.length, embedded, skipped: false };
}
