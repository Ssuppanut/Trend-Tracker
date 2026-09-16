import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDeepInfraProvider } from "./deepinfra";
import { getEmbeddingProvider, tryGetEmbeddingProvider } from "./index";
import { EMBEDDING_DIMENSIONS, EmbeddingConfigError } from "./types";

/** A valid-shape embedding filled with a marker value. */
function vec(fill: number): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(fill);
}

/**
 * Stub fetch with an OpenAI-compatible embeddings response. `data` is built
 * from the request's `input` length so batching is observable. `indexFn` lets a
 * test scramble the returned `index` order to prove the provider re-sorts.
 */
function stubEmbeddingsFetch(indexFn: (i: number, n: number) => number = (i) => i) {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    const n = body.input.length;
    const data = body.input.map((_text, i) => ({
      index: indexFn(i, n),
      // Encode the (global-agnostic) position via fill so order is checkable.
      embedding: vec(indexFn(i, n)),
    }));
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("EMBEDDINGS_PROVIDER", "");
  vi.stubEnv("DEEPINFRA_API_KEY", "");
  vi.stubEnv("EMBEDDINGS_API_KEY", "");
  vi.stubEnv("EMBEDDINGS_API_URL", "");
  vi.stubEnv("EMBEDDINGS_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("provider factory", () => {
  it("tryGetEmbeddingProvider returns null when no key is configured", () => {
    expect(tryGetEmbeddingProvider()).toBeNull();
  });

  it("getEmbeddingProvider throws EmbeddingConfigError when no key is set", () => {
    expect(() => getEmbeddingProvider()).toThrow(EmbeddingConfigError);
  });

  it("throws EmbeddingConfigError for an unknown provider name", () => {
    vi.stubEnv("EMBEDDINGS_PROVIDER", "nope");
    expect(() => getEmbeddingProvider()).toThrow(/Unknown EMBEDDINGS_PROVIDER/);
  });

  it("builds a DeepInfra provider when a key is present", () => {
    vi.stubEnv("DEEPINFRA_API_KEY", "sk-test");
    const provider = getEmbeddingProvider();
    expect(provider.name).toBe("deepinfra");
    expect(provider.model).toBe("BAAI/bge-m3");
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("falls back to EMBEDDINGS_API_KEY for the key", () => {
    vi.stubEnv("EMBEDDINGS_API_KEY", "sk-generic");
    expect(() => createDeepInfraProvider()).not.toThrow();
  });
});

describe("DeepInfra embed()", () => {
  it("returns one vector per input, in input order (re-sorting by index)", async () => {
    vi.stubEnv("DEEPINFRA_API_KEY", "sk-test");
    // Reverse the reported index so a naive impl would return them backwards.
    stubEmbeddingsFetch((i, n) => n - 1 - i);
    const provider = createDeepInfraProvider();

    const out = await provider.embed(["a", "b", "c"]);

    expect(out).toHaveLength(3);
    // After re-sorting by index, position 0 must be the vector with index 0.
    expect(out[0][0]).toBe(0);
    expect(out[1][0]).toBe(1);
    expect(out[2][0]).toBe(2);
    expect(out.every((v) => v.length === EMBEDDING_DIMENSIONS)).toBe(true);
  });

  it("returns [] and makes no request for empty input", async () => {
    vi.stubEnv("DEEPINFRA_API_KEY", "sk-test");
    const fetchMock = stubEmbeddingsFetch();
    const provider = createDeepInfraProvider();

    expect(await provider.embed([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("splits large inputs into multiple batched requests", async () => {
    vi.stubEnv("DEEPINFRA_API_KEY", "sk-test");
    const fetchMock = stubEmbeddingsFetch();
    const provider = createDeepInfraProvider();

    const texts = Array.from({ length: 150 }, (_, i) => `t${i}`);
    const out = await provider.embed(texts);

    expect(out).toHaveLength(150);
    // 150 items / MAX_BATCH(100) = 2 requests.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws when the response vector has the wrong dimensions", async () => {
    vi.stubEnv("DEEPINFRA_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ index: 0, embedding: [1, 2, 3] }] }),
      })) as unknown as typeof fetch,
    );
    const provider = createDeepInfraProvider();

    await expect(provider.embed(["a"])).rejects.toThrow(/wrong shape/);
  });

  it("retries once on a failed request, then succeeds", async () => {
    vi.stubEnv("DEEPINFRA_API_KEY", "sk-test");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) return { ok: false, status: 503, text: async () => "busy" } as Response;
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ index: 0, embedding: vec(7) }] }),
        } as Response;
      }),
    );
    const provider = createDeepInfraProvider();

    const out = await provider.embed(["a"]);
    expect(out[0][0]).toBe(7);
    expect(calls).toBe(2);
  });
});
