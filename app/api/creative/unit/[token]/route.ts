import { loadRuntimeBytes } from "@/lib/runtime-bytes";
import { verifyInteractiveToken } from "@/lib/vast/interactive-token";

// Public, unauthenticated: the player loads this with <script src> from its own
// context, with no session — self-authorizing via the token's HMAC + expiry,
// the same trust model as /api/creative/simid/[token] and /api/vast/preview/[token].
//
// Unlike the SIMID proxy, this one does not exist because Storage mangles the
// object. It exists so that *building* a VAST document needs no call to
// Supabase: minting this token is local HMAC, whereas the Storage signed URL it
// replaced was a network round trip sitting on the ad-serving path (ADR-0015).
// The Storage read moved here, behind its own CDN cache.
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
        // `s-maxage` is what Vercel's CDN consumes; `max-age` alone would only
        // have set the browser's TTL and left every request hitting the function.
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
