"use server";

import { revalidatePath } from "next/cache";

import { runIngest, type IngestResult } from "@/lib/ingest";

/**
 * Server Action: run the ingest pipeline and revalidate the dashboard.
 * Trusted server code — no CRON_SECRET needed (unlike the public cron route),
 * and the secret never travels to the client.
 */
export async function triggerIngest(): Promise<IngestResult> {
  const result = await runIngest();
  revalidatePath("/");
  return result;
}
