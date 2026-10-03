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

/**
 * Which proxy path serves each format. Neutral names (ADR-0018): the public URL
 * says nothing about what it is. Both rewrite to the `/api/creative/*` routes,
 * which keep working for tags already in flight.
 */
const PROXY_ROUTE = {
  simid: "c/s",
  vpaid: "api/creative/unit",
} as const;

/**
 * Resolve the URL of the interactive asset for the creative's selected format.
 * Returns null on any problem so the caller can fail closed. The asset path comes
 * from the template's runtime_keys, keyed by format.
 *
 * The two formats end up in different places, for reasons that are not symmetric:
 *
 * **VPAID → a public, content-addressed URL** from `runtime/manifest.ts`
 * (ADR-0017): an R2 object on the media host (ADR-0029). The unit is `.js`
 * loaded via `<script src>`, so it is served straight off Cloudflare's cache
 * with a year-long lifetime and nothing of ours wakes up for it. The previous
 * scheme put a 120s token in the path, which meant the URL changed every
 * minute — every change a cache miss and a function invocation on the ad path.
 * What is given up is that 120s window on a file which, by ADR-0003, was never
 * secret: the advertiser's config rides in the VAST `<AdParameters>`, not in the
 * unit, so a lapsed subscription still yields an empty VAST and a saved URL only
 * ever returns an anonymous template.
 *
 * **SIMID → still our proxy route.** The document needs headers of our own — a
 * CSP that lets its inline script run and scopes everything else — and a
 * per-request token (ADR-0003). Vercel Blob and Supabase Storage would not serve
 * it runnable at all; R2 serves it inline but bare, and the copy there is stored
 * as an attachment. `/c/s/:token` re-serves the bytes with the headers that work
 * (lib/serving/http/interactive.ts).
 *
 * Falls back to the proxy route for VPAID when the manifest has no entry — the
 * normal state of a checkout that has never run `npm run runtime:push`, and the
 * reason this change can ship before the public store exists.
 */
export interface InteractiveUrlOptions {
  /**
   * Load a pushed VPAID unit from `origin` — `/c/u/…`, a rewrite to the same
   * object — instead of from the media host. For our own previews only: a unit
   * posts its telemetry to the origin its script came from (ADR-0019), and on
   * the media host that is no page of ours, so the configurator's players would
   * hear nothing. A served tag never sets this.
   */
  sameOriginUnit?: boolean;
}

export function resolveInteractiveUrl(
  serving: CreativeServing,
  origin: string,
  options: InteractiveUrlOptions = {},
): string | null {
  const keys = serving.runtime_keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;

  const path = (keys as Record<string, unknown>)[serving.selected_format];
  if (typeof path !== "string" || path.length === 0) return null;

  const format = serving.selected_format;
  if (format !== "simid" && format !== "vpaid") return null;

  if (format === "vpaid") {
    const asset = runtimeAsset(path);
    if (asset) {
      if (options.sameOriginUnit) {
        const key = new URL(asset.url).pathname.replace(/^\/+/, "");
        return `${origin.replace(/\/+$/, "")}/c/u/${key}`;
      }
      // The object's own URL, on the media host. It used to be our ad host's
      // `/c/u/…`, an edge rewrite to the Blob store that woke nothing on Vercel;
      // on Workers that path would be an invocation per unit load (ADR-0029).
      // The media host is already in every tag that carries an upload; for one
      // that does not, it is a second hostname — a publisher whose CSP names
      // only `smithcdn.net` must allow `media.smithcdn.net` too.
      return asset.url;
    }
    // else: fall through to the proxy, which still reads from Supabase Storage.
  }

  try {
    // Throws unless the path matches this kind's closed list of shapes.
    const { token } = signInteractiveToken(path, format);
    return `${origin.replace(/\/+$/, "")}/${PROXY_ROUTE[format]}/${token}`;
  } catch {
    return null;
  }
}
