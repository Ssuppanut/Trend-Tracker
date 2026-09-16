import { embedViaOpenAIStyle } from "./http";
import {
  EMBEDDING_DIMENSIONS,
  EmbeddingConfigError,
  type EmbeddingProvider,
  type EmbeddingSpace,
} from "./types";

/**
 * Jina embedding provider (jina-embeddings-v3, 1024 dims).
 *
 * jina-embeddings-v3 is Jina's frontier multilingual TEXT model (89 languages
 * incl. Thai) whose default output is 1024 dims — matching the `vector(1024)`
 * schema with no migration. (v4 is multimodal and defaults to 2048 dims, so it
 * is deliberately NOT the default here.) We pass `dimensions: 1024` and a
 * task-type explicitly so the space is stable and self-documenting.
 *
 * Endpoint is OpenAI-compatible (`POST /v1/embeddings`). Requires
 * `api.jina.ai` on the sandbox egress allowlist for a live run.
 */

const DEFAULT_ENDPOINT = "https://api.jina.ai/v1/embeddings";
const DEFAULT_MODEL = "jina-embeddings-v3";
/** Symmetric task — right fit for clustering + query/document similarity. */
const DEFAULT_TASK = "text-matching";

function resolveModel(): string {
  return process.env.JINA_EMBEDDINGS_MODEL?.trim() || DEFAULT_MODEL;
}

function resolveTask(): string {
  return process.env.JINA_EMBEDDINGS_TASK?.trim() || DEFAULT_TASK;
}

function resolveEndpoint(): string {
  return process.env.JINA_API_URL?.trim() || DEFAULT_ENDPOINT;
}

/** Space identity — computable WITHOUT an API key (needed for clustering). */
export function describeJina(): EmbeddingSpace {
  return { provider: "jina", model: resolveModel(), dimensions: EMBEDDING_DIMENSIONS };
}

/** API key from `JINA_API_KEY`. Throws `EmbeddingConfigError` when unset. */
function readApiKey(): string {
  const apiKey = process.env.JINA_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new EmbeddingConfigError(
      "Jina embeddings not configured: set JINA_API_KEY.",
    );
  }
  return apiKey;
}

export function createJinaProvider(): EmbeddingProvider {
  const apiKey = readApiKey(); // validate eagerly
  const model = resolveModel();
  const task = resolveTask();
  const endpoint = resolveEndpoint();
  return {
    name: "jina",
    model,
    dimensions: EMBEDDING_DIMENSIONS,
    embed: (texts) =>
      embedViaOpenAIStyle(texts, {
        provider: "jina",
        dimensions: EMBEDDING_DIMENSIONS,
        endpoint,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        buildBody: (batch) => ({
          model,
          task,
          dimensions: EMBEDDING_DIMENSIONS,
          embedding_type: "float",
          input: batch,
        }),
      }),
  };
}
