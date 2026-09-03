import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Supabase client for use in Server Components, Route Handlers and Server
 * Actions. Reads/writes the auth session from cookies and is subject to
 * Row Level Security (anon key).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if middleware is refreshing sessions.
          }
        },
      },
    },
  );
}

/**
 * Privileged Supabase client that uses the service-role key and bypasses
 * Row Level Security. Use ONLY in trusted server contexts (cron jobs, the
 * ingestion pipeline) — never expose the service-role key to the browser.
 */
export function createServiceRoleClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // no-op: service-role client is stateless / not tied to a session
        },
      },
    },
  );
}
