/**
 * Turn a raw item into the single string we embed.
 *
 * Kept provider-independent and pure so it can be unit-tested and reused by the
 * backfill pipeline, the (future) search-query embedder, and any provider.
 */

/** Hard cap on characters sent per item. `body` is already truncated to ~2,000
 *  chars at ingest, so title + body sits well under this; the cap is a defensive
 *  bound on token cost / model context, not the primary limiter. */
export const MAX_INPUT_CHARS = 8_000;

export interface EmbeddableItem {
  title: string;
  body: string | null;
}

/**
 * Compose `title` and `body` into one text. Title leads (it carries the most
 * signal); the body follows after a blank line when present. The result is
 * trimmed and capped at `MAX_INPUT_CHARS`.
 */
export function buildEmbeddingInput(item: EmbeddableItem): string {
  const title = item.title.trim();
  const body = item.body?.trim() ?? "";
  const text = body ? `${title}\n\n${body}` : title;
  return text.slice(0, MAX_INPUT_CHARS);
}
