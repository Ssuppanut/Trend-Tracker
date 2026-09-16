import { type EmbeddingVector } from "./types";

/**
 * Shared HTTP embedding client for OpenAI-compatible `/embeddings` endpoints.
 *
 * DeepInfra and Jina both expose this shape (`POST … {model,input:[…]}` →
 * `{data:[{index,embedding}]}`), so batching, timeout, retry, index
 * re-ordering and dimension validation live here once instead of being copied
 * per provider. Providers supply only what differs (endpoint, headers, request
 * body).
 */

const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 1_000;
/** Modest batch cap to bound request size (both providers accept far more). */
const DEFAULT_MAX_BATCH = 100;

export interface OpenAIStyleEmbedConfig {
  /** Provider slug (for error messages). */
  provider: string;
  /** Expected output width; responses are asserted against it. */
  dimensions: number;
  endpoint: string;
  headers: Record<string, string>;
  /** Build the provider-specific JSON request body for one batch of texts. */
  buildBody: (texts: string[]) => unknown;
  timeoutMs?: number;
  maxBatch?: number;
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function assertVector(vec: unknown, index: number, dimensions: number): EmbeddingVector {
  if (!Array.isArray(vec) || vec.length !== dimensions) {
    throw new Error(
      `embedding[${index}] has wrong shape: expected ${dimensions} dims, got ${
        Array.isArray(vec) ? vec.length : typeof vec
      }`,
    );
  }
  return vec as EmbeddingVector;
}

/** One POST for a single batch, with a timeout via AbortController. */
async function embedBatchOnce(
  texts: string[],
  cfg: OpenAIStyleEmbedConfig,
): Promise<EmbeddingVector[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: cfg.headers,
      body: JSON.stringify(cfg.buildBody(texts)),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `${cfg.provider} HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
    const json = (await res.json()) as EmbeddingsResponse;
    const data = json.data ?? [];
    if (data.length !== texts.length) {
      throw new Error(
        `${cfg.provider} response length mismatch: sent ${texts.length}, got ${data.length}`,
      );
    }
    // Sort by `index` — OpenAI-compatible responses may reorder within a batch.
    const ordered = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return ordered.map((d, i) => assertVector(d.embedding, i, cfg.dimensions));
  } finally {
    clearTimeout(timer);
  }
}

/** embedBatchOnce with a single backoff retry. */
async function embedBatchWithRetry(
  texts: string[],
  cfg: OpenAIStyleEmbedConfig,
): Promise<EmbeddingVector[]> {
  try {
    return await embedBatchOnce(texts, cfg);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return await embedBatchOnce(texts, cfg);
  }
}

/** Embed all texts (batched, order-preserving). Throws on failure. */
export async function embedViaOpenAIStyle(
  texts: string[],
  cfg: OpenAIStyleEmbedConfig,
): Promise<EmbeddingVector[]> {
  if (texts.length === 0) return [];
  const results: EmbeddingVector[] = [];
  for (const batch of chunk(texts, cfg.maxBatch ?? DEFAULT_MAX_BATCH)) {
    results.push(...(await embedBatchWithRetry(batch, cfg)));
  }
  return results;
}
