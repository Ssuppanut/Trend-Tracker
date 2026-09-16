import type { Lang, LangScope, TrendStatus } from "@/lib/db/types";

/**
 * Minimal shape the trend engine needs from a raw_item. Kept independent of the
 * DB row type so the engine stays pure and easy to test.
 */
export interface ClusterItem {
  id: number;
  /** Parsed embedding vector (see lib/embeddings/vector.ts). */
  embedding: number[];
  source: string;
  /** Normalized engagement, 0-100. */
  engagement: number;
  /** ISO 8601 timestamp. */
  publishedAt: string;
  lang: Lang;
  categoryHint: string | null;
  title: string;
}

/** A group of items about the same topic, plus its mean embedding. */
export interface Cluster {
  items: ClusterItem[];
  centroid: number[];
}

/** Per-component 0-100 breakdown, kept for transparency and the trend UI. */
export interface ScoreComponents {
  velocity: number;
  volume: number;
  engagement: number;
  diversity: number;
  recency: number;
}

/** Deterministic metrics for a cluster, matching the `trends` columns. */
export interface TrendMetrics {
  /** Composite 0-100 score. */
  score: number;
  /** Items published in the last 24h. */
  volume24h: number;
  /** volume_24h / baseline (ratio); stored in trends.velocity. */
  velocity: number;
  /** Distinct source platforms in the cluster. */
  sourceCount: number;
  /** Sum of member engagement. */
  engagementSum: number;
  status: TrendStatus;
  components: ScoreComponents;
}

/** A cluster promoted to a trend: metrics + the fields a `trends` row needs. */
export interface ScoredTrend {
  cluster: Cluster;
  /** Representative title (highest-engagement member; LLM titling is deferred). */
  title: string;
  category: string;
  langScope: LangScope;
  metrics: TrendMetrics;
}
