/**
 * Provider-agnostic embedding contract.
 *
 * The trend engine only ever depends on this interface — never on a specific
 * vendor — so the embedding provider can be swapped later (DeepInfra → Cohere →
 * self-hosted bge-m3, …) by adding a new implementation and pointing
 * `EMBEDDINGS_PROVIDER` at it, with no change to the pipeline. See
 * `docs/Trend-Tracker-Product-Direction.md` (Decision 1: swappable embeddings).
 */

/**
 * Vector width the whole system is built around. Must match the Postgres
 * column `raw_items.embedding vector(1024)` / `trends.centroid vector(1024)`
 * (see `supabase/migrations/0001_initial.sql`). A provider that emits a
 * different width cannot be used without a schema migration, so implementations
 * assert against this value.
 */
export const EMBEDDING_DIMENSIONS = 1024;

/** A single embedding vector: `EMBEDDING_DIMENSIONS` finite numbers. */
export type EmbeddingVector = number[];

/**
 * Identity of an embedding space. Two vectors are only comparable (for
 * clustering / similarity) when their `provider` AND `model` match — even at
 * equal `dimensions`, different models occupy different spaces. Persisted
 * alongside every stored vector so spaces are never silently mixed.
 */
export interface EmbeddingSpace {
  provider: string;
  model: string;
  dimensions: number;
}

export interface EmbeddingProvider {
  /** Stable slug for logs, e.g. 'deepinfra'. */
  readonly name: string;
  /** Underlying model id, e.g. 'BAAI/bge-m3'. */
  readonly model: string;
  /** Output width; must equal `EMBEDDING_DIMENSIONS`. */
  readonly dimensions: number;
  /**
   * Embed a batch of texts. The returned array is 1:1 with `texts` and in the
   * same order. Throws on failure (network, auth, malformed response) so the
   * caller can isolate it — the pipeline treats a throw as "leave these items
   * un-embedded" rather than writing anything fake.
   */
  embed(texts: string[]): Promise<EmbeddingVector[]>;
}

/**
 * Thrown when a provider cannot run because it is not configured (missing API
 * key / endpoint). Distinct from a runtime failure: the pipeline catches this
 * and *skips* embedding cleanly (logging why) instead of erroring or, worse,
 * persisting placeholder vectors. This is what makes "build now, wire the key
 * later" safe.
 */
export class EmbeddingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingConfigError";
  }
}
