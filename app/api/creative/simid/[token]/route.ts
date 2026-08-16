import { loadRuntimeBytes } from "@/lib/runtime-bytes";
import { verifyInteractiveToken } from "@/lib/vast/interactive-token";

// Public, unauthenticated: a player's SIMID iframe navigates straight here,
// with no session cookie — self-authorizing via the token's HMAC + expiry,
// same trust model as /api/vast/preview/[token]. Exists solely because
// Supabase Storage always serves .html objects as text/plain with a
// script-blocking CSP sandbox directive (see lib/vast/interactive-token.ts),
// which silently breaks the SIMID postMessage handshake — this route re-serves
// the same bytes with headers that let the document actually run.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

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
        // credentials, and no `Vary: Origin` is set so the CDN cache stays whole.
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "text/html; charset=utf-8",
        // `s-maxage` is what Vercel's CDN consumes; `max-age` alone would only
        // have set the browser's TTL and left every request hitting the function.
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
