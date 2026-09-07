import {
  percentileRank,
  truncate,
  type RawItem,
  type SourceAdapter,
} from "./base";

const SOURCE = "hackernews";
const CATEGORY_HINT = "tech-ai";
const ENDPOINT =
  "https://hn.algolia.com/api/v1/search_by_date?tags=front_page&hitsPerPage=100";
const USER_AGENT = "TrendTracker/0.1 (personal project)";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_000;
const BODY_MAX_CHARS = 2_000;

/** A single hit from the Algolia HN API (only the fields this adapter reads). */
interface AlgoliaHnHit {
  objectID: string;
  title: string | null;
  story_title?: string | null;
  url: string | null;
  story_text?: string | null;
  points: number | null;
  num_comments: number | null;
  created_at_i: number;
}

interface AlgoliaHnResponse {
  hits: AlgoliaHnHit[];
}

/** raw_score per adapter-spec §1: points + (comments * 2). */
function computeRawScore(hit: AlgoliaHnHit): number {
  const points = hit.points ?? 0;
  const comments = hit.num_comments ?? 0;
  return points + comments * 2;
}

/** Title with the story_title fallback; null when there is no usable title. */
function pickTitle(hit: AlgoliaHnHit): string | null {
  const title = hit.title ?? hit.story_title ?? null;
  if (typeof title !== "string" || title.trim().length === 0) return null;
  return title;
}

/** One HTTP attempt with a 15s timeout via AbortController. */
async function fetchOnce(): Promise<AlgoliaHnHit[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as AlgoliaHnResponse;
    return data.hits ?? [];
  } finally {
    clearTimeout(timer);
  }
}

/** fetchOnce with a single exponential-backoff retry (wait 1s, try again). */
async function fetchFrontPage(): Promise<AlgoliaHnHit[]> {
  try {
    return await fetchOnce();
  } catch (error) {
    console.error(`[${SOURCE}] fetch attempt failed, retrying in 1s:`, error);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await fetchOnce();
  }
}

export const hackerNewsAdapter: SourceAdapter = {
  name: SOURCE,
  schedule: "0 */2 * * *", // every 2 hours (documentation only)

  async fetch(): Promise<RawItem[]> {
    let hits: AlgoliaHnHit[];
    try {
      hits = await fetchFrontPage();
    } catch (error) {
      // Never throw: a single broken source must not take down the pipeline.
      console.error(`[${SOURCE}] fetch failed after retry, returning []:`, error);
      return [];
    }

    // Drop items with no usable title.
    const usable = hits.filter((hit) => pickTitle(hit) !== null);

    // Normalize engagement to 0-100 as a percentile within this batch.
    const rawScores = usable.map(computeRawScore);

    const items: RawItem[] = usable.map((hit, i) => ({
      source: SOURCE,
      externalId: hit.objectID,
      title: pickTitle(hit) as string, // guaranteed non-null by the filter above
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      body: hit.story_text ? truncate(hit.story_text, BODY_MAX_CHARS) : null,
      lang: "en",
      categoryHint: CATEGORY_HINT,
      engagement: percentileRank(rawScores[i], rawScores),
      engagementRaw: {
        points: hit.points ?? 0,
        comments: hit.num_comments ?? 0,
      },
      publishedAt: new Date(hit.created_at_i * 1000).toISOString(),
    }));

    const skipped = hits.length - items.length;
    console.log(
      `[${SOURCE}] fetched=${hits.length} kept=${items.length} skipped=${skipped}`,
    );
    return items;
  },
};
