"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { triggerIngest } from "@/app/actions/ingest";
import { Button } from "@/components/ui/button";

export function DashboardHeader() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function handleClick() {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await triggerIngest();
        const inserted = result.sources.reduce((n, s) => n + s.inserted, 0);
        const failed = result.sources.filter((s) => s.error).length;
        setStatus(
          failed > 0
            ? `Fetched ${inserted} new items · ${failed} source(s) failed`
            : `Fetched ${inserted} new items`,
        );
        router.refresh();
      } catch (err) {
        setStatus(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold tracking-tight">Trend Tracker</span>
        {/* TODO: replace with SVG logo */}
      </div>

      <div className="flex items-center gap-3">
        {status && (
          <span
            className="text-muted-foreground text-sm"
            aria-live="polite"
            role="status"
          >
            {status}
          </span>
        )}
        <Button onClick={handleClick} disabled={isPending}>
          {isPending ? (
            <>
              <span
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
              Fetching...
            </>
          ) : (
            "Fetch new items"
          )}
        </Button>
      </div>
    </header>
  );
}
