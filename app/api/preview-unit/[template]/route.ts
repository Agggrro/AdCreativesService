import { loadRuntimeBytes } from "@/lib/runtime-bytes";
import { PREVIEW_UNIT_PATHS } from "@/lib/preview-units";

// Serves a built VPAID unit JS for the in-browser preview harness. The unit code
// is client-executed anyway (ADR-0003) and is rendered with SAMPLE config only —
// no advertiser data — so exposing it here is fine.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATHS = PREVIEW_UNIT_PATHS;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ template: string }> },
): Promise<Response> {
  const { template } = await params;
  const path = PATHS[template];
  const js = (body: string, status = 200) =>
    new Response(body, {
      status,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });

  if (!path) return js("// unknown template\n", 404);

  try {
    // Through the manifest, like the serving path — not a direct bucket read.
    // Reading Supabase directly meant the public catalog demo could run an older
    // unit than real tags did, the moment a push landed without a re-upload to
    // the old bucket. A demo that is not the shipped unit is not a demo.
    const body = await loadRuntimeBytes(path);
    if (!body) return js("// unit not uploaded yet\n");
    return js(new TextDecoder().decode(body));
  } catch {
    return js("// preview unavailable\n");
  }
}
