import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RawItem } from "@/lib/sources/base";

const h = vi.hoisted(() => ({
  hnFetch: vi.fn(),
  rssFetch: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/sources/hackernews", () => ({
  hackerNewsAdapter: {
    name: "hackernews",
    schedule: "0 */2 * * *",
    fetch: h.hnFetch,
  },
}));
vi.mock("@/lib/sources/rss", () => ({
  rssAdapter: { name: "rss", schedule: "0 * * * *", fetch: h.rssFetch },
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceRoleClient: h.createClient,
}));

import { GET } from "./route";

const SECRET = "test-secret";

function sampleItem(source: string, externalId: string): RawItem {
  return {
    source,
    externalId,
    title: "Title",
    url: "https://example.com",
    body: null,
    lang: "en",
    categoryHint: "tech-ai",
    engagement: 50,
    engagementRaw: {},
    publishedAt: "2024-01-01T00:00:00.000Z",
  };
}

/** Chainable Supabase mock: from().upsert().select() → { data, error }. */
function makeSupabase() {
  const select = vi.fn(async () => ({ data: [{ id: 1 }], error: null }));
  const upsert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ upsert }));
  return { client: { from }, from, upsert, select };
}

function request(auth?: string): Request {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("http://localhost/api/cron/ingest", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

describe("GET /api/cron/ingest", () => {
  it("returns 401 when the authorization header is missing", async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(h.createClient).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret is wrong", async () => {
    const res = await GET(request("Bearer wrong-secret"));

    expect(res.status).toBe(401);
    expect(h.hnFetch).not.toHaveBeenCalled();
  });

  it("returns 200 with the expected response shape when authorized", async () => {
    h.hnFetch.mockResolvedValue([sampleItem("hackernews", "hn1")]);
    h.rssFetch.mockResolvedValue([
      sampleItem("rss", "r1"),
      sampleItem("rss", "r2"),
    ]);
    h.createClient.mockReturnValue(makeSupabase().client);

    const res = await GET(request(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.durationMs).toBe("number");
    expect(body.sources).toHaveLength(2);

    const hn = body.sources.find((s: { name: string }) => s.name === "hackernews");
    const rss = body.sources.find((s: { name: string }) => s.name === "rss");
    // select mock returns one inserted row per upsert call.
    expect(hn).toMatchObject({ fetched: 1, inserted: 1, skipped: 0 });
    expect(rss).toMatchObject({ fetched: 2, inserted: 1, skipped: 1 });
  });

  it("upserts mapped rows with on-conflict-do-nothing", async () => {
    h.hnFetch.mockResolvedValue([sampleItem("hackernews", "hn1")]);
    h.rssFetch.mockResolvedValue([]);
    const sb = makeSupabase();
    h.createClient.mockReturnValue(sb.client);

    await GET(request(`Bearer ${SECRET}`));

    expect(sb.from).toHaveBeenCalledWith("raw_items");
    const [rows, opts] = sb.upsert.mock.calls[0];
    expect(opts).toMatchObject({
      onConflict: "source,external_id",
      ignoreDuplicates: true,
    });
    expect(rows[0]).toMatchObject({
      source: "hackernews",
      external_id: "hn1", // mapped from RawItem.externalId
      category_hint: "tech-ai",
      engagement_raw: {},
    });
  });

  it("reports a per-adapter error without failing the whole run", async () => {
    h.hnFetch.mockResolvedValue([sampleItem("hackernews", "hn1")]);
    h.rssFetch.mockRejectedValue(new Error("boom"));
    h.createClient.mockReturnValue(makeSupabase().client);

    const res = await GET(request(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    const rss = body.sources.find((s: { name: string }) => s.name === "rss");
    expect(rss.error).toBe("boom");
    const hn = body.sources.find((s: { name: string }) => s.name === "hackernews");
    expect(hn).toMatchObject({ inserted: 1 });
  });
});
