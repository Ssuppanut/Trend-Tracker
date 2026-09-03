# whats-new

Multi-source trend/news discovery. See `docs/` for product reference, DB
schema and the ingestion adapter spec.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind v4 + shadcn/ui (`button`, `card`)
- Supabase (Postgres + pgvector) via `@supabase/ssr`

## Getting started

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```

## Structure

```
app/               Next.js App Router (page.tsx only for now)
components/
  ui/              shadcn/ui components (button, card)
lib/
  db/              Supabase clients — client.ts (browser), server.ts (server)
  sources/         source adapters (added later)
  pipeline/        ingestion pipeline: normalize / dedupe / score (added later)
docs/              reference docs
.env.example       Supabase, Reddit, YouTube keys
```
