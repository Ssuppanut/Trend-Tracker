import { createHash } from "node:crypto";

import Parser from "rss-parser";

import { truncate, type RawItem, type SourceAdapter } from "./base";

const SOURCE = "rss";
const USER_AGENT = "TrendTracker/0.1 (personal project)";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_000;
const BODY_MAX_CHARS = 2_000;

// RSS has no real engagement metric, so engagement is a proxy signal:
// recency (60%) + source authority (40%). See adapter-spec §7 (RSS v2).
const RECENCY_WEIGHT = 0.6;
const AUTHORITY_WEIGHT = 0.4;

/** Per-feed authority weight (audience size + editorial rigor), 0-100. */
const SOURCE_AUTHORITY: Record<string, number> = {
  // English (large audience)
  "https://techcrunch.com/feed/": 90,
  "https://www.theverge.com/rss/index.xml": 85,
  "https://www.coindesk.com/arc/outboundfeeds/rss/": 85,
  "https://feeds.arstechnica.com/arstechnica/index": 80,
  "https://news.ycombinator.com/rss": 75, // HN front page RSS (distinct from the HN API adapter)

  // Thai (mid audience)
  "https://www.blognone.com/atom.xml": 75,
  "https://thestandard.co/feed/": 70,
  "https://brandinside.asia/feed/": 65,
  "https://marketeeronline.co/feed": 55,
  "https://positioningmag.com/feed": 55,
};

/** Fallback for a feed not in the map (shouldn't happen — guard). */
const DEFAULT_AUTHORITY = 50;

const FEEDS = [
  // Thai
  { url: "https://www.blognone.com/atom.xml", lang: "th", categoryHint: "tech-ai" },
  { url: "https://brandinside.asia/feed/", lang: "th", categoryHint: "news" },
  { url: "https://thestandard.co/feed/", lang: "th", categoryHint: "news" },
  { url: "https://marketeeronline.co/feed", lang: "th", categoryHint: "news" },
  { url: "https://positioningmag.com/feed", lang: "th", categoryHint: "news" },
  // English
  { url: "https://techcrunch.com/feed/", lang: "en", categoryHint: "tech-ai" },
  { url: "https://www.theverge.com/rss/index.xml", lang: "en", categoryHint: "tech-ai" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", lang: "en", categoryHint: "crypto" },
  { url: "https://feeds.arstechnica.com/arstechnica/index", lang: "en", categoryHint: "tech-ai" },
  { url: "https://news.ycombinator.com/rss", lang: "en", categoryHint: "tech-ai" },
] as const;

type Feed = (typeof FEEDS)[number];

const parser = new Parser();

/** Short human label for logs, e.g. blognone / techcrunch / ycombinator. */
function feedName(url: string): string {
  try {
    return new URL(url).hostname.split(".").at(-2) ?? url;
  } catch {
    return url;
  }
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** One HTTP attempt for a feed, with a 15s timeout via AbortController. */
async function fetchFeedOnce(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** fetchFeedOnce with a single exponential-backoff retry (wait 1s). */
async function fetchFeedWithRetry(url: string): Promise<string> {
  try {
    return await fetchFeedOnce(url);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await fetchFeedOnce(url);
  }
}

interface FeedResult {
  name: string;
  items: RawItem[];
  fetched: number;
  kept: number;
  skipped: number;
}

/** Fetch + parse a single feed into RawItems. Throws on fetch/parse failure
 *  so the caller (Promise.allSettled) can isolate it. */
async function processFeed(feed: Feed): Promise<FeedResult> {
  const name = feedName(feed.url);
  const xml = await fetchFeedWithRetry(feed.url);
  const parsed = await parser.parseString(xml);
  const rawItems = parsed.items ?? [];

  const items: RawItem[] = [];
  let skipped = 0;

  for (const item of rawItems) {
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const idBasis = item.guid ?? item.link;
    // Need a title and something stable to dedupe on.
    if (!title || !idBasis) {
      skipped++;
      continue;
    }

    const bodyRaw = item.contentSnippet ?? item.content;
    const dateStr = item.isoDate ?? item.pubDate;
    const publishedAt = dateStr
      ? new Date(dateStr).toISOString()
      : new Date().toISOString();

    items.push({
      source: SOURCE,
      externalId: item.guid ?? sha256(item.link as string),
      title,
      url: item.link ?? null,
      body: bodyRaw ? truncate(bodyRaw, BODY_MAX_CHARS) : null,
      lang: feed.lang,
      categoryHint: feed.categoryHint,
      engagement: computeRssEngagement(publishedAt, feed.url),
      engagementRaw: {},
      publishedAt,
    });
  }

  return { name, items, fetched: rawItems.length, kept: items.length, skipped };
}

/**
 * Recency component of the RSS engagement proxy: fresher items score higher.
 * Returns 0-100. A missing / malformed / future date defaults to 50.
 */
export function recencyScore(publishedAt: string): number {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return 50;
  const ageHours = (Date.now() - t) / 3_600_000;
  if (ageHours < 0) return 50; // future date = wrong, default
  if (ageHours < 1) return 100;
  if (ageHours < 6) return 90;
  if (ageHours < 12) return 75;
  if (ageHours < 24) return 50;
  if (ageHours < 48) return 25;
  return 10;
}

/** RSS engagement (adapter-spec §7 v2): recency 60% + source authority 40%. */
function computeRssEngagement(publishedAt: string, feedUrl: string): number {
  const recency = recencyScore(publishedAt);
  const authority = SOURCE_AUTHORITY[feedUrl] ?? DEFAULT_AUTHORITY;
  const score = recency * RECENCY_WEIGHT + authority * AUTHORITY_WEIGHT;
  return Math.round(Math.min(100, Math.max(0, score)));
}

export const rssAdapter: SourceAdapter = {
  name: SOURCE,
  schedule: "0 * * * *", // every hour (documentation only)

  async fetch(): Promise<RawItem[]> {
    // One broken feed must not sink the others → settle each independently.
    const results = await Promise.allSettled(FEEDS.map(processFeed));

    const all: RawItem[] = [];
    let totalFetched = 0;
    let totalKept = 0;
    let totalSkipped = 0;
    let failedFeeds = 0;

    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        const { name, items, fetched, kept, skipped } = result.value;
        all.push(...items);
        totalFetched += fetched;
        totalKept += kept;
        totalSkipped += skipped;
        console.log(
          `[${SOURCE}] feed=${name} fetched=${fetched} kept=${kept} skipped=${skipped}`,
        );
      } else {
        failedFeeds++;
        console.error(
          `[${SOURCE}] feed=${feedName(FEEDS[i].url)} FAILED: ${errorMessage(result.reason)}`,
        );
      }
    });

    console.log(
      `[${SOURCE}] total fetched=${totalFetched} kept=${totalKept} skipped=${totalSkipped} failed_feeds=${failedFeeds}`,
    );
    return all;
  },
};
