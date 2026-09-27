import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Server-only Supabase client using the SERVICE ROLE key. It bypasses RLS, so
 * it must NEVER be imported into client components. Used on the ad-serving path
 * (VAST read, beacons, clicks, postbacks, snapshots), by the Stripe webhook
 * writer, and by the local-only harness — the full list, which a new use must
 * join, is docs/security.md "Secrets".
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
