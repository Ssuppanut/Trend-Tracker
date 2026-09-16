"use server";

import { revalidatePath } from "next/cache";

import { runAnalyze, type AnalyzeResult } from "@/lib/trends/analyze";

/**
 * Server Action: run the analyze pipeline (embed + cluster + score) and
 * revalidate the dashboard. Trusted server code — no CRON_SECRET needed, and
 * the service-role key never reaches the client.
 */
export async function triggerAnalyze(): Promise<AnalyzeResult> {
  const result = await runAnalyze();
  revalidatePath("/");
  return result;
}
