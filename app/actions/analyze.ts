"use server";

import { revalidatePath } from "next/cache";

import { isEmbeddingProviderName } from "@/lib/embeddings";
import { runAnalyze, type AnalyzeResult } from "@/lib/trends/analyze";

/**
 * Server Action: run the analyze pipeline (embed + cluster + score) in the
 * SELECTED provider's embedding space and revalidate the dashboard. The client
 * passes a provider *name* only; unrecognized values fall back to the default.
 */
export async function triggerAnalyze(providerName?: string): Promise<AnalyzeResult> {
  const selected = isEmbeddingProviderName(providerName) ? providerName : undefined;
  const result = await runAnalyze({ providerName: selected });
  revalidatePath("/");
  return result;
}
