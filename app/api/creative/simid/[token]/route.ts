import { createServiceClient } from "@/lib/supabase/service";
import { CREATIVES_BUCKET } from "@/lib/storage";
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

  const payload = verifyInteractiveToken(token);
  if (!payload) return notFound();

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(CREATIVES_BUCKET)
      .download(payload.path);
    if (error || !data) return notFound();

    const body = await data.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=60",
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
