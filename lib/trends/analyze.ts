import {
  describeProvider,
  resolveProviderName,
  tryGetEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingSpace,
} from "@/lib/embeddings";
import { embedPendingItems, type EmbedPendingResult } from "@/lib/embeddings/embed-items";
import { parseVector, toVectorLiteral } from "@/lib/embeddings/vector";
import { createServiceRoleClient } from "@/lib/supabase/service";
import type { Lang } from "@/lib/db/types";

import { assignToExistingTrends, type ExistingTrend } from "./cluster";
import { buildTrends, MIN_CLUSTER_SIZE, SIM_THRESHOLD } from "./index";
import { pickCategory, pickLangScope, pickTitle, scoreCluster } from "./score";
import { meanVector } from "./similarity";
import type { ClusterItem, TrendMetrics } from "./types";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

/** Columns needed to build a ClusterItem + identify its embedding space. */
const ITEM_COLUMNS =
  "id, source, engagement, published_at, lang, category_hint, title, embedding, embedding_provider, embedding_model";

/** Max unclustered items to consider per run (bounds cost). */
const MAX_ITEMS = 1_000;
const DAY_MS = 86_400_000;

export interface AnalyzeResult {
  durationMs: number;
  /** Outcome of the embedding step that runs first. */
  embed: EmbedPendingResult;
  /** Unclustered items with a usable embedding this run. */
  itemsConsidered: number;
  /** Brand-new trends created from residual items. */
  trendsCreated: number;
  /** Existing trends that gained members and were recomputed. */
  trendsUpdated: number;
  /** Items assigned to any trend (new or existing) this run. */
  itemsClustered: number;
  /** The active embedding space this run operated in. */
  provider: string;
  model: string;
  error?: string;
}

export interface AnalyzeOptions {
  supabase?: ServiceClient;
  /** Selected provider name (validated); defaults to EMBEDDINGS_PROVIDER. */
  providerName?: string | null;
  /** Inject a live provider (tests); `undefined` = resolve, `null` = skip embedding. */
  provider?: EmbeddingProvider | null;
  threshold?: number;
  minClusterSize?: number;
  now?: number;
}

interface RawItemRow {
  id: number;
  source: string;
  engagement: number | null;
  published_at: string;
  lang: Lang;
  category_hint: string | null;
  title: string;
  embedding: string | number[] | null;
  embedding_provider: string | null;
  embedding_model: string | null;
}

/** Parse raw rows into ClusterItems, dropping any without a usable embedding. */
function toClusterItems(rows: RawItemRow[]): ClusterItem[] {
  const items: ClusterItem[] = [];
  for (const r of rows) {
    const embedding = parseVector(r.embedding);
    if (!embedding) continue;
    items.push({
      id: r.id,
      embedding,
      source: r.source,
      engagement: r.engagement ?? 0,
      publishedAt: r.published_at,
      lang: r.lang,
      categoryHint: r.category_hint,
      title: r.title,
    });
  }
  return items;
}

/** Average of volume_24h across this trend's snapshots in the last 7 days. */
async function prior7dAvgVolume(
  supabase: ServiceClient,
  trendId: number,
  now: number,
): Promise<number> {
  const since = new Date(now - 7 * DAY_MS).toISOString();
  const { data, error } = await supabase
    .from("trend_snapshots")
    .select("volume_24h")
    .eq("trend_id", trendId)
    .gte("captured_at", since);
  if (error || !data || data.length === 0) return 0;
  const sum = data.reduce((s, row) => s + (row.volume_24h ?? 0), 0);
  return sum / data.length;
}

/** Point trend_id at a set of raw_items. */
async function assignTrendId(
  supabase: ServiceClient,
  itemIds: number[],
  trendId: number,
): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await supabase
    .from("raw_items")
    .update({ trend_id: trendId })
    .in("id", itemIds);
  if (error) console.error(`[analyze] set trend_id=${trendId} failed: ${error.message}`);
}

/** Insert a time-series snapshot row for a trend. */
async function insertSnapshot(
  supabase: ServiceClient,
  trendId: number,
  m: TrendMetrics,
): Promise<void> {
  const { error } = await supabase.from("trend_snapshots").insert({
    trend_id: trendId,
    score: m.score,
    volume_24h: m.volume24h,
    velocity: m.velocity,
  });
  if (error) console.error(`[analyze] snapshot trend=${trendId} failed: ${error.message}`);
}

/**
 * Full analyze pass: embed new items, then cluster/score unclustered items into
 * trends and persist them.
 *
 * Deterministic and honest — no LLM, no invented signals; a trend is only
 * created once ≥ minClusterSize real items about one topic exist. Incoming
 * items first attach to existing trends (stable ids + snapshot history), and
 * only the residue forms new trends. Never throws; returns a summary to log.
 *
 * Known limitation (Phase 1): only trends that gain members this run are
 * recomputed; idle trends aren't decayed until they next gain a member. A
 * periodic decay pass is a follow-up.
 */
export async function runAnalyze(options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const startedAt = Date.now();
  const now = options.now ?? Date.now();
  const threshold = options.threshold ?? SIM_THRESHOLD;
  const minClusterSize = options.minClusterSize ?? MIN_CLUSTER_SIZE;
  const supabase = options.supabase ?? createServiceRoleClient();

  // The active embedding space. Everything this run reads/writes stays inside
  // it — vectors from other providers/models are never mixed in.
  const activeName = resolveProviderName(options.providerName);
  const space: EmbeddingSpace = describeProvider(activeName);

  const empty = (extra: Partial<AnalyzeResult> = {}): AnalyzeResult => ({
    durationMs: Date.now() - startedAt,
    embed,
    itemsConsidered: 0,
    trendsCreated: 0,
    trendsUpdated: 0,
    itemsClustered: 0,
    provider: space.provider,
    model: space.model,
    ...extra,
  });

  // 1. Embed any items still missing a vector with the ACTIVE provider only
  //    (never the inactive one). No-op if that provider is unconfigured.
  const liveProvider =
    options.provider !== undefined ? options.provider : tryGetEmbeddingProvider(activeName);
  const embed = await embedPendingItems(supabase, { provider: liveProvider, now });

  // 2. Load unclustered items in the ACTIVE space only.
  const { data: unclusteredRows, error: loadErr } = await supabase
    .from("raw_items")
    .select(ITEM_COLUMNS)
    .is("trend_id", null)
    .not("embedding", "is", null)
    .eq("embedding_provider", space.provider)
    .eq("embedding_model", space.model)
    .order("published_at", { ascending: false })
    .limit(MAX_ITEMS);

  if (loadErr) return empty({ error: `load unclustered failed: ${loadErr.message}` });

  // Belt-and-suspenders: re-check the space in JS so a mismatched row can never
  // enter clustering even if the query filter were bypassed.
  const spaceRows = ((unclusteredRows ?? []) as RawItemRow[]).filter(
    (r) => r.embedding_provider === space.provider && r.embedding_model === space.model,
  );
  const items = toClusterItems(spaceRows);
  if (items.length === 0) return empty();

  // 3. Load candidate trends in the SAME space to attach to (skip archived).
  const { data: existingRows, error: trendsErr } = await supabase
    .from("trends")
    .select("id, centroid, embedding_provider, embedding_model")
    .eq("embedding_provider", space.provider)
    .eq("embedding_model", space.model)
    .in("status", ["active", "fading"]);

  if (trendsErr) return empty({ itemsConsidered: items.length, error: `load trends failed: ${trendsErr.message}` });

  const existing: ExistingTrend[] = [];
  for (const row of (existingRows ?? []) as Array<{
    id: number;
    centroid: string | number[] | null;
    embedding_provider: string | null;
    embedding_model: string | null;
  }>) {
    if (row.embedding_provider !== space.provider || row.embedding_model !== space.model) continue;
    const centroid = parseVector(row.centroid);
    if (centroid) existing.push({ id: row.id, centroid });
  }

  // 4. Attach to existing trends; cluster the residue into new trends.
  const { assignments, residual } = assignToExistingTrends(items, existing, threshold);
  const newTrends = buildTrends(residual, { threshold, minClusterSize, now });

  let trendsCreated = 0;
  let trendsUpdated = 0;
  let itemsClustered = 0;

  // 5. Persist new trends.
  for (const t of newTrends) {
    const { metrics } = t;
    const { data: inserted, error } = await supabase
      .from("trends")
      .insert({
        title: t.title,
        summary: null, // LLM titling/summary deferred (Decision 2)
        category: t.category,
        lang_scope: t.langScope,
        status: metrics.status,
        score: metrics.score,
        volume_24h: metrics.volume24h,
        volume_7d_avg: 0,
        velocity: metrics.velocity,
        source_count: metrics.sourceCount,
        engagement_sum: metrics.engagementSum,
        centroid: toVectorLiteral(t.cluster.centroid),
        embedding_provider: space.provider,
        embedding_model: space.model,
        first_seen: new Date(now).toISOString(),
        last_updated: new Date(now).toISOString(),
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error(`[analyze] create trend failed: ${error?.message ?? "no id"}`);
      continue;
    }
    const trendId = (inserted as { id: number }).id;
    await assignTrendId(supabase, t.cluster.items.map((i) => i.id), trendId);
    await insertSnapshot(supabase, trendId, metrics);
    trendsCreated++;
    itemsClustered += t.cluster.items.length;
  }

  // 6. Recompute existing trends that gained members.
  for (const [trendId, newMembers] of assignments) {
    const { data: memberRows, error } = await supabase
      .from("raw_items")
      .select(ITEM_COLUMNS)
      .eq("trend_id", trendId);
    if (error) {
      console.error(`[analyze] load members trend=${trendId} failed: ${error.message}`);
      continue;
    }
    const existingMembers = toClusterItems((memberRows ?? []) as RawItemRow[]);
    const allMembers = [...existingMembers, ...newMembers];
    if (allMembers.length === 0) continue;

    const centroid = meanVector(allMembers.map((m) => m.embedding));
    const priorVolume7dAvg = await prior7dAvgVolume(supabase, trendId, now);
    const metrics = scoreCluster({ items: allMembers, centroid }, { now, priorVolume7dAvg });

    const { error: upErr } = await supabase
      .from("trends")
      .update({
        title: pickTitle(allMembers),
        category: pickCategory(allMembers),
        lang_scope: pickLangScope(allMembers),
        status: metrics.status,
        score: metrics.score,
        volume_24h: metrics.volume24h,
        volume_7d_avg: Number(priorVolume7dAvg.toFixed(4)),
        velocity: metrics.velocity,
        source_count: metrics.sourceCount,
        engagement_sum: metrics.engagementSum,
        centroid: toVectorLiteral(centroid),
        last_updated: new Date(now).toISOString(),
      })
      .eq("id", trendId);
    if (upErr) {
      console.error(`[analyze] update trend=${trendId} failed: ${upErr.message}`);
      continue;
    }
    await assignTrendId(supabase, newMembers.map((m) => m.id), trendId);
    await insertSnapshot(supabase, trendId, metrics);
    trendsUpdated++;
    itemsClustered += newMembers.length;
  }

  console.log(
    `[analyze] space=${space.provider}/${space.model} considered=${items.length} created=${trendsCreated} updated=${trendsUpdated} clustered=${itemsClustered} embed=${
      embed.skipped ? "skipped" : `${embed.embedded}/${embed.candidates}`
    }`,
  );

  return {
    durationMs: Date.now() - startedAt,
    embed,
    itemsConsidered: items.length,
    trendsCreated,
    trendsUpdated,
    itemsClustered,
    provider: space.provider,
    model: space.model,
  };
}
