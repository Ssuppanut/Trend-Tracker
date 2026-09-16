/**
 * Embedding provider factory — the one place that knows which vendor is active.
 *
 * Everything else imports `getEmbeddingProvider()` and the `EmbeddingProvider`
 * interface, never a concrete provider, so switching vendors is a one-line
 * change here plus an env var (Decision 1: swappable embeddings).
 */

import { createDeepInfraProvider } from "./deepinfra";
import { EmbeddingConfigError, type EmbeddingProvider } from "./types";

export {
  EMBEDDING_DIMENSIONS,
  EmbeddingConfigError,
  type EmbeddingProvider,
  type EmbeddingVector,
} from "./types";
export { buildEmbeddingInput, type EmbeddableItem } from "./input";

const DEFAULT_PROVIDER = "deepinfra";

/**
 * Construct the configured provider. Reads `EMBEDDINGS_PROVIDER` (default
 * `deepinfra`). Throws `EmbeddingConfigError` for an unknown name or when the
 * chosen provider has no credentials — callers treat that as "skip embedding".
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const name = process.env.EMBEDDINGS_PROVIDER?.trim() || DEFAULT_PROVIDER;
  switch (name) {
    case "deepinfra":
      return createDeepInfraProvider();
    default:
      throw new EmbeddingConfigError(`Unknown EMBEDDINGS_PROVIDER: "${name}"`);
  }
}

/**
 * Like `getEmbeddingProvider` but returns `null` instead of throwing when the
 * provider is merely unconfigured. Use in pipelines that should degrade to a
 * no-op (leaving items un-embedded) when no key is wired yet.
 */
export function tryGetEmbeddingProvider(): EmbeddingProvider | null {
  try {
    return getEmbeddingProvider();
  } catch (err) {
    if (err instanceof EmbeddingConfigError) return null;
    throw err;
  }
}
