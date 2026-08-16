import type { CreativeServing } from "@/types/database.types";
import { signInteractiveToken } from "./vast/interactive-token";
import { runtimeAsset } from "./runtime-manifest";

/** Bucket holding the interactive runtime assets (SIMID docs / VPAID units). */
export const CREATIVES_BUCKET = "creatives";

/**
 * Re-exported under its historical name so the several documents that cite
 * `SIGNED_URL_TTL_SECONDS` keep resolving to something real. The definition
 * lives in `./vast/interactive-token`, which is the module that actually uses
 * it; declaring it here instead makes the two files circular, because storage
 * already imports the signer from there.
 */
export { INTERACTIVE_TOKEN_TTL_SECONDS as SIGNED_URL_TTL_SECONDS } from "./vast/interactive-token";

/** Which proxy route serves each format, and which token kind authorizes it. */
const PROXY_ROUTE = {
  simid: "simid",
  vpaid: "unit",
} as const;

/**
 * Resolve the URL of the interactive asset for the creative's selected format.
 * Returns null on any problem so the caller can fail closed. The asset path comes
 * from the template's runtime_keys, keyed by format.
 *
 * The two formats end up in different places, for reasons that are not symmetric:
 *
 * **VPAID → a public, content-addressed CDN URL** from `runtime/manifest.ts`
 * (ADR-0017). The unit is `.js` loaded via `<script src>`, so it can be served
 * straight off Vercel's CDN with a year-long cache and never touch a function.
 * The previous scheme put a 120s token in the path, which meant the URL changed
 * every minute — every change a cache miss and a function invocation on the ad
 * path. What is given up is that 120s window on a file which, by ADR-0003, was
 * never secret: the advertiser's config rides in the VAST `<AdParameters>`, not
 * in the unit, so a lapsed subscription still yields an empty VAST and a saved
 * URL only ever returns an anonymous template.
 *
 * **SIMID → still our proxy route**, because it cannot be otherwise. Vercel Blob
 * sets `content-disposition: attachment` on HTML (its docs say this "prevents
 * hosting HTML pages"), and Supabase Storage forces `.html` to `text/plain` with
 * a script-blocking `Content-Security-Policy: sandbox`. Either way a player's
 * iframe will not run the document, so `/api/creative/simid/[token]` re-serves
 * the bytes with headers that work.
 *
 * Falls back to the proxy route for VPAID when the manifest has no entry — the
 * normal state of a checkout that has never run `npm run runtime:push`, and the
 * reason this change can ship before the public store exists.
 */
export function resolveInteractiveUrl(
  serving: CreativeServing,
  origin: string,
): string | null {
  const keys = serving.runtime_keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;

  const path = (keys as Record<string, unknown>)[serving.selected_format];
  if (typeof path !== "string" || path.length === 0) return null;

  const format = serving.selected_format;
  if (format !== "simid" && format !== "vpaid") return null;

  if (format === "vpaid") {
    const asset = runtimeAsset(path);
    if (asset) return asset.url;
    // else: fall through to the proxy, which still reads from Supabase Storage.
  }

  try {
    // Throws unless the path matches this kind's closed list of shapes.
    const { token } = signInteractiveToken(path, format);
    return `${origin.replace(/\/+$/, "")}/api/creative/${PROXY_ROUTE[format]}/${token}`;
  } catch {
    return null;
  }
}
