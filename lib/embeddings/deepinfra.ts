import { embedViaOpenAIStyle } from "./http";
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingConfigError,
  type EmbeddingProvider,
  type EmbeddingSpace,
} from "./types";

/**
 * DeepInfra embedding provider (bge-m3, 1024 dims).
 *
 * Uses DeepInfra's OpenAI-compatible embeddings endpoint. bge-m3 is
 * multilingual (strong Thai + English) and emits exactly 1024 dims, matching
 * the `vector(1024)` schema with no migration. Cost ~$0.01 / 1M tokens.
 * Requires `api.deepinfra.com` on the sandbox egress allowlist for a live run.
 */

const DEFAULT_ENDPOINT = "https://api.deepinfra.com/v1/openai/embeddings";
const DEFAULT_MODEL = "BAAI/bge-m3";

/** Model id, overridable per-provider (falls back to the legacy shared var). */
function resolveModel(): string {
  return (
    process.env.DEEPINFRA_EMBEDDINGS_MODEL?.trim() ||
    process.env.EMBEDDINGS_MODEL?.trim() ||
    DEFAULT_MODEL
  );
}

function resolveEndpoint(): string {
  return process.env.EMBEDDINGS_API_URL?.trim() || DEFAULT_ENDPOINT;
}

/** Space identity — computable WITHOUT an API key (needed for clustering). */
export function describeDeepInfra(): EmbeddingSpace {
  return { provider: "deepinfra", model: resolveModel(), dimensions: EMBEDDING_DIMENSIONS };
}

/**
 * API key from `DEEPINFRA_API_KEY`, then the generic `EMBEDDINGS_API_KEY`.
 * Throws `EmbeddingConfigError` when neither is set — the pipeline treats that
 * as "skip embedding" rather than an error.
 */
function readApiKey(): string {
  const apiKey =
    process.env.DEEPINFRA_API_KEY?.trim() || process.env.EMBEDDINGS_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new EmbeddingConfigError(
      "DeepInfra embeddings not configured: set DEEPINFRA_API_KEY (or EMBEDDINGS_API_KEY).",
    );
  }
  return apiKey;
}

export function createDeepInfraProvider(): EmbeddingProvider {
  const apiKey = readApiKey(); // validate eagerly
  const model = resolveModel();
  const endpoint = resolveEndpoint();
  return {
    name: "deepinfra",
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    embed: (texts) =>
      embedViaOpenAIStyle(texts, {
        provider: "deepinfra",
        dimensions: EMBEDDING_DIMENSIONS,
        endpoint,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        buildBody: (batch) => ({ model, input: batch, encoding_format: "float" }),
      }),
  };
}
