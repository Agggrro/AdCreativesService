import type { Json } from "@/types/database.types";
import { parseConfigSchema, type ConfigField } from "@/lib/config-schema";
import { isPreviewUnitKey } from "@/lib/preview-units";

/**
 * Everything the public catalog needs to run a template's mechanic in the
 * browser, derived from the template row itself (ADR-0008).
 *
 * The point of deriving rather than fixture-ing: the old `/preview` page carried
 * four hand-written configs that had already drifted from the `config_schema`
 * defaults in the seed. Building the demo from the same defaults the
 * configurator uses makes that class of drift impossible.
 */

/** 16:9 stand-ins for `image` fields; square ones for option thumbnails. */
const WIDE_PLACEHOLDERS = [
  "/demo/scene-a.svg",
  "/demo/scene-b.svg",
  "/demo/scene-c.svg",
  "/demo/scene-d.svg",
];
const SQUARE_PLACEHOLDERS = ["/demo/option-a.svg", "/demo/option-b.svg"];

/** example.com is RFC 2606 reserved — it can never resolve somewhere real. */
const DEMO_CLICK_THROUGH = "https://example.com/offer";

/**
 * The only sample content the schema genuinely cannot supply: fields whose
 * default is absent because a real advertiser must always write them.
 */
const OVERRIDES: Record<string, string> = {
  "quiz.option1Label": "Option A",
  "quiz.option2Label": "Option B",
};

/**
 * The demo unit key for a template: the first path segment of
 * `runtime_keys.vpaid`, checked against the served allow-list. `null` means
 * "no in-browser demo for this template" — the caller must say so plainly
 * rather than render an empty black rectangle.
 */
export function demoUnitKey(runtimeKeys: Json): string | null {
  if (!runtimeKeys || typeof runtimeKeys !== "object" || Array.isArray(runtimeKeys)) {
    return null;
  }
  const vpaid = (runtimeKeys as Record<string, Json>).vpaid;
  if (typeof vpaid !== "string") return null;
  const key = vpaid.split("/")[0];
  return key && isPreviewUnitKey(key) ? key : null;
}

/** Stable index so the two slider images differ, and differ the same way every load. */
function pick<T>(pool: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}

function demoValue(field: ConfigField, unitKey: string): string | number {
  const override = OVERRIDES[`${unitKey}.${field.name}`];
  if (override !== undefined) return override;
  if (field.default !== undefined) return field.default;

  switch (field.type) {
    case "image":
      return /option|thumb|icon/i.test(field.name)
        ? pick(SQUARE_PLACEHOLDERS, field.name)
        : pick(WIDE_PLACEHOLDERS, field.name);
    case "url":
      return DEMO_CLICK_THROUGH;
    case "number":
    case "range":
      return field.min ?? 0;
    case "select":
      return field.options?.[0]?.value ?? "";
    default:
      return field.label;
  }
}

/**
 * Sample config for a template's demo. Resolution order per field: an explicit
 * override, then the schema default, then a fallback chosen by field *type* —
 * so a template added tomorrow gets a working demo with no code change here.
 */
export function demoConfig(
  configSchema: Json,
  unitKey: string,
): Record<string, unknown> {
  const { fields } = parseConfigSchema(configSchema);
  const config: Record<string, unknown> = {};
  for (const field of fields) {
    config[field.name] = demoValue(field, unitKey);
  }
  return config;
}

/** `shoppable_video` → `shoppable-video`; the public catalog URL segment. */
export function templateSlug(type: string): string {
  return type.replaceAll("_", "-");
}

/** Inverse of {@link templateSlug}, for looking a row up by its URL segment. */
export function slugToType(slug: string): string {
  return slug.replaceAll("-", "_");
}
