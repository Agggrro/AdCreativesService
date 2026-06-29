import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

/** Browser Supabase client (anon key, RLS enforced) for client components. */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
