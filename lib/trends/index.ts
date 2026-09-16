/**
 * Trend engine: turn embedded raw items into scored, deterministic trends.
 * Pure and DB-free — persistence lives in `lib/trends/analyze.ts` (Step B2).
 */

import { clusterByEmbedding, SIM_THRESHOLD } from "./cluster";
import { pickCategory, pickLangScope, pickTitle, scoreCluster } from "./score";
import type { ClusterItem, ScoredTrend } from "./types";

export { SIM_THRESHOLD } from "./cluster";
export { TREND_WEIGHTS, scoreCluster } from "./score";
export { cosineSimilarity, meanVector } from "./similarity";
export type {
  Cluster,
  ClusterItem,
  ScoreComponents,
  ScoredTrend,
  TrendMetrics,
} from "./types";

/**
 * Minimum cluster size to count as a trend. Two independent items about the
 * same topic is the smallest honest signal of a trend; singletons stay
 * unclustered. Tunable as data volume grows.
 */
export const MIN_CLUSTER_SIZE = 2;

export interface BuildTrendsOptions {
  /** Similarity threshold for clustering. */
  threshold?: number;
  /** Minimum members to promote a cluster to a trend. */
  minClusterSize?: number;
  /** Reference time (ms) for scoring; injected in tests. */
  now?: number;
}

/**
 * Cluster items, drop clusters below the minimum size, score the rest, and
 * return them sorted by score (highest first).
 */
export function buildTrends(
  items: ClusterItem[],
  options: BuildTrendsOptions = {},
): ScoredTrend[] {
  const minClusterSize = options.minClusterSize ?? MIN_CLUSTER_SIZE;
  const now = options.now ?? Date.now();

  const clusters = clusterByEmbedding(items, {
    threshold: options.threshold ?? SIM_THRESHOLD,
  });

  return clusters
    .filter((c) => c.items.length >= minClusterSize)
    .map((cluster) => ({
      cluster,
      title: pickTitle(cluster.items),
      category: pickCategory(cluster.items),
      langScope: pickLangScope(cluster.items),
      metrics: scoreCluster(cluster, { now }),
    }))
    .sort((a, b) => b.metrics.score - a.metrics.score);
}
