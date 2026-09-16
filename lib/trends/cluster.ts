import { cosineSimilarity } from "./similarity";
import type { Cluster, ClusterItem } from "./types";

/** An existing trend an incoming item can attach to (by centroid similarity). */
export interface ExistingTrend {
  id: number;
  centroid: number[];
}

export interface AssignmentResult {
  /** New members per existing trend id (only trends that gained ≥1 item). */
  assignments: Map<number, ClusterItem[]>;
  /** Items that matched no existing trend — passed on to fresh clustering. */
  residual: ClusterItem[];
}

/**
 * Attach each item to the most similar existing trend whose centroid meets the
 * threshold; unmatched items are returned as `residual`. This keeps trend ids
 * (and their snapshot history) stable across analyze runs instead of spawning a
 * duplicate trend for every new batch. Pure and deterministic.
 */
export function assignToExistingTrends(
  items: ClusterItem[],
  existing: ExistingTrend[],
  threshold = SIM_THRESHOLD,
): AssignmentResult {
  const assignments = new Map<number, ClusterItem[]>();
  const residual: ClusterItem[] = [];

  for (const item of items) {
    if (item.embedding.length === 0) {
      residual.push(item);
      continue;
    }
    let bestId = -1;
    let bestSim = -Infinity;
    for (const trend of existing) {
      if (trend.centroid.length !== item.embedding.length) continue;
      const sim = cosineSimilarity(item.embedding, trend.centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestId = trend.id;
      }
    }
    if (bestId >= 0 && bestSim >= threshold) {
      const list = assignments.get(bestId) ?? [];
      list.push(item);
      assignments.set(bestId, list);
    } else {
      residual.push(item);
    }
  }

  return { assignments, residual };
}

/**
 * Cosine-similarity threshold for putting an item in an existing cluster.
 * Tuned for bge-m3, where clearly-same-topic pairs sit well above ~0.6 and
 * unrelated items sit below. Exposed as a param so it can be re-tuned against
 * real data without touching callers.
 */
export const SIM_THRESHOLD = 0.6;

export interface ClusterOptions {
  /** Similarity threshold, default `SIM_THRESHOLD`. */
  threshold?: number;
}

interface MutableCluster {
  items: ClusterItem[];
  /** Running component sum, so the centroid is an exact mean at every step. */
  sum: number[];
  centroid: number[];
}

/** Deterministic order: newest first, then id ascending as a stable tiebreak. */
function byRecencyThenId(a: ClusterItem, b: ClusterItem): number {
  const ta = new Date(a.publishedAt).getTime();
  const tb = new Date(b.publishedAt).getTime();
  if (tb !== ta) return tb - ta;
  return a.id - b.id;
}

/**
 * Greedy single-pass clustering by embedding similarity.
 *
 * Items are processed in a deterministic order; each joins the most similar
 * existing cluster whose centroid similarity meets the threshold, otherwise it
 * seeds a new cluster. The centroid is maintained as the exact running mean of
 * its members. Deterministic for a given input set and threshold.
 *
 * Items with an empty embedding are ignored (nothing to compare on).
 */
export function clusterByEmbedding(
  items: ClusterItem[],
  options: ClusterOptions = {},
): Cluster[] {
  const threshold = options.threshold ?? SIM_THRESHOLD;
  const usable = items.filter((it) => it.embedding.length > 0);
  const sorted = [...usable].sort(byRecencyThenId);

  const clusters: MutableCluster[] = [];

  for (const item of sorted) {
    let bestIdx = -1;
    let bestSim = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const sim = cosineSimilarity(item.embedding, clusters[i].centroid);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim >= threshold) {
      const c = clusters[bestIdx];
      c.items.push(item);
      for (let d = 0; d < c.sum.length; d++) c.sum[d] += item.embedding[d];
      c.centroid = c.sum.map((s) => s / c.items.length);
    } else {
      clusters.push({
        items: [item],
        sum: [...item.embedding],
        centroid: [...item.embedding],
      });
    }
  }

  return clusters.map((c) => ({ items: c.items, centroid: c.centroid }));
}
