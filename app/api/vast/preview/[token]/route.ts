import { createServiceClient } from "@/lib/supabase/service";
import { resolveInteractiveUrl } from "@/lib/storage";
import { buildPreviewServing } from "@/lib/vast/preview-context";
import { verifyPreviewToken } from "@/lib/vast/preview-token";
import { buildInlineVast, emptyVast, getAdapter, parseCreativeConfig } from "@/lib/vast";

// Public by necessity — third-party players (Google IMA, Video.js) fetch this
// URL directly with no session cookie. Self-authorizing via the token's HMAC
// signature + expiry instead. Deliberately separate from /api/vast: no
// entitlement gate (this is an authenticated-mint, unauthenticated-fetch
// preview surface, not the real serving path) and no caching (ephemeral,
// per-request, must never be served stale to a different preview).
//
// CORS: player SDKs (Google IMA in particular) fetch the ad tag URL via XHR
// from their own script context, which browsers treat as cross-origin even
// though the tag URL is same-origin with the page — the IMA SDK docs require
// Access-Control-Allow-Origin (reflecting the request's Origin) and
// Access-Control-Allow-Credentials, or the request silently fails and
// surfaces as a generic VAST_LOAD_TIMEOUT (code 1005) with no CORS error
// logged. Safe to reflect any origin here: the token in the URL is already
// the sole access control, and this response carries no cookie-based session.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  return origin
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" }
    : {};
}

function vastResponse(body: string, request: Request): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(request),
    },
  });
}

export async function OPTIONS(request: Request): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const payload = verifyPreviewToken(token);
  if (!payload) return vastResponse(emptyVast(), request);

  try {
    const serviceClient = createServiceClient();
    const serving = buildPreviewServing({
      pid: payload.pid,
      tid: payload.tid,
      fmt: payload.fmt,
      cfg: payload.cfg,
      rk: payload.rk,
    });

    const interactiveUrl = await resolveInteractiveUrl(serviceClient, serving);
    if (!interactiveUrl) return vastResponse(emptyVast(), request);

    const config = parseCreativeConfig(payload.cfg);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

    const ctx = { serving, config, rawConfig: payload.cfg, interactiveUrl, siteUrl };

    // buildInlineVast() itself does not check isServable (only generateVast()
    // does, and this route deliberately calls buildInlineVast directly to skip
    // the should_serve gate) — so this check must happen here, or a servable-
    // but-incomplete config (e.g. SIMID with no videoUrl) would render a
    // spec-invalid <MediaFile> instead of failing closed.
    const adapter = getAdapter(payload.fmt);
    if (!adapter || !adapter.isServable(ctx)) return vastResponse(emptyVast(), request);

    return vastResponse(buildInlineVast(ctx), request);
  } catch {
    return vastResponse(emptyVast(), request);
  }
}
