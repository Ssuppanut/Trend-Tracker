/**
 * Embedding provider registry — the one place that knows which vendors exist.
 *
 * Everything else depends on the `EmbeddingProvider` interface (and, for
 * space identity, `EmbeddingSpace`), never a concrete vendor. Adding a provider
 * is: implement it, add a case here, extend the name union. Selecting one is a
 * validated name string — no keys ever leave the server.
 */

import { createDeepInfraProvider, describeDeepInfra } from "./deepinfra";
import { createJinaProvider, describeJina } from "./jina";
import {
  EmbeddingConfigError,
  type EmbeddingProvider,
  type EmbeddingSpace,
} from "./types";

export {
  EMBEDDING_DIMENSIONS,
  EmbeddingConfigError,
  type EmbeddingProvider,
  type EmbeddingSpace,
  type EmbeddingVector,
} from "./types";
export { buildEmbeddingInput, type EmbeddableItem } from "./input";

/** Known providers. Order is the UI display order. */
export const EMBEDDING_PROVIDER_NAMES = ["jina", "deepinfra"] as const;
export type EmbeddingProviderName = (typeof EMBEDDING_PROVIDER_NAMES)[number];

/** Short UI labels (match the product spec's wording). */
export const PROVIDER_LABELS: Record<EmbeddingProviderName, string> = {
  jina: "Jina",
  deepinfra: "BGE-M3",
};

export function isEmbeddingProviderName(x: unknown): x is EmbeddingProviderName {
  return typeof x === "string" && (EMBEDDING_PROVIDER_NAMES as readonly string[]).includes(x);
}

/** The provider configured via `EMBEDDINGS_PROVIDER` (default `deepinfra`). */
function readConfiguredName(): EmbeddingProviderName {
  const n = process.env.EMBEDDINGS_PROVIDER?.trim();
  if (!n) return "deepinfra";
  if (isEmbeddingProviderName(n)) return n;
  throw new EmbeddingConfigError(`Unknown EMBEDDINGS_PROVIDER: "${n}"`);
}

/**
 * Resolve a provider name: an explicit (already-validated) name wins; an empty
 * value falls back to the env default. An explicit-but-unknown name throws so
 * bad input surfaces rather than silently switching providers.
 */
export function resolveProviderName(name?: string | null): EmbeddingProviderName {
  if (name == null || name === "") return readConfiguredName();
  if (isEmbeddingProviderName(name)) return name;
  throw new EmbeddingConfigError(`Unknown embedding provider: "${name}"`);
}

/** Space identity for a provider — no API key required (used by clustering). */
export function describeProvider(name?: string | null): EmbeddingSpace {
  switch (resolveProviderName(name)) {
    case "jina":
      return describeJina();
    case "deepinfra":
      return describeDeepInfra();
  }
}

/**
 * Construct the live provider for `name` (or the env default). Throws
 * `EmbeddingConfigError` when that provider has no credentials.
 */
export function getEmbeddingProvider(name?: string | null): EmbeddingProvider {
  switch (resolveProviderName(name)) {
    case "jina":
      return createJinaProvider();
    case "deepinfra":
      return createDeepInfraProvider();
  }
}

/** Like `getEmbeddingProvider` but returns `null` when unconfigured (skip). */
export function tryGetEmbeddingProvider(name?: string | null): EmbeddingProvider | null {
  try {
    return getEmbeddingProvider(name);
  } catch (err) {
    if (err instanceof EmbeddingConfigError) return null;
    throw err;
  }
}

/** True when the given provider has an API key configured (no key exposed). */
export function isProviderConfigured(name: EmbeddingProviderName): boolean {
  switch (name) {
    case "jina":
      return Boolean(process.env.JINA_API_KEY?.trim());
    case "deepinfra":
      return Boolean(
        process.env.DEEPINFRA_API_KEY?.trim() || process.env.EMBEDDINGS_API_KEY?.trim(),
      );
  }
}

/** Non-secret provider descriptor for the UI (never includes any key). */
export interface ProviderStatus {
  name: EmbeddingProviderName;
  label: string;
  model: string;
  dimensions: number;
  configured: boolean;
}

/** All providers with their space + configured flag — safe to send to the UI. */
export function listProviders(): ProviderStatus[] {
  return EMBEDDING_PROVIDER_NAMES.map((name) => {
    const space = describeProvider(name);
    return {
      name,
      label: PROVIDER_LABELS[name],
      model: space.model,
      dimensions: space.dimensions,
      configured: isProviderConfigured(name),
    };
  });
}

/** The default provider (env `EMBEDDINGS_PROVIDER`), never throwing. */
export function defaultProviderName(): EmbeddingProviderName {
  try {
    return resolveProviderName();
  } catch {
    return "deepinfra";
  }
}
