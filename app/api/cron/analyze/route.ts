import { runAnalyze } from "@/lib/trends/analyze";

export const runtime = "nodejs"; // needs the service-role client + fetch
export const maxDuration = 60; // Vercel free-tier cap (seconds)

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * GET /api/cron/analyze — embed pending items, then cluster + score them into
 * trends. Protected by CRON_SECRET (same scheme as /api/cron/ingest). Manual
 * trigger only for now.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runAnalyze();
  return Response.json({ ok: true, ...result });
}
