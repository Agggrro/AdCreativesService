import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveInteractiveUrl } from "@/lib/storage";
import { parseConfigSchema, coerceFieldValue } from "@/lib/config-schema";
import { buildPreviewServing } from "@/lib/vast/preview-context";
import { signPreviewToken } from "@/lib/vast/preview-token";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Leaves headroom under signPreviewToken's internal hard cap (4KB, including
// the rest of the token payload) so an oversized config gets this clear 413
// rather than an unrelated throw from inside the signer.
const MAX_PREVIEW_CONFIG_BYTES = 3072;

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

  // Same validation/coercion/required-field rejection createCreative already
  // applies — preview shows exactly what Save would produce, no second
  // implementation to maintain. Required fields must be enforced here (not
  // just at render time) since a missing videoUrl on a SIMID template would
  // otherwise mint fine and only surface as a spec-invalid <MediaFile> later.
  const { fields } = parseConfigSchema(template.config_schema);
  const config: Record<string, Json> = {};
  for (const field of fields) {
    const raw = String(fieldsInput[field.name] ?? "");
    const value = coerceFieldValue(field, raw);
    if (value === undefined) {
      if (field.required) {
        return Response.json(
          { error: `${field.label} is required` },
          { status: 400 },
        );
      }
      continue;
    }
    config[field.name] = value;
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

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).replace(
    /\/+$/,
    "",
  );

  return Response.json({
    previewTagUrl: `${siteUrl}/api/vast/preview/${minted.token}`,
    expiresInSeconds: minted.expiresInSeconds,
    sandbox: { scriptUrl, adParameters: config, format },
  });
}
