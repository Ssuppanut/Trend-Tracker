import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createJinaProvider, describeJina } from "./jina";
import { EMBEDDING_DIMENSIONS, EmbeddingConfigError } from "./types";

function vec(fill: number): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(fill);
}

/** Capture request + return an OpenAI-style embeddings response. */
function stubFetch() {
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { input: string[] };
    const data = body.input.map((_t, i) => ({ index: i, embedding: vec(i) }));
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("JINA_API_KEY", "");
  vi.stubEnv("JINA_EMBEDDINGS_MODEL", "");
  vi.stubEnv("JINA_EMBEDDINGS_TASK", "");
  vi.stubEnv("JINA_API_URL", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("describeJina", () => {
  it("reports the v3 multilingual space at 1024 dims", () => {
    expect(describeJina()).toEqual({
      provider: "jina",
      model: "jina-embeddings-v3",
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });
});

describe("createJinaProvider", () => {
  it("throws EmbeddingConfigError when JINA_API_KEY is missing", () => {
    expect(() => createJinaProvider()).toThrow(EmbeddingConfigError);
  });

  it("posts to the Jina endpoint with model, task, dimensions and bearer auth", async () => {
    vi.stubEnv("JINA_API_KEY", "jina-secret");
    const fetchMock = stubFetch();
    const provider = createJinaProvider();

    const out = await provider.embed(["hello", "world"]);

    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(EMBEDDING_DIMENSIONS);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.jina.ai/v1/embeddings");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jina-secret");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "jina-embeddings-v3",
      task: "text-matching",
      dimensions: EMBEDDING_DIMENSIONS,
      input: ["hello", "world"],
    });
  });

  it("honors model/task/endpoint overrides from env", async () => {
    vi.stubEnv("JINA_API_KEY", "jina-secret");
    vi.stubEnv("JINA_EMBEDDINGS_MODEL", "jina-embeddings-v4");
    vi.stubEnv("JINA_EMBEDDINGS_TASK", "retrieval.passage");
    vi.stubEnv("JINA_API_URL", "https://proxy.example/v1/embeddings");
    const fetchMock = stubFetch();

    await createJinaProvider().embed(["x"]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proxy.example/v1/embeddings");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "jina-embeddings-v4",
      task: "retrieval.passage",
    });
  });
});
