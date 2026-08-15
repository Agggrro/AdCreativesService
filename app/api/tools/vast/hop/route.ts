import { getRequestOrigin } from "@/lib/site";
import { fetchTag } from "@/lib/vast-inspect/fetch-tag";
import { verifyHopToken } from "@/lib/vast-inspect/hop-token";
import { neutralizeDocument } from "@/lib/vast-inspect/neutralize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What a player should receive when there is nothing safe to serve. */
const EMPTY_VAST = '<?xml version="1.0" encoding="UTF-8"?>\n<VAST version="4.2"></VAST>';

function vastResponse(body: string, origin: string | null): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      // IMA fetches wrapper hops from its own script context, so the response
      // has to be readable cross-origin. Reflecting rather than sending "*"
      // keeps the door no wider than it needs to be.
      "Access-Control-Allow-Origin": origin ?? "*",
      Vary: "Origin",
      // This route re-serves bytes fetched from a host the caller named, from
      // our own origin. That is a strictly worse trust profile than the SIMID
      // proxy, which serves our own static document and still carries a locked
      // CSP (app/api/creative/simid/[token]/route.ts) — docs/security.md's note
      // there says plainly that advertiser-controlled content would require
      // exactly this review. The only consumer is an ad SDK's XML parser, which
      // needs no scripting, styling or subresources, so the strictest possible
      // policy costs nothing. `nosniff` pins the declared type so a browser
      // cannot be talked into treating the payload as markup.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

/**
 * The dry-run wrapper proxy.
 *
 * In dry-run every <VASTAdTagURI> is rewritten to point here, carrying the real
 * next hop inside a signed token. This route fetches that hop, neutralizes its
 * trackers, and rewrites its own onward URI the same way — so the player walks
 * a chain of the correct length and shape while every pixel in it lands on our
 * 204 sink instead of a third party's counter.
 *
 * Fails closed to an empty VAST rather than to an error status, matching
 * /api/vast: a player handles "no ad" gracefully and reports an HTTP failure as
 * a fault in the tag being tested, which would be a lie.
 */
export async function GET(request: Request): Promise<Response> {
  const requestOrigin = request.headers.get("origin");
  const token = new URL(request.url).searchParams.get("t");
  if (!token) return vastResponse(EMPTY_VAST, requestOrigin);

  const verified = verifyHopToken(token);
  if (!verified) return vastResponse(EMPTY_VAST, requestOrigin);

  try {
    const response = await fetchTag(verified.url);
    if (response.status >= 400 || !response.body.trim()) {
      return vastResponse(EMPTY_VAST, requestOrigin);
    }
    return vastResponse(
      neutralizeDocument(response.body, { origin: getRequestOrigin(request) }),
      requestOrigin,
    );
  } catch {
    // Unreachable, blocked, timed out — all indistinguishable to the player,
    // and all already described properly in the report the user is reading.
    return vastResponse(EMPTY_VAST, requestOrigin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("origin") ?? "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}
