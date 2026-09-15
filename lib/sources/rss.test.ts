import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recencyScore, rssAdapter } from "./rss";

const blognoneFixture = readFileSync(
  new URL("./__fixtures__/rss-blognone.xml", import.meta.url),
  "utf8",
);

/** Wrap item XML into a minimal RSS 2.0 document. */
function doc(itemsXml = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Test feed</title>${itemsXml}</channel></rss>`;
}

const ITEM_FULL = `<item><title>Hello World</title><link>https://example.com/a</link><guid>guid-abc</guid><description>Some body text</description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>`;

/** Stub global fetch; `handler` returns the XML for a url (or throws to fail). */
function stubFetch(handler: (url: string) => string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const xml = handler(String(input)); // may throw → feed fails
      return { ok: true, status: 200, text: async () => xml } as Response;
    }),
  );
}

/** Build an <item> with a specific pubDate. */
function itemWithDate(pubDate: string): string {
  return `<item><title>Dated</title><link>https://example.com/d</link><guid>gd</guid><description>b</description><pubDate>${pubDate}</pubDate></item>`;
}

const FIXED_NOW = new Date("2026-09-15T12:00:00Z");

beforeEach(() => {
  // Fake only Date (not setTimeout) so recency is deterministic while the
  // adapter's retry backoff still uses real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rssAdapter", () => {
  it("uses item.guid as externalId when present", async () => {
    stubFetch(() => doc(ITEM_FULL));

    const items = await rssAdapter.fetch();

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((it) => it.externalId === "guid-abc")).toBe(true);
  });

  it("falls back to sha256(link) as externalId when guid is missing", async () => {
    const noGuid = `<item><title>No Guid</title><link>https://example.com/x</link><description>b</description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>`;
    stubFetch(() => doc(noGuid));

    const items = await rssAdapter.fetch();
    const expected = createHash("sha256")
      .update("https://example.com/x")
      .digest("hex");

    expect(items[0].externalId).toBe(expected);
  });

  it("skips items without a title", async () => {
    const noTitle = `<item><link>https://example.com/n</link><guid>no-title</guid><description>x</description></item>`;
    stubFetch(() => doc(ITEM_FULL + noTitle));

    const items = await rssAdapter.fetch();

    // 10 feeds × 1 valid item each; the untitled one is dropped everywhere.
    expect(items).toHaveLength(10);
    expect(items.every((it) => it.title.trim().length > 0)).toBe(true);
    expect(items.some((it) => it.externalId === "no-title")).toBe(false);
  });

  it("truncates body to 2000 chars", async () => {
    const long = `<item><title>Long</title><link>https://example.com/l</link><guid>g</guid><description>${"a".repeat(2500)}</description></item>`;
    stubFetch(() => doc(long));

    const [item] = await rssAdapter.fetch();

    expect(item.body).toHaveLength(2000);
  });

  it("keeps other feeds working when one feed fails", async () => {
    // coindesk is the only 'crypto' feed — fail it, expect the other 9 to survive.
    stubFetch((url) => {
      if (url.includes("coindesk")) throw new Error("HTTP 503");
      return doc(ITEM_FULL);
    });

    const items = await rssAdapter.fetch();

    expect(items).toHaveLength(9);
    expect(items.some((it) => it.categoryHint === "crypto")).toBe(false);
  });

  it("computes engagement from recency + authority (0-100, empty raw), not a flat 50", async () => {
    stubFetch(() => doc(ITEM_FULL)); // same old-dated item across all 10 feeds

    const items = await rssAdapter.fetch();

    for (const it of items) {
      expect(it.engagement).toBeGreaterThanOrEqual(0);
      expect(it.engagement).toBeLessThanOrEqual(100);
      expect(it.engagementRaw).toEqual({});
    }
    // Same recency everywhere (old item) but authority differs per feed, so
    // engagement spreads across more than one value — no longer a flat 50.
    expect(new Set(items.map((it) => it.engagement)).size).toBeGreaterThan(1);
  });

  it("maps lang and categoryHint from each feed's config", async () => {
    stubFetch(() => doc(ITEM_FULL)); // one item per feed → one RawItem per feed

    const items = await rssAdapter.fetch();

    const langCount = { th: 0, en: 0 };
    const catCount: Record<string, number> = {};
    for (const it of items) {
      langCount[it.lang]++;
      catCount[it.categoryHint as string] =
        (catCount[it.categoryHint as string] ?? 0) + 1;
    }

    expect(langCount).toEqual({ th: 5, en: 5 });
    expect(catCount).toEqual({ "tech-ai": 5, news: 4, crypto: 1 });
  });

  it("maps every field correctly from the real blognone fixture", async () => {
    // Only blognone returns the fixture; other feeds return an empty channel.
    stubFetch((url) => (url.includes("blognone.com") ? blognoneFixture : doc()));

    const items = await rssAdapter.fetch();

    expect(items).toHaveLength(5);
    for (const item of items) {
      expect(item.source).toBe("rss");
      expect(item.lang).toBe("th");
      expect(item.categoryHint).toBe("tech-ai");
      expect(item.engagement).toBeGreaterThanOrEqual(0);
      expect(item.engagement).toBeLessThanOrEqual(100);
      expect(item.engagementRaw).toEqual({});
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.externalId.length).toBeGreaterThan(0);
      // publishedAt is a valid ISO 8601 timestamp
      expect(new Date(item.publishedAt).toISOString()).toBe(item.publishedAt);
    }
  });

  // --- engagement v2: recency + source authority ---

  it("recencyScore: 30 min ago = 100", () => {
    const iso = new Date(Date.now() - 30 * 60_000).toISOString();
    expect(recencyScore(iso)).toBe(100);
  });

  it("recencyScore: 3 days ago = 10", () => {
    const iso = new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
    expect(recencyScore(iso)).toBe(10);
  });

  it("recencyScore: invalid date = 50", () => {
    expect(recencyScore("not-a-date")).toBe(50);
    expect(recencyScore("")).toBe(50);
  });

  it("engagement: TechCrunch 30 min ago = 96 (100×0.6 + 90×0.4)", async () => {
    const pubDate = new Date(Date.now() - 30 * 60_000).toUTCString();
    stubFetch((url) =>
      url.includes("techcrunch.com") ? doc(itemWithDate(pubDate)) : doc(),
    );

    const items = await rssAdapter.fetch();

    expect(items).toHaveLength(1);
    expect(items[0].engagement).toBe(96);
  });

  it("engagement: Marketeer ~36h ago = 37 (25×0.6 + 55×0.4)", async () => {
    // 24-48h old → recency bucket 25; Marketeer authority 55.
    const pubDate = new Date(Date.now() - 36 * 3_600_000).toUTCString();
    stubFetch((url) =>
      url.includes("marketeeronline.co") ? doc(itemWithDate(pubDate)) : doc(),
    );

    const items = await rssAdapter.fetch();

    expect(items).toHaveLength(1);
    expect(items[0].engagement).toBe(37);
  });
});
