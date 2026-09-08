import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { rssAdapter } from "./rss";

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

afterEach(() => {
  vi.unstubAllGlobals();
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

  it("sets engagement to a flat 50 with empty engagementRaw", async () => {
    stubFetch(() => doc(ITEM_FULL));

    const items = await rssAdapter.fetch();

    expect(
      items.every(
        (it) =>
          it.engagement === 50 && Object.keys(it.engagementRaw).length === 0,
      ),
    ).toBe(true);
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
      expect(item.engagement).toBe(50);
      expect(item.engagementRaw).toEqual({});
      expect(item.title.trim().length).toBeGreaterThan(0);
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.externalId.length).toBeGreaterThan(0);
      // publishedAt is a valid ISO 8601 timestamp
      expect(new Date(item.publishedAt).toISOString()).toBe(item.publishedAt);
    }
  });
});
