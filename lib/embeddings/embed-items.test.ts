import { describe, expect, it, vi } from "vitest";

import { embedPendingItems } from "./embed-items";
import type { EmbeddingProvider } from "./types";

type Row = { id: number; title: string; body: string | null };

/** Provider stub whose embed() returns a fixed set of vectors. */
function fakeProvider(
  vectors: number[][] | (() => Promise<number[][]>),
): EmbeddingProvider {
  return {
    name: "fake",
    model: "fake-model",
    dimensions: 2,
    embed: vi.fn(async (texts: string[]) =>
      typeof vectors === "function" ? vectors() : vectors.slice(0, texts.length),
    ),
  };
}

/**
 * Chainable Supabase mock.
 * - read:  from().select().is().order().limit() -> { data, error }
 * - write: from().update().eq()                 -> { error }
 */
function makeSupabase(opts: {
  selectResult: { data: Row[] | null; error: { message: string } | null };
  updateErrors?: Array<{ message: string } | null>;
}) {
  const limit = vi.fn(async () => opts.selectResult);
  const order = vi.fn(() => ({ limit }));
  const is = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ is }));

  let updateCall = 0;
  const eq = vi.fn(async () => {
    const err = opts.updateErrors?.[updateCall] ?? null;
    updateCall++;
    return { error: err };
  });
  const update = vi.fn(() => ({ eq }));

  const from = vi.fn(() => ({ select, update }));
  return { client: { from } as never, from, select, is, order, limit, update, eq };
}

describe("embedPendingItems", () => {
  it("skips cleanly (no DB access) when no provider is configured", async () => {
    const sb = makeSupabase({ selectResult: { data: [], error: null } });

    const res = await embedPendingItems(sb.client, { provider: null });

    expect(res.skipped).toBe(true);
    expect(res.embedded).toBe(0);
    expect(res.reason).toMatch(/not configured/);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it("returns zero candidates when nothing needs embedding", async () => {
    const sb = makeSupabase({ selectResult: { data: [], error: null } });

    const res = await embedPendingItems(sb.client, { provider: fakeProvider([]) });

    expect(res).toMatchObject({ candidates: 0, embedded: 0, skipped: false });
    expect(sb.update).not.toHaveBeenCalled();
  });

  it("embeds pending rows and writes vectors back as pgvector literals", async () => {
    const rows: Row[] = [
      { id: 10, title: "A", body: "abody" },
      { id: 20, title: "B", body: null },
    ];
    const sb = makeSupabase({ selectResult: { data: rows, error: null } });
    const provider = fakeProvider([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const NOW = new Date("2026-09-15T12:00:00.000Z").getTime();
    const res = await embedPendingItems(sb.client, { provider, now: NOW });

    expect(res).toMatchObject({ candidates: 2, embedded: 2, skipped: false });
    // provider saw composed inputs (title + body)
    expect(provider.embed).toHaveBeenCalledWith(["A\n\nabody", "B"]);
    // write-backs carry the vector literal + full space provenance
    const meta = {
      embedding_provider: "fake",
      embedding_model: "fake-model",
      embedding_dim: 2,
      embedding_generated_at: "2026-09-15T12:00:00.000Z",
    };
    expect(sb.update).toHaveBeenNthCalledWith(1, { embedding: "[0.1,0.2]", ...meta });
    expect(sb.update).toHaveBeenNthCalledWith(2, { embedding: "[0.3,0.4]", ...meta });
    expect(sb.eq).toHaveBeenCalledWith("id", 10);
    expect(sb.eq).toHaveBeenCalledWith("id", 20);
  });

  it("reports a DB read error without throwing", async () => {
    const sb = makeSupabase({
      selectResult: { data: null, error: { message: "boom" } },
    });

    const res = await embedPendingItems(sb.client, { provider: fakeProvider([]) });

    expect(res).toMatchObject({ embedded: 0, skipped: false, error: "boom" });
  });

  it("reports a provider failure and writes nothing", async () => {
    const rows: Row[] = [{ id: 1, title: "A", body: null }];
    const sb = makeSupabase({ selectResult: { data: rows, error: null } });
    const provider = fakeProvider(async () => {
      throw new Error("429 rate limited");
    });

    const res = await embedPendingItems(sb.client, { provider });

    expect(res.embedded).toBe(0);
    expect(res.error).toMatch(/embed failed: 429/);
    expect(sb.update).not.toHaveBeenCalled();
  });

  it("errors when the provider returns the wrong number of vectors", async () => {
    const rows: Row[] = [
      { id: 1, title: "A", body: null },
      { id: 2, title: "B", body: null },
    ];
    const sb = makeSupabase({ selectResult: { data: rows, error: null } });
    // one vector for two rows
    const provider = fakeProvider(async () => [[0.1, 0.2]]);

    const res = await embedPendingItems(sb.client, { provider });

    expect(res.embedded).toBe(0);
    expect(res.error).toMatch(/returned 1 vectors for 2 rows/);
  });

  it("counts only successful write-backs", async () => {
    const rows: Row[] = [
      { id: 1, title: "A", body: null },
      { id: 2, title: "B", body: null },
    ];
    const sb = makeSupabase({
      selectResult: { data: rows, error: null },
      updateErrors: [null, { message: "conflict" }],
    });
    const provider = fakeProvider([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const res = await embedPendingItems(sb.client, { provider });

    expect(res).toMatchObject({ candidates: 2, embedded: 1, skipped: false });
  });
});
