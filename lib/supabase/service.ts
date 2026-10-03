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
const SERVICE_REQUEST_TIMEOUT_MS = 10_000;

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
    // Every request bounded at 10 s — the client has no timeout of its own. Its
    // callers run under ceilings (a webhook whose event claim assumes the run
    // ends, a player waiting on a tag); a call that hangs would outlive them.
    // A caller's own, shorter signal (`.abortSignal()`) still wins.
    global: {
      fetch: async (input, init) => {
        const timeout = AbortSignal.timeout(SERVICE_REQUEST_TIMEOUT_MS);
        const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
        try {
          return await fetch(input, { ...init, signal });
        } catch (err) {
          // postgrest-js stops at once only on an error named AbortError; any
          // other failure of a GET it retries three more times, a second, two
          // and four apart — so a 10 s timeout surfacing as TimeoutError made a
          // read take ~47 s, long past every ceiling it sits under. Renamed, a
          // timeout ends the call when it says it does.
          if (err instanceof Error && err.name === "TimeoutError") {
            throw new DOMException(err.message, "AbortError");
          }
          throw err;
        }
      },
    },
  });
}
