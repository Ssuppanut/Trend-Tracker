import { formatDistanceToNowStrict } from "date-fns";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createServiceRoleClient } from "@/lib/supabase/service";

// raw_items has RLS enabled with no policy (intentionally not client-readable),
// so this verification dashboard reads it with the service-role client. This is
// safe: it runs only on the server (Server Component) and the key never ships to
// the browser. Auth for this page comes in a later sprint.
export const dynamic = "force-dynamic";

type MetaRow = { source: string; lang: string; category_hint: string | null };
type LatestRow = {
  id: number;
  source: string;
  title: string;
  url: string | null;
  engagement: number;
  lang: string;
  category_hint: string | null;
  published_at: string;
  fetched_at: string;
};

function supabaseEditorUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const ref = new URL(url).hostname.split(".")[0];
    return `https://supabase.com/dashboard/project/${ref}/editor`;
  } catch {
    return null;
  }
}

function relative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export default async function DashboardPage() {
  const supabase = createServiceRoleClient();

  const [totalRes, metaRes, latestRes] = await Promise.all([
    supabase.from("raw_items").select("*", { count: "exact", head: true }),
    supabase.from("raw_items").select("source, lang, category_hint"),
    supabase
      .from("raw_items")
      .select(
        "id, source, title, url, engagement, lang, category_hint, published_at, fetched_at",
      )
      .order("fetched_at", { ascending: false })
      .limit(50),
  ]);

  const error = totalRes.error ?? metaRes.error ?? latestRes.error;

  if (error) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-8">
        <Header />
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Query failed</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Check that <code>.env.local</code> has a valid{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code>, and that the migrations in{" "}
            <code>supabase/migrations/</code> have been applied.
          </CardContent>
        </Card>
      </main>
    );
  }

  const total = totalRes.count ?? 0;
  const meta = (metaRes.data ?? []) as MetaRow[];
  const latest = (latestRes.data ?? []) as LatestRow[];

  if (total === 0) {
    return (
      <main className="mx-auto max-w-7xl space-y-6 p-8">
        <Header />
        <Card>
          <CardHeader>
            <CardTitle>No items yet</CardTitle>
            <CardDescription>
              The <code>raw_items</code> table is empty. Trigger the ingest cron:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
              curl -H &quot;Authorization: Bearer $CRON_SECRET&quot;
              http://localhost:3000/api/cron/ingest
            </pre>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Aggregate counts in JS (PostgREST/supabase-js has no GROUP BY).
  const perSource = new Map<string, number>();
  const breakdown = new Map<string, number>(); // key: source | lang | category
  for (const row of meta) {
    perSource.set(row.source, (perSource.get(row.source) ?? 0) + 1);
    const key = `${row.source}|${row.lang}|${row.category_hint ?? "—"}`;
    breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
  }
  const sources = [...perSource.entries()].sort((a, b) => b[1] - a[1]);
  const breakdownRows = [...breakdown.entries()]
    .map(([key, count]) => {
      const [source, lang, category] = key.split("|");
      return { source, lang, category, count };
    })
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.lang.localeCompare(b.lang) ||
        a.category.localeCompare(b.category),
    );
  const latestFetch = latest[0]?.fetched_at ?? null;
  const editorUrl = supabaseEditorUrl();

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <Header />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Total items</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>By source</CardDescription>
            <CardContent className="flex flex-wrap gap-2 px-0 pt-1">
              {sources.map(([source, count]) => (
                <Badge key={source} variant="secondary">
                  {source}: {count}
                </Badge>
              ))}
            </CardContent>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Latest fetch</CardDescription>
            <CardTitle className="text-lg">
              {latestFetch ? relative(latestFetch) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle>Breakdown by source × lang × category</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdownRows.map((r) => (
                <TableRow key={`${r.source}-${r.lang}-${r.category}`}>
                  <TableCell>
                    <Badge>{r.source}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.lang}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.category}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Latest items */}
      <Card>
        <CardHeader>
          <CardTitle>Latest 50 items</CardTitle>
          <CardDescription>Most recently fetched, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="min-w-[280px]">Title</TableHead>
                <TableHead className="w-[140px]">Engagement</TableHead>
                <TableHead>Lang</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Published</TableHead>
                <TableHead>Fetched</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latest.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge>{item.source}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="font-medium">{item.title}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted h-2 w-20 overflow-hidden rounded-full">
                        <div
                          className="bg-primary h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, item.engagement))}%`,
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {Math.round(item.engagement)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.lang}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.category_hint ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {relative(item.published_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {relative(item.fetched_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {editorUrl && (
            <div className="mt-4 text-sm">
              <a
                href={editorUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                View all in Supabase →
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function Header() {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">
        What&apos;s New — Sprint 1 Dashboard
      </h1>
      <p className="text-muted-foreground text-sm">
        Verification view of ingested <code>raw_items</code>.
      </p>
    </header>
  );
}
