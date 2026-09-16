import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  describeProvider,
  EMBEDDING_DIMENSIONS,
  EmbeddingConfigError,
  getEmbeddingProvider,
  isEmbeddingProviderName,
  isProviderConfigured,
  resolveProviderName,
  tryGetEmbeddingProvider,
} from "./index";

function vec(fill: number): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(fill);
}

beforeEach(() => {
  vi.stubEnv("EMBEDDINGS_PROVIDER", "");
  vi.stubEnv("DEEPINFRA_API_KEY", "");
  vi.stubEnv("EMBEDDINGS_API_KEY", "");
  vi.stubEnv("JINA_API_KEY", "");
  vi.stubEnv("EMBEDDINGS_MODEL", "");
  vi.stubEnv("DEEPINFRA_EMBEDDINGS_MODEL", "");
  vi.stubEnv("JINA_EMBEDDINGS_MODEL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("provider name resolution", () => {
  it("recognizes known names", () => {
    expect(isEmbeddingProviderName("jina")).toBe(true);
    expect(isEmbeddingProviderName("deepinfra")).toBe(true);
    expect(isEmbeddingProviderName("openai")).toBe(false);
  });

  it("defaults to deepinfra when nothing is configured", () => {
    expect(resolveProviderName()).toBe("deepinfra");
  });

  it("uses EMBEDDINGS_PROVIDER as the default", () => {
    vi.stubEnv("EMBEDDINGS_PROVIDER", "jina");
    expect(resolveProviderName()).toBe("jina");
  });

  it("lets an explicit name override the env default", () => {
    vi.stubEnv("EMBEDDINGS_PROVIDER", "jina");
    expect(resolveProviderName("deepinfra")).toBe("deepinfra");
  });

  it("throws on an explicit unknown name", () => {
    expect(() => resolveProviderName("bogus")).toThrow(EmbeddingConfigError);
  });
});

describe("describeProvider", () => {
  it("returns each provider's space without needing a key", () => {
    expect(describeProvider("jina")).toEqual({
      provider: "jina",
      model: "jina-embeddings-v3",
      dimensions: EMBEDDING_DIMENSIONS,
    });
    expect(describeProvider("deepinfra")).toEqual({
      provider: "deepinfra",
      model: "BAAI/bge-m3",
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });
});

describe("isProviderConfigured", () => {
  it("reflects key presence per provider", () => {
    expect(isProviderConfigured("jina")).toBe(false);
    expect(isProviderConfigured("deepinfra")).toBe(false);
    vi.stubEnv("JINA_API_KEY", "k");
    vi.stubEnv("DEEPINFRA_API_KEY", "k");
    expect(isProviderConfigured("jina")).toBe(true);
    expect(isProviderConfigured("deepinfra")).toBe(true);
  });
});

describe("getEmbeddingProvider selects only the requested vendor", () => {
  it("calls the Jina endpoint (not DeepInfra) when jina is selected", async () => {
    vi.stubEnv("JINA_API_KEY", "jina-key");
    vi.stubEnv("DEEPINFRA_API_KEY", "di-key");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ index: 0, embedding: vec(1) }] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const provider = getEmbeddingProvider("jina");
    expect(provider.name).toBe("jina");
    await provider.embed(["hi"]);

    const url = String((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).toContain("api.jina.ai");
    expect(url).not.toContain("deepinfra.com");
  });

  it("returns null from tryGet when the selected provider has no key", () => {
    expect(tryGetEmbeddingProvider("jina")).toBeNull();
    vi.stubEnv("JINA_API_KEY", "jina-key");
    expect(tryGetEmbeddingProvider("jina")?.name).toBe("jina");
  });
});
