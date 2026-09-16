"use server";

import { revalidatePath } from "next/cache";

import {
  defaultProviderName,
  isEmbeddingProviderName,
  tryGetEmbeddingProvider,
  type EmbeddingProviderName,
} from "@/lib/embeddings";
import { embedPendingItems, type EmbedPendingResult } from "@/lib/embeddings/embed-items";
import { runIngest, type IngestResult } from "@/lib/ingest";
import { createServiceRoleClient } from "@/lib/supabase/service";

export interface FetchResult extends IngestResult {
  /** Embedding step outcome (uses only the selected provider). */
  embed: EmbedPendingResult;
  /** The provider actually used this run. */
  provider: EmbeddingProviderName;
}

/**
 * Server Action: run ingest, then embed the newly-fetched items with the
 * SELECTED embedding provider only. The client passes a provider *name*
 * (never a key); anything unrecognized falls back to the configured default.
 * Trusted server code — no CRON_SECRET needed, keys never reach the client.
 */
export async function triggerIngest(providerName?: string): Promise<FetchResult> {
  const selected = isEmbeddingProviderName(providerName) ? providerName : undefined;
  const activeName = selected ?? defaultProviderName();

  const ingest = await runIngest();

  // Embed pending items using ONLY the selected provider. If it isn't
  // configured (no key) this is a clean skip — ingest still succeeds.
  const supabase = createServiceRoleClient();
  const provider = tryGetEmbeddingProvider(activeName);
  const embed = await embedPendingItems(supabase, { provider, providerName: activeName });

  revalidatePath("/");
  return { ...ingest, embed, provider: activeName };
}
