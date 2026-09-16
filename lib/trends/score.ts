import type { LangScope, TrendStatus } from "@/lib/db/types";

import type { Cluster, ClusterItem, ScoreComponents, TrendMetrics } from "./types";

/**
 * Deterministic trend scoring (no LLM, no fake signals).
 *
 * Composite score = weighted sum of five 0-100 components, matching the product
 * spec's weighting (velocity 30 / volume 25 / engagement 20 / source diversity
 * 15 / recency 10). Every component is computed from data we actually have
 * (embeddings-derived clusters over RSS + Hacker News); no multi-signal /
 * sentiment inputs are invented.
 */
export const TREND_WEIGHTS: ScoreComponents = {
  velocity: 0.3,
  volume: 0.25,
  engagement: 0.2,
  diversity: 0.15,
  recency: 0.1,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Item count that saturates the volume component at 100. */
const VOLUME_SATURATION = 20;
/** Distinct-source count that saturates the diversity component at 100. */
const DIVERSITY_SATURATION = 3;
/** A trend with no fresh item past this age is fading. */
const FADE_AGE_MS = 2 * DAY_MS;
/** …and past this age, archived. */
const ARCHIVE_AGE_MS = 7 * DAY_MS;

/** Fixed precedence for breaking category ties, deterministically. */
const CATEGORY_PRECEDENCE = [
  "crypto",
  "tech-ai",
  "design",
  "entertainment",
  "lifestyle",
  "news",
];
/** Valid seeded category to fall back to when no item carries a hint. */
const FALLBACK_CATEGORY = "news";

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

function ageMs(publishedAt: string, now: number): number {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY; // unknown = very old
  return now - t;
}

/** Freshness of the cluster, from its newest member's age. */
function recencyScore(newestAgeMs: number): number {
  if (newestAgeMs < HOUR_MS) return 100;
  if (newestAgeMs < 6 * HOUR_MS) return 90;
  if (newestAgeMs < 12 * HOUR_MS) return 75;
  if (newestAgeMs < DAY_MS) return 60;
  if (newestAgeMs < 2 * DAY_MS) return 40;
  if (newestAgeMs < 7 * DAY_MS) return 20;
  return 10;
}

export interface ScoreOptions {
  /** Reference time in ms; injected for deterministic tests. Default `Date.now()`. */
  now?: number;
  /**
   * Prior 7-day average daily volume for this trend, from snapshots. When
   * available it is the velocity baseline; otherwise velocity falls back to the
   * within-cluster previous 24h window (real intra-cluster acceleration).
   */
  priorVolume7dAvg?: number;
}

/** Compute deterministic metrics for a cluster. */
export function scoreCluster(cluster: Cluster, options: ScoreOptions = {}): TrendMetrics {
  const now = options.now ?? Date.now();
  const items = cluster.items;

  const ages = items.map((it) => ageMs(it.publishedAt, now));
  const volume24h = ages.filter((a) => a < DAY_MS).length;
  const volumePrevWindow = ages.filter((a) => a >= DAY_MS && a < 2 * DAY_MS).length;

  // Velocity: prefer the historical 7d baseline; else intra-cluster prev window.
  const baseline =
    options.priorVolume7dAvg && options.priorVolume7dAvg > 0
      ? options.priorVolume7dAvg
      : volumePrevWindow;
  const velocity = volume24h / Math.max(1, baseline);

  const newestAge = Math.min(...ages);
  const distinctSources = new Set(items.map((it) => it.source)).size;
  const engagementSum = items.reduce((s, it) => s + it.engagement, 0);
  const engagementMean = engagementSum / items.length;

  const components: ScoreComponents = {
    velocity: clamp100(velocity * 50), // ratio 1 -> 50, 2+ -> 100
    volume: clamp100((volume24h / VOLUME_SATURATION) * 100),
    engagement: clamp100(engagementMean),
    diversity: clamp100((distinctSources / DIVERSITY_SATURATION) * 100),
    recency: recencyScore(newestAge),
  };

  const score = clamp100(
    Math.round(
      components.velocity * TREND_WEIGHTS.velocity +
        components.volume * TREND_WEIGHTS.volume +
        components.engagement * TREND_WEIGHTS.engagement +
        components.diversity * TREND_WEIGHTS.diversity +
        components.recency * TREND_WEIGHTS.recency,
    ),
  );

  const status: TrendStatus =
    newestAge > ARCHIVE_AGE_MS
      ? "archived"
      : velocity < 1 || newestAge > FADE_AGE_MS
        ? "fading"
        : "active";

  return {
    score,
    volume24h,
    velocity: Number(velocity.toFixed(4)),
    sourceCount: distinctSources,
    engagementSum: Number(engagementSum.toFixed(4)),
    status,
    components,
  };
}

/** Majority category among member hints; deterministic tie-break; safe fallback. */
export function pickCategory(items: ClusterItem[]): string {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.categoryHint) counts.set(it.categoryHint, (counts.get(it.categoryHint) ?? 0) + 1);
  }
  if (counts.size === 0) return FALLBACK_CATEGORY;

  let best = FALLBACK_CATEGORY;
  let bestCount = -1;
  for (const cat of CATEGORY_PRECEDENCE) {
    const c = counts.get(cat) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = cat;
    }
  }
  // A hint not in the precedence list still wins if it's strictly more common.
  for (const [cat, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = cat;
    }
  }
  return best;
}

/** 'th' / 'en' if uniform, else 'mixed'. */
export function pickLangScope(items: ClusterItem[]): LangScope {
  const langs = new Set(items.map((it) => it.lang));
  if (langs.size === 1) return [...langs][0];
  return "mixed";
}

/** Representative title: highest engagement, newest as tiebreak. LLM titling deferred. */
export function pickTitle(items: ClusterItem[]): string {
  let best = items[0];
  for (const it of items) {
    if (it.engagement > best.engagement) best = it;
    else if (
      it.engagement === best.engagement &&
      new Date(it.publishedAt).getTime() > new Date(best.publishedAt).getTime()
    ) {
      best = it;
    }
  }
  return best.title;
}
