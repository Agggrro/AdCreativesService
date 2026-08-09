import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CreativeServing } from "@/types/database.types";
import { signInteractiveToken } from "./vast/interactive-token";

/** Bucket holding the interactive runtime assets (SIMID docs / VPAID units). */
export const CREATIVES_BUCKET = "creatives";

/**
 * Short TTL for the signed interactive URL. Slightly longer than the VAST cache
 * window so a cached VAST never points at an already-expired URL. This is the
 * access-control lever from ADR-0003 (signed, short-lived, per-request).
 */
export const SIGNED_URL_TTL_SECONDS = 120;

/**
 * Resolve a short-TTL URL to the interactive asset for the creative's selected
 * format. Returns null on any problem so the caller can fail closed. The asset
 * path comes from the template's runtime_keys, keyed by format.
 *
 * SIMID is special-cased: Supabase Storage always serves .html objects as
 * `text/plain` with a script-blocking `Content-Security-Policy: sandbox`
 * (deliberate, non-configurable anti-XSS-hosting policy — see
 * lib/vast/interactive-token.ts), which silently breaks the SIMID postMessage
 * handshake in every player. So instead of a direct Storage signed URL, SIMID
 * resolves to our own proxy route with a signed token; VPAID (`.js`, executed
 * via <script src>, unaffected by that policy) keeps the direct signed URL.
 */
export async function resolveInteractiveUrl(
  supabase: SupabaseClient<Database>,
  serving: CreativeServing,
  origin: string,
): Promise<string | null> {
  const keys = serving.runtime_keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;

  const path = (keys as Record<string, unknown>)[serving.selected_format];
  if (typeof path !== "string" || path.length === 0) return null;

  if (serving.selected_format === "simid") {
    try {
      const { token } = signInteractiveToken(path);
      return `${origin.replace(/\/+$/, "")}/api/creative/simid/${token}`;
    } catch {
      return null;
    }
  }

  const { data, error } = await supabase.storage
    .from(CREATIVES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
