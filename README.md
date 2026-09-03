# Trend Tracker

Bilingual (TH / EN) trend discovery for creators, solo marketers and SMEs —
what people are **searching**, **talking about**, and **engaging** with, across
multiple sources, summarized by an LLM.

Phase 1 is a personal dashboard of trending topics (TH + global), split by
category. See `docs/` reference material for product, schema and adapter specs.

## Tech stack

| Layer     | Choice                                          |
| --------- | ----------------------------------------------- |
| Framework | Next.js 15 (App Router) + TypeScript            |
| Styling   | Tailwind CSS v4 + shadcn/ui (neutral, new-york) |
| Database  | Supabase (Postgres + pgvector + Auth)           |
| AI        | Claude API (Haiku) + bge-m3 embeddings          |
| Deploy    | Vercel (cron via Vercel Cron / GitHub Actions)  |

## Getting started

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev
```

Apply the database schema to your Supabase project (SQL editor or CLI):

```bash
# supabase/schema.sql contains the Phase 1 + Phase 2 schema
```

## Project structure

```
app/                     Next.js App Router (routes, layouts, pages)
  layout.tsx
  page.tsx
  globals.css            Tailwind v4 + shadcn theme tokens
components/
  ui/                    shadcn/ui components (add via: npx shadcn add <name>)
lib/
  supabase/
    client.ts            browser client (anon key, RLS)
    server.ts            server client (cookies) + service-role client
    middleware.ts        auth session refresh helper
  sources/
    base.ts              SourceAdapter interface + RawItem contract
  types/
    database.ts          typed Supabase schema
  utils.ts               cn() helper
supabase/
  schema.sql             database schema (categories, raw_items, trends, …)
middleware.ts            root middleware → Supabase session refresh
.env.example             all required environment variables
components.json          shadcn/ui config
```

## Ingestion sources (implemented later)

Each source is an adapter under `lib/sources/` conforming to `SourceAdapter`
(`lib/sources/base.ts`). Planned order: Reddit + Hacker News + RSS → YouTube +
Pantip → TikTok Creative Center + Google Trends. See the adapter spec for
per-source details and engagement normalization.

## Notes

- `shadcn/ui` is configured (`components.json`, theme tokens, `cn()`); add
  components with `npx shadcn@latest add <component>` when network access to
  the shadcn registry is available.
- `lib/types/database.ts` is hand-authored for now; regenerate once a Supabase
  project exists with `supabase gen types typescript`.
