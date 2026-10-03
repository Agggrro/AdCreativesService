import { loadRuntimeBytes } from "@/lib/runtime-bytes";
import { verifyInteractiveToken } from "@/lib/vast/interactive-token";

/**
 * The two token-authorized proxies for runtime objects. Public and
 * unauthenticated — a player fetches them with no session — and self-authorizing
 * by the token's HMAC and expiry, the same trust model as
 * `/api/vast/preview/[token]`.
 */

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * The SIMID document, public as `/c/s/:token`. A player's SIMID iframe
 * navigates straight here.
 *
 * Exists because no object store we have used will serve HTML an iframe can
 * run: Supabase Storage forces `.html` to `text/plain` with a script-blocking
 * `Content-Security-Policy: sandbox`, and Vercel Blob sets
 * `content-disposition: attachment` (see lib/vast/interactive-token.ts). Either
 * silently breaks the SIMID postMessage handshake, so the bytes are re-served
 * here with headers that let the document actually run.
 */
export async function handleSimidDocument(token: string): Promise<Response> {
  // "simid" is required explicitly: a token minted for a VPAID unit must not be
  // replayable here and re-served as an HTML document.
  const payload = verifyInteractiveToken(token, "simid");
  if (!payload) return notFound();

  try {
    const body = await loadRuntimeBytes(payload.path);
    if (!body) return notFound();

    return new Response(body, {
      status: 200,
      headers: {
        // The player's iframe navigates here from a publisher's page. A
        // navigation does not need CORS, but SIMID players that pre-fetch the
        // document (or read it back) do — and `*` costs nothing here: the
        // response is already authorized by the token in the URL, carries no
        // credentials, and no `Vary: Origin` is set so a cache stays whole.
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/html; charset=utf-8",
        // `s-maxage` is what a CDN in front consumes; `max-age` alone would only
        // have set the browser's TTL.
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-if-error=300",
        // The opposite of Storage's own default on purpose: this document is
        // one of our own static reference implementations (runtime/*/simid/
        // index.html), not advertiser-controlled, so its inline script/style
        // are safe to run. img-src stays open to https:/data: because the
        // product image inside is an advertiser-supplied URL.
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:",
      },
    });
  } catch {
    return notFound();
  }
}

/**
 * The VPAID unit through a token, `/api/creative/unit/:token` — the fallback for
 * a runtime key that is not in `runtime/manifest.ts` yet. A unit that has been
 * pushed is referenced by its content-addressed public URL instead and never
 * comes through here (lib/storage.ts).
 */
export async function handleVpaidUnit(token: string): Promise<Response> {
  // "vpaid" is required explicitly: a token minted for a SIMID document must not
  // be replayable here and re-served as executable JavaScript.
  const payload = verifyInteractiveToken(token, "vpaid");
  if (!payload) return notFound();

  try {
    const body = await loadRuntimeBytes(payload.path);
    if (!body) return notFound();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60, stale-if-error=300",
        // The unit is executed by the player inside its own document, so a CSP
        // on this response governs nothing; what does matter is that the bytes
        // are never re-interpreted as a document.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}
