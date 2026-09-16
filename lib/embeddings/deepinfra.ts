import {
  EMBEDDING_DIMENSIONS,
  EmbeddingConfigError,
  type EmbeddingProvider,
  type EmbeddingVector,
} from "./types";

/**
 * DeepInfra embedding provider (bge-m3, 1024 dims).
 *
 * Uses DeepInfra's OpenAI-compatible embeddings endpoint, so swapping to any
 * other OpenAI-compatible host later is just an env change (`EMBEDDINGS_API_URL`
 * + key). bge-m3 is multilingual (strong Thai + English) and emits exactly
 * 1024 dims, matching the `vector(1024)` schema with no migration.
 *
 * Cost at this project's volume is ~$0.01 / 1M tokens (negligible). Requires
 * `api.deepinfra.com` on the sandbox egress allowlist before a live run.
 */

const DEFAULT_ENDPOINT = "https://api.deepinfra.com/v1/openai/embeddings";
const DEFAULT_MODEL = "BAAI/bge-m3";
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 1_000;
/** DeepInfra accepts large batches; keep it modest to bound request size. */
const MAX_BATCH = 100;

interface DeepInfraConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

/**
 * Read config from env. Key resolves from `DEEPINFRA_API_KEY` first, then the
 * generic `EMBEDDINGS_API_KEY` (so the generic slot works for any provider).
 * Throws `EmbeddingConfigError` when no key is set — the signal the pipeline
 * uses to skip embedding cleanly rather than fake it.
 */
function readConfig(): DeepInfraConfig {
  const apiKey =
    process.env.DEEPINFRA_API_KEY?.trim() ||
    process.env.EMBEDDINGS_API_KEY?.trim() ||
    "";
  if (!apiKey) {
    throw new EmbeddingConfigError(
      "DeepInfra embeddings not configured: set DEEPINFRA_API_KEY (or EMBEDDINGS_API_KEY) in the environment.",
    );
  }
  return {
    apiKey,
    endpoint: process.env.EMBEDDINGS_API_URL?.trim() || DEFAULT_ENDPOINT,
    model: process.env.EMBEDDINGS_MODEL?.trim() || DEFAULT_MODEL,
  };
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

/** Split `items` into chunks of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function assertVector(vec: unknown, index: number): EmbeddingVector {
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `embedding[${index}] has wrong shape: expected ${EMBEDDING_DIMENSIONS} dims, got ${
        Array.isArray(vec) ? vec.length : typeof vec
      }`,
    );
  }
  return vec as EmbeddingVector;
}

/** One POST for a single batch, with a timeout via AbortController. */
async function embedBatchOnce(
  texts: string[],
  cfg: DeepInfraConfig,
): Promise<EmbeddingVector[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        input: texts,
        encoding_format: "float",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Body may carry the provider's error message; include a short slice.
      const detail = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    const json = (await res.json()) as EmbeddingsResponse;
    const data = json.data ?? [];
    if (data.length !== texts.length) {
      throw new Error(
        `response length mismatch: sent ${texts.length}, got ${data.length}`,
      );
    }
    // Order by `index` when present (OpenAI-compatible responses may reorder).
    const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return ordered.map((d, i) => assertVector(d.embedding, i));
  } finally {
    clearTimeout(timer);
  }
}

/** embedBatchOnce with a single backoff retry (config errors never retry). */
async function embedBatchWithRetry(
  texts: string[],
  cfg: DeepInfraConfig,
): Promise<EmbeddingVector[]> {
  try {
    return await embedBatchOnce(texts, cfg);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await embedBatchOnce(texts, cfg);
  }
}

export function createDeepInfraProvider(): EmbeddingProvider {
  // Validate config eagerly so "not configured" surfaces before any work.
  const cfg = readConfig();
  return {
    name: "deepinfra",
    model: cfg.model,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts: string[]): Promise<EmbeddingVector[]> {
      if (texts.length === 0) return [];
      const results: EmbeddingVector[] = [];
      for (const batch of chunk(texts, MAX_BATCH)) {
        results.push(...(await embedBatchWithRetry(batch, cfg)));
      }
      return results;
    },
  };
}
