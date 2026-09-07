import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "./__fixtures__/hackernews.json";
import { hackerNewsAdapter } from "./hackernews";

/** Stub the global fetch with a single JSON response ({ hits }). */
function stubHnResponse(hits: unknown[], ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status: ok ? 200 : 500,
      json: async () => ({ hits }),
    })),
  );
}

/** Minimal valid hit; override fields per test. */
function hit(overrides: Record<string, unknown> = {}) {
  return {
    objectID: "1",
    title: "A title",
    url: "https://example.com",
    story_text: null,
    points: 0,
    num_comments: 0,
    created_at_i: 1_700_000_000,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hackerNewsAdapter", () => {
  it("weights raw_score as points + comments * 2", async () => {
    stubHnResponse([
      hit({ objectID: "a", points: 10, num_comments: 0 }), // raw 10
      hit({ objectID: "b", points: 0, num_comments: 5 }), // raw 10 (5*2)
      hit({ objectID: "c", points: 0, num_comments: 0 }), // raw 0
    ]);

    const items = await hackerNewsAdapter.fetch();
    const byId = Object.fromEntries(items.map((it) => [it.externalId, it]));

    // a and b have equal raw_score (proves comments are doubled) ...
    expect(byId.a.engagement).toBe(byId.b.engagement);
    // ... and both rank above c, which has the lowest raw_score.
    expect(byId.a.engagement).toBeGreaterThan(byId.c.engagement);
    // raw metrics are preserved untouched.
    expect(byId.b.engagementRaw).toEqual({ points: 0, comments: 5 });
  });

  it("falls back to the HN item URL when url is null", async () => {
    stubHnResponse([
      hit({ objectID: "999", url: null }),
      hit({ objectID: "111", url: "https://real.example/post" }),
    ]);

    const items = await hackerNewsAdapter.fetch();
    const byId = Object.fromEntries(items.map((it) => [it.externalId, it]));

    expect(byId["999"].url).toBe(
      "https://news.ycombinator.com/item?id=999",
    );
    expect(byId["111"].url).toBe("https://real.example/post");
  });

  it("skips items without a title", async () => {
    stubHnResponse([
      hit({ objectID: "keep", title: "Has title" }),
      hit({ objectID: "drop1", title: null, story_title: null }),
      hit({ objectID: "drop2", title: "   " }), // whitespace-only
    ]);

    const items = await hackerNewsAdapter.fetch();

    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe("keep");
  });

  it("uses story_title as a title fallback", async () => {
    stubHnResponse([hit({ objectID: "s", title: null, story_title: "Ask HN" })]);

    const items = await hackerNewsAdapter.fetch();

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Ask HN");
  });

  it("truncates body to 2000 chars", async () => {
    stubHnResponse([hit({ story_text: "x".repeat(2500) })]);

    const [item] = await hackerNewsAdapter.fetch();

    expect(item.body).toHaveLength(2000);
  });

  it("returns [] instead of throwing when fetch fails on both attempts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const items = await hackerNewsAdapter.fetch();

    expect(items).toEqual([]);
  });

  it("maps the real fixture with engagement spread across 0-100", async () => {
    stubHnResponse((fixture as { hits: unknown[] }).hits);

    const items = await hackerNewsAdapter.fetch();

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.source).toBe("hackernews");
      expect(item.lang).toBe("en");
      expect(item.categoryHint).toBe("tech-ai");
      expect(item.engagement).toBeGreaterThanOrEqual(0);
      expect(item.engagement).toBeLessThanOrEqual(100);
      // publishedAt is a valid ISO 8601 timestamp
      expect(new Date(item.publishedAt).toISOString()).toBe(item.publishedAt);
    }
    // more than one distinct engagement value → the percentile actually spreads
    expect(new Set(items.map((it) => it.engagement)).size).toBeGreaterThan(1);
  });
});
