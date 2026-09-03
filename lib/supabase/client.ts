import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";

/**
 * Supabase client for use in Client Components / the browser.
 * Uses the public anon key and is subject to Row Level Security.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
