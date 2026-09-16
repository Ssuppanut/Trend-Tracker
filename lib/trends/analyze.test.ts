import { describe, expect, it } from "vitest";

import { describeProvider } from "@/lib/embeddings";

import { runAnalyze } from "./analyze";

const NOW = new Date("2026-09-15T12:00:00.000Z").getTime();
const HOUR = 3_600_000;
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * HOUR).toISOString();

// Active space these tests operate in (providerName: "deepinfra" below).
const SPACE = describeProvider("deepinfra");

interface RawRow {
  id: number;
  source: string;
  engagement: number;
  published_at: string;
  lang: string;
  category_hint: string | null;
  title: string;
  embedding: string;
  embedding_provider: string | null;
  embedding_model: string | null;
}

function rawRow(id: number, embedding: string, over: Partial<RawRow> = {}): RawRow {
  return {
    id,
    source: over.source ?? "rss",
    engagement: over.engagement ?? 50,
    published_at: over.published_at ?? iso(1),
    lang: over.lang ?? "en",
    category_hint: over.category_hint ?? "tech-ai",
    title: over.title ?? `item-${id}`,
    embedding,
    embedding_provider: over.embedding_provider ?? SPACE.provider,
    embedding_model: over.embedding_model ?? SPACE.model,
  };
}

type ExistingTrendRow = {
  id: number;
  centroid: string | null;
  embedding_provider: string | null;
  embedding_model: string | null;
};

interface Fixtures {
  unclustered?: RawRow[];
  unclusteredError?: { message: string } | null;
  existingTrends?: ExistingTrendRow[];
  membersByTrend?: Record<number, RawRow[]>;
  snapshotsByTrend?: Record<number, Array<{ volume_24h: number }>>;
  startTrendId?: number;
}

/** Existing-trend fixture in the active space by default. */
function existingTrend(id: number, centroid: string, over: Partial<ExistingTrendRow> = {}): ExistingTrendRow {
  return {
    id,
    centroid,
    embedding_provider: over.embedding_provider ?? SPACE.provider,
    embedding_model: over.embedding_model ?? SPACE.model,
  };
}

/** Table-dispatching Supabase mock covering exactly the analyze query shapes. */
function makeSupabase(fx: Fixtures) {
  const rec = {
    trendInserts: [] as Array<{ id: number; row: Record<string, unknown> }>,
    trendUpdates: [] as Array<{ id: number; row: Record<string, unknown> }>,
    snapshots: [] as Array<Record<string, unknown>>,
    trendIdSets: [] as Array<{ ids: number[]; trendId: number }>,
  };
  let seq = fx.startTrendId ?? 500;

  function from(table: string) {
    const methods: Array<{ m: string; [k: string]: unknown }> = [];
    let payload: Record<string, unknown> | undefined;
    const has = (m: string) => methods.some((x) => x.m === m);
    const get = (m: string) => methods.find((x) => x.m === m);

    function resolve(): { data?: unknown; error: { message: string } | null } {
      if (table === "raw_items") {
        if (has("select") && has("is"))
          return { data: fx.unclustered ?? [], error: fx.unclusteredError ?? null };
        if (has("select") && has("eq")) {
          const tid = get("eq")!.val as number;
          return { data: fx.membersByTrend?.[tid] ?? [], error: null };
        }
        if (has("update")) {
          rec.trendIdSets.push({
            ids: get("in")!.vals as number[],
            trendId: payload!.trend_id as number,
          });
          return { error: null };
        }
      }
      if (table === "trends") {
        if (has("insert")) {
          const id = seq++;
          rec.trendInserts.push({ id, row: payload! });
          return { data: { id }, error: null };
        }
        if (has("update")) {
          rec.trendUpdates.push({ id: get("eq")!.val as number, row: payload! });
          return { error: null };
        }
        if (has("select")) return { data: fx.existingTrends ?? [], error: null };
      }
      if (table === "trend_snapshots") {
        if (has("insert")) {
          rec.snapshots.push(payload!);
          return { error: null };
        }
        if (has("select")) {
          const tid = get("eq")!.val as number;
          return { data: fx.snapshotsByTrend?.[tid] ?? [], error: null };
        }
      }
      return { data: null, error: null };
    }

    const chain = {
      select(cols: string) {
        methods.push({ m: "select", cols });
        return chain;
      },
      insert(p: Record<string, unknown>) {
        methods.push({ m: "insert" });
        payload = p;
        return chain;
      },
      update(p: Record<string, unknown>) {
        methods.push({ m: "update" });
        payload = p;
        return chain;
      },
      is(col: string, val: unknown) {
        methods.push({ m: "is", col, val });
        return chain;
      },
      not(col: string, op: string, val: unknown) {
        methods.push({ m: "not", col, op, val });
        return chain;
      },
      in(col: string, vals: unknown) {
        methods.push({ m: "in", col, vals });
        return chain;
      },
      eq(col: string, val: unknown) {
        methods.push({ m: "eq", col, val });
        return chain;
      },
      gte(col: string, val: unknown) {
        methods.push({ m: "gte", col, val });
        return chain;
      },
      order(col: string) {
        methods.push({ m: "order", col });
        return chain;
      },
      limit(n: number) {
        methods.push({ m: "limit", n });
        return Promise.resolve(resolve());
      },
      single() {
        methods.push({ m: "single" });
        return Promise.resolve(resolve());
      },
      then<T>(onF: (v: unknown) => T, onR?: (e: unknown) => T) {
        return Promise.resolve(resolve()).then(onF, onR);
      },
    };
    return chain;
  }

  return { client: { from } as never, rec };
}

const OPTS = {
  provider: null,
  providerName: "deepinfra",
  now: NOW,
  threshold: 0.6,
  minClusterSize: 2,
} as const;

describe("runAnalyze", () => {
  it("creates a trend from a cluster of similar unclustered items", async () => {
    const sb = makeSupabase({
      unclustered: [
        rawRow(1, "[1,0]", { engagement: 80 }),
        rawRow(2, "[0.98,0.02]", { engagement: 70, source: "hackernews" }),
        rawRow(3, "[0,1]"), // dissimilar singleton -> not a trend
      ],
      existingTrends: [],
    });

    const res = await runAnalyze({ ...OPTS, supabase: sb.client });

    expect(res.embed.skipped).toBe(true);
    expect(res.itemsConsidered).toBe(3);
    expect(res.trendsCreated).toBe(1);
    expect(res.trendsUpdated).toBe(0);
    expect(res.itemsClustered).toBe(2);

    expect(sb.rec.trendInserts).toHaveLength(1);
    const inserted = sb.rec.trendInserts[0];
    expect(inserted.row.summary).toBeNull(); // LLM deferred
    expect(inserted.row.centroid).toBe("[0.99,0.01]"); // mean of the pair
    expect(inserted.row.source_count).toBe(2);
    // new trend is tagged with the active space
    expect(inserted.row.embedding_provider).toBe(SPACE.provider);
    expect(inserted.row.embedding_model).toBe(SPACE.model);
    expect(res.provider).toBe("deepinfra");

    // members 1 & 2 got the new trend id; snapshot written
    expect(sb.rec.trendIdSets).toHaveLength(1);
    expect(sb.rec.trendIdSets[0].ids.sort()).toEqual([1, 2]);
    expect(sb.rec.trendIdSets[0].trendId).toBe(inserted.id);
    expect(sb.rec.snapshots).toHaveLength(1);
    expect(sb.rec.snapshots[0].trend_id).toBe(inserted.id);
  });

  it("attaches a new item to an existing trend and recomputes it", async () => {
    const sb = makeSupabase({
      unclustered: [rawRow(5, "[1,0]", { source: "hackernews", engagement: 90 })],
      existingTrends: [existingTrend(100, "[1,0]")],
      membersByTrend: {
        100: [rawRow(1, "[1,0]", { source: "rss", engagement: 50, published_at: iso(2) })],
      },
      snapshotsByTrend: { 100: [] },
    });

    const res = await runAnalyze({ ...OPTS, supabase: sb.client });

    expect(res.trendsCreated).toBe(0);
    expect(res.trendsUpdated).toBe(1);
    expect(res.itemsClustered).toBe(1);

    expect(sb.rec.trendInserts).toHaveLength(0);
    expect(sb.rec.trendUpdates).toHaveLength(1);
    expect(sb.rec.trendUpdates[0].id).toBe(100);
    expect(sb.rec.trendUpdates[0].row.centroid).toBe("[1,0]"); // mean of two [1,0]
    expect(sb.rec.trendUpdates[0].row.source_count).toBe(2); // rss + hackernews

    // only the new item (id 5) gets its trend_id set
    expect(sb.rec.trendIdSets).toHaveLength(1);
    expect(sb.rec.trendIdSets[0]).toEqual({ ids: [5], trendId: 100 });
    expect(sb.rec.snapshots).toHaveLength(1);
  });

  it("does nothing when there are no unclustered items", async () => {
    const sb = makeSupabase({ unclustered: [], existingTrends: [] });

    const res = await runAnalyze({ ...OPTS, supabase: sb.client });

    expect(res).toMatchObject({ itemsConsidered: 0, trendsCreated: 0, trendsUpdated: 0 });
    expect(sb.rec.trendInserts).toHaveLength(0);
  });

  it("never mixes embedding spaces: items from another provider are excluded", async () => {
    const sb = makeSupabase({
      // Two similar vectors, but one is a Jina-space item — only the two
      // active-space (deepinfra) items may form a trend.
      unclustered: [
        rawRow(1, "[1,0]"),
        rawRow(2, "[0.98,0.02]"),
        rawRow(3, "[0.99,0.01]", { embedding_provider: "jina", embedding_model: "jina-embeddings-v3" }),
      ],
      existingTrends: [],
    });

    const res = await runAnalyze({ ...OPTS, supabase: sb.client });

    expect(res.itemsConsidered).toBe(2); // the jina item was filtered out
    expect(res.trendsCreated).toBe(1);
    expect(sb.rec.trendIdSets[0].ids.sort()).toEqual([1, 2]); // never id 3
  });

  it("reports a load error without throwing", async () => {
    const sb = makeSupabase({ unclusteredError: { message: "db down" } });

    const res = await runAnalyze({ ...OPTS, supabase: sb.client });

    expect(res.error).toMatch(/load unclustered failed: db down/);
    expect(res.trendsCreated).toBe(0);
  });
});
