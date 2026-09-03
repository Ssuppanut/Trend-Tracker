import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";

/**
 * ⚠️  SERVER-ONLY — NEVER import this from a Client Component.
 *
 * Privileged Supabase client that authenticates with the SERVICE-ROLE key and
 * therefore BYPASSES Row Level Security. It can read and write every row in
 * the database.
 *
 * Use it only in trusted server-side contexts — cron jobs, the ingestion
 * pipeline, Route Handlers / Server Actions that must bypass RLS. The
 * service-role key must never reach the browser: keep it in
 * SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) so Next.js never inlines
 * it into client bundles.
 *
 * For normal user-scoped access use `createClient` from
 * `@/lib/supabase/server` (server) or `@/lib/supabase/client` (browser).
 */
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
