/**
 * Shared contract for every ingestion source adapter.
 *
 * See `adapter-spec.md` §0. Individual adapters (Reddit, Hacker News, RSS,
 * YouTube, Pantip, TikTok CC, Google Trends) are implemented later, each in
 * its own file under `lib/sources/`, and must conform to `SourceAdapter`.
 */

export type Lang = "th" | "en";

export interface RawItem {
  /** Slug of the adapter, e.g. 'reddit'. */
  source: string;
  /** Unique id within the source (used for dedupe). */
  externalId: string;
  title: string;
  url: string | null;
  /** Short body, truncated to ~2,000 chars. */
  body: string | null;
  lang: Lang;
  /** Category slug guessed from the source (see `categories` table). */
  categoryHint: string | null;
  /** Normalized engagement score, 0-100 (percentile within the fetch batch). */
  engagement: number;
  /** Raw engagement metrics, kept for debugging / re-scoring. */
  engagementRaw: Record<string, number>;
  /** ISO 8601 timestamp. */
  publishedAt: string;
}

export interface SourceAdapter {
  /** Adapter slug, e.g. 'reddit'. */
  name: string;
  /** Cron expression — documentation only, not a runtime scheduler. */
  schedule: string;
  /**
   * Fetch the latest batch of items. Must NOT throw: on failure, log and
   * return `[]` so one broken source never takes down the pipeline.
   */
  fetch(): Promise<RawItem[]>;
}

// ---------------------------------------------------------------------------
// Helpers (shared by every adapter)
// ---------------------------------------------------------------------------

/**
 * Percentile rank of `rawScore` within `allScores`, returned as 0-100.
 *
 * This normalizes each source's engagement onto a common 0-100 scale
 * (adapter-spec §1): different sources produce wildly different raw scores
 * (Reddit upvotes vs. YouTube views), so we rank each item against the other
 * items fetched in the same batch instead of using the absolute number.
 *
 * Uses the mid-rank definition — `(below + 0.5 * equal) / n * 100` — so ties
 * share a fair middle rank. This naturally yields 50 when every value is
 * equal and when there is only one item; the empty case is guarded and also
 * returns 50 (a neutral default).
 */
export function percentileRank(rawScore: number, allScores: number[]): number {
  const n = allScores.length;
  if (n === 0) return 50;

  let below = 0;
  let equal = 0;
  for (const score of allScores) {
    if (score < rawScore) below++;
    else if (score === rawScore) equal++;
  }

  return ((below + 0.5 * equal) / n) * 100;
}

/**
 * Truncate `text` to at most `maxLength` characters. Used to cap `RawItem.body`
 * at ~2,000 chars (adapter-spec §0). Shorter or exact-length strings are
 * returned unchanged.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}
