import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  runIngest: vi.fn(),
  embedPendingItems: vi.fn(),
  tryGetEmbeddingProvider: vi.fn(),
  createServiceRoleClient: vi.fn(() => ({}) as never),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ingest", () => ({ runIngest: h.runIngest }));
vi.mock("@/lib/embeddings/embed-items", () => ({ embedPendingItems: h.embedPendingItems }));
vi.mock("@/lib/supabase/service", () => ({ createServiceRoleClient: h.createServiceRoleClient }));
vi.mock("@/lib/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/embeddings")>();
  return { ...actual, tryGetEmbeddingProvider: h.tryGetEmbeddingProvider };
});

import { triggerIngest } from "./ingest";

const INGEST = { durationMs: 1, sources: [{ name: "rss", fetched: 2, inserted: 2, skipped: 0 }] };
const fakeProvider = (name: string) => ({ name, model: `${name}-model`, dimensions: 1024, embed: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  h.runIngest.mockResolvedValue(INGEST);
  h.embedPendingItems.mockResolvedValue({ candidates: 2, embedded: 2, skipped: false });
});

describe("triggerIngest provider selection", () => {
  it("uses the selected provider (jina) and only that provider", async () => {
    h.tryGetEmbeddingProvider.mockReturnValue(fakeProvider("jina"));

    const res = await triggerIngest("jina");

    expect(h.tryGetEmbeddingProvider).toHaveBeenCalledWith("jina");
    const passedProvider = h.embedPendingItems.mock.calls[0][1].provider;
    expect(passedProvider.name).toBe("jina");
    expect(res.provider).toBe("jina");
    expect(res.sources).toHaveLength(1);
  });

  it("falls back to the default provider for an unknown name", async () => {
    h.tryGetEmbeddingProvider.mockReturnValue(fakeProvider("deepinfra"));

    const res = await triggerIngest("not-a-provider");

    // resolved to the default ("deepinfra" with no EMBEDDINGS_PROVIDER set)
    expect(h.tryGetEmbeddingProvider).toHaveBeenCalledWith("deepinfra");
    expect(res.provider).toBe("deepinfra");
  });

  it("skips embedding cleanly when the selected provider has no key", async () => {
    h.tryGetEmbeddingProvider.mockReturnValue(null); // unconfigured
    h.embedPendingItems.mockResolvedValue({
      candidates: 0,
      embedded: 0,
      skipped: true,
      reason: "not configured",
    });

    const res = await triggerIngest("jina");

    expect(res.embed.skipped).toBe(true);
    expect(res.provider).toBe("jina"); // still reports the intended provider
    expect(res.sources).toHaveLength(1); // ingest still succeeded
  });
});
