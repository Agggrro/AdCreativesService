import { createServiceClient } from "@/lib/supabase/service";
import { resolveInteractiveUrl } from "@/lib/storage";
import { generateVast, emptyVast, parseCreativeConfig } from "@/lib/vast";

// Public, unauthenticated ad-serving endpoint. Node runtime keeps full
// supabase-js/storage support; the ~60s CDN cache (Cache-Control below) absorbs
// QPS/latency. Edge migration is a documented optimization, not required for MVP.
// See docs/architecture.md.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every response is a 200 with a VAST body — players expect that even when empty. */
function vastResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // ~60s cache; subscription changes take effect within ~1 min (mvp-scope / ADR-0004).
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const creativeId = url.searchParams.get("creative_id");

  // Validate input before any DB call; fail closed on junk.
  if (!creativeId || !UUID_RE.test(creativeId)) {
    return vastResponse(emptyVast());
  }

  try {
    const supabase = createServiceClient();

    // Single scoped read of the denormalized serving record (service role).
    const { data, error } = await supabase.rpc("get_creative_serving", {
      p_creative_id: creativeId,
    });
    if (error || !data || data.length === 0) {
      return vastResponse(emptyVast());
    }

    const serving = data[0];

    // Subscription gate: not entitled / not active => empty VAST.
    if (!serving.should_serve) {
      return vastResponse(emptyVast());
    }

    // Sign the interactive asset URL; missing/unsignable => fail closed.
    const interactiveUrl = await resolveInteractiveUrl(supabase, serving);
    if (!interactiveUrl) {
      return vastResponse(emptyVast());
    }

    const config = parseCreativeConfig(serving.config_json);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

    const vast = generateVast({
      serving,
      config,
      rawConfig: serving.config_json,
      interactiveUrl,
      siteUrl,
    });
    return vastResponse(vast);
  } catch {
    // Any unexpected error: never leak a partial payload.
    return vastResponse(emptyVast());
  }
}
