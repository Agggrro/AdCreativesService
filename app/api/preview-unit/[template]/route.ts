import { createServiceClient } from "@/lib/supabase/service";
import { CREATIVES_BUCKET } from "@/lib/storage";
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
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(CREATIVES_BUCKET)
      .download(path);
    if (error || !data) return js("// unit not uploaded yet\n");
    return js(await data.text());
  } catch {
    return js("// preview unavailable\n");
  }
}
