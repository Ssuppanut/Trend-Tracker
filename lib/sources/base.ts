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
