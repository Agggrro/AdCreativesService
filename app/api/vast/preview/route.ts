import { createServerSupabase } from "@/lib/supabase/server";
import { getRequestOrigin } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveInteractiveUrl } from "@/lib/storage";
import { parseConfigSchema, buildConfigFromValues } from "@/lib/config-schema";
import { buildPreviewServing } from "@/lib/vast/preview-context";
import { signPreviewToken } from "@/lib/vast/preview-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Leaves headroom under signPreviewToken's internal hard cap (including the
// rest of the token payload) so an oversized config gets this clear 413 rather
// than an unrelated throw from inside the signer.
//
// 5KB, not 3KB: a three-step branching quiz with six uploaded images is ~3.3KB
// on its own (a Storage public URL is ~158 chars, and there are 24 per-path
// exit fields), so the old ceiling rejected a creative the configurator is
// perfectly willing to build. See ADR-0011 for the ~5.6KB architectural limit
// this sits under.
const MAX_PREVIEW_CONFIG_BYTES = 5120;

/**
 * Mint a short-TTL preview for a template using the CALLER'S CURRENT, unsaved
 * form values — no creative row is read or written. Authenticated (any
 * signed-in dashboard user, no subscription required: this is a try-before-you
 * -configure surface, not the entitled serving path). Never touches Stripe.
 *
 * Body: { templateId: string, format: string, fields: Record<string,string> }
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    templateId?: unknown;
    format?: unknown;
    fields?: unknown;
  } | null;

  const templateId = typeof body?.templateId === "string" ? body.templateId : "";
  const format = typeof body?.format === "string" ? body.format : "";
  const fieldsInput =
    body?.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
      ? (body.fields as Record<string, unknown>)
      : {};

  if (!templateId || !format) {
    return Response.json(
      { error: "templateId and format are required" },
      { status: 400 },
    );
  }

  const { data: template } = await supabase
    .from("templates")
    .select("id, supported_standards, runtime_keys, config_schema")
    .eq("id", templateId)
    .eq("is_published", true)
    .maybeSingle();

  if (!template) {
    return Response.json({ error: "template not found" }, { status: 404 });
  }
  if (!template.supported_standards.includes(format)) {
    return Response.json(
      { error: "format not supported by this template" },
      { status: 400 },
    );
  }

  // Literally the same build createCreative runs — preview shows exactly what
  // Save would produce, and there is no second implementation to keep in step.
  // Required fields must be enforced here (not just at render time) since a
  // missing videoUrl on a SIMID template would otherwise mint fine and only
  // surface as a spec-invalid <MediaFile> later. Inactive fields are pruned
  // here too: the panel posts the whole form state, including values for
  // fields the user has since switched off, and preview must not show a
  // configuration Save would refuse to write.
  const { fields } = parseConfigSchema(template.config_schema);
  const { config, missingField } = buildConfigFromValues(fields, (name) =>
    String(fieldsInput[name] ?? ""),
  );
  if (missingField) {
    return Response.json({ error: `${missingField} is required` }, { status: 400 });
  }

  const payloadSize = Buffer.byteLength(JSON.stringify(config), "utf8");
  if (payloadSize > MAX_PREVIEW_CONFIG_BYTES) {
    return Response.json({ error: "preview config too large" }, { status: 413 });
  }

  const minted = signPreviewToken({
    tid: template.id,
    fmt: format,
    cfg: config,
    rk: template.runtime_keys,
  });

  // Resolve the signed unit URL once (service-role, same as production) so the
  // Sandbox tab can use it directly without a second round trip through VAST XML.
  const serviceClient = createServiceClient();
  const serving = buildPreviewServing({
    pid: minted.previewId,
    tid: template.id,
    fmt: format,
    cfg: config,
    rk: template.runtime_keys,
  });
  const scriptUrl = await resolveInteractiveUrl(serviceClient, serving);
  if (!scriptUrl) {
    return Response.json(
      { error: "interactive asset not available for this template/format" },
      { status: 422 },
    );
  }

  // The preview tag is fetched by a player running on the very page that minted
  // it, so its origin must be that page's — not the canonical NEXT_PUBLIC_SITE_URL.
  // Those differ in local development (the env var is pinned to http://localhost:3000),
  // and a protocol mismatch is fatal rather than cosmetic: under `npm run dev:https`
  // the page is https, so an http tag URL makes Google IMA's request a
  // mixed-content/private-network failure that surfaces only as code 1005.
  const siteUrl = getRequestOrigin(request);

  return Response.json({
    previewTagUrl: `${siteUrl}/api/vast/preview/${minted.token}`,
    expiresInSeconds: minted.expiresInSeconds,
    sandbox: { scriptUrl, adParameters: config, format },
  });
}
