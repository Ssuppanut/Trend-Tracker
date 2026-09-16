"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { triggerIngest } from "@/app/actions/ingest";
import { Button } from "@/components/ui/button";
import type { EmbeddingProviderName, ProviderStatus } from "@/lib/embeddings";

const STORAGE_KEY = "embedding_provider";

interface DashboardHeaderProps {
  /** Providers + their configured status (from the server; never any key). */
  providers: ProviderStatus[];
  /** Env-configured default provider. */
  defaultProvider: EmbeddingProviderName;
}

export function DashboardHeader({ providers, defaultProvider }: DashboardHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  // Selected provider is per-viewer UI state, persisted for convenience. It is
  // only ever a NAME — the server holds the keys and picks the real provider.
  const [provider, setProvider] = useState<EmbeddingProviderName>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved && providers.some((p) => p.name === saved)) {
          return saved as EmbeddingProviderName;
        }
      } catch {
        // ignore storage errors (private mode, blocked, …)
      }
    }
    return defaultProvider;
  });

  const active = providers.find((p) => p.name === provider);

  function selectProvider(name: EmbeddingProviderName) {
    setProvider(name);
    try {
      window.localStorage.setItem(STORAGE_KEY, name);
    } catch {
      // ignore storage errors
    }
  }

  function handleClick() {
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await triggerIngest(provider);
        const inserted = result.sources.reduce((n, s) => n + s.inserted, 0);
        const failed = result.sources.filter((s) => s.error).length;

        const parts = [`Fetched ${inserted} new items`];
        if (failed > 0) parts.push(`${failed} source(s) failed`);
        if (result.embed.skipped) {
          parts.push(`embedding skipped (${active?.label ?? provider} key not set)`);
        } else if (result.embed.error) {
          parts.push(`embedding error`);
        } else if (result.embed.embedded > 0) {
          parts.push(`embedded ${result.embed.embedded} with ${active?.label ?? provider}`);
        }
        setStatus(parts.join(" · "));
        router.refresh();
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold tracking-tight">Trend Tracker</span>
        {/* TODO: replace with SVG logo */}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {status && (
          <span
            className="text-muted-foreground text-sm"
            aria-live="polite"
            role="status"
          >
            {status}
          </span>
        )}

        {/* Embedding provider selector — immediately left of Fetch. */}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Embedding:</span>
          <select
            value={provider}
            onChange={(e) => selectProvider(e.target.value as EmbeddingProviderName)}
            disabled={isPending}
            aria-label="Embedding provider"
            className="border-input bg-background focus-visible:ring-ring rounded-md border px-2 py-1 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none disabled:opacity-50"
          >
            {providers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
                {p.configured ? "" : " (no key)"}
              </option>
            ))}
          </select>
        </label>

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
