import { runIngest } from "@/lib/ingest";

export const runtime = "nodejs"; // needs AbortController + rss-parser, not edge
export const maxDuration = 60; // Vercel free-tier cap (seconds)

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { durationMs, sources } = await runIngest();
  return Response.json({ ok: true, durationMs, sources });
}
