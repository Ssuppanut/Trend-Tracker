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

### Running the dev server on the Claude Code sandbox

Inside the Claude Code cloud sandbox, start the dev server with the proxy env
var so server-side requests to Supabase are allowed:

```bash
NODE_USE_ENV_PROXY=1 npm run dev
```

On a normal local machine this is not needed — plain `npm run dev` works.

### Note on Node 22 + undici

The sandbox routes egress through `HTTPS_PROXY`, but Node 22's built-in `fetch`
(undici) ignores that env var by default, so its direct connections get
blocked (`Host not in allowlist`). `NODE_USE_ENV_PROXY=1` enables undici's
`EnvHttpProxyAgent`, sending `fetch` through the allowed proxy.

## Database setup

There is no Supabase CLI link yet — apply the schema by hand:

1. **Create a Supabase project** at https://supabase.com/dashboard (this
   provisions a Postgres database with `pgvector` and Auth).
2. **Run the migration.** Open the project's **SQL Editor**, paste the entire
   contents of [`supabase/migrations/0001_initial.sql`](supabase/migrations/0001_initial.sql),
   and run it. This creates every table (`categories`, `raw_items`, `trends`,
   `trend_snapshots`, `profiles`, `user_keywords`), the indexes, the RLS
   policies, and seeds the fixed `categories` rows.
3. **Wire up env vars.** In **Project Settings → API**, copy the values into
   `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL` — the project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` public key
   - `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key (server-only; used by
     cron / the ingestion pipeline, never exposed to the browser)

> A CLI-based migration workflow (`supabase link` / `supabase db push`) can be
> added later; for now the SQL Editor is enough.

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
    server.ts            server client (cookies, anon key, RLS)
    service.ts           service-role client (bypasses RLS; server-only)
    middleware.ts        auth session refresh helper
  db/
    types.ts             hand-authored Database types (SupabaseClient<Database>)
  sources/
    base.ts              SourceAdapter interface + RawItem contract
  utils.ts               cn() helper
supabase/
  migrations/
    0001_initial.sql     database schema (categories, raw_items, trends, …)
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
- `lib/db/types.ts` is hand-authored for now; regenerate once a Supabase
  project is linked with `supabase gen types typescript`.
