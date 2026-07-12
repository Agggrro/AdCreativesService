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
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function vastResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const payload = verifyPreviewToken(token);
  if (!payload) return vastResponse(emptyVast());

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
    if (!interactiveUrl) return vastResponse(emptyVast());

    const config = parseCreativeConfig(payload.cfg);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

    const ctx = { serving, config, rawConfig: payload.cfg, interactiveUrl, siteUrl };

    // buildInlineVast() itself does not check isServable (only generateVast()
    // does, and this route deliberately calls buildInlineVast directly to skip
    // the should_serve gate) — so this check must happen here, or a servable-
    // but-incomplete config (e.g. SIMID with no videoUrl) would render a
    // spec-invalid <MediaFile> instead of failing closed.
    const adapter = getAdapter(payload.fmt);
    if (!adapter || !adapter.isServable(ctx)) return vastResponse(emptyVast());

    return vastResponse(buildInlineVast(ctx));
  } catch {
    return vastResponse(emptyVast());
  }
}
