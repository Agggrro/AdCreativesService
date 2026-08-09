import type { Json } from "@/types/database.types";
import {
  isFieldVisible,
  parseConfigSchema,
  type ConfigField,
} from "@/lib/config-schema";
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
 *
 * `shoppable.videoUrl` is here rather than falling through to the generic
 * "image" case (its config-schema type, since ADR-0010, so it also gets the
 * upload widget): a demo unit needs an actual playable clip, not a picsum
 * still. Small (~1.1MB), CC0, chosen for a landing page that needs it to load
 * fast.
 */
const OVERRIDES: Record<string, string> = {
  // A select resolves to its first option, which for the quiz is a single
  // question — the shape the template had before it could branch. Two steps
  // shows the mechanic that makes it worth picking; three reads as a survey in
  // a demo well, where the visitor is scanning rather than answering.
  "quiz.stepCount": "2",
  "shoppable.videoUrl":
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
};

/**
 * `"photo"` — seeded-photographic imagery — is what both live demo surfaces
 * (the landing hero and each template's own detail page) use, so a demo unit
 * never shows an empty gray well (docs/design-system.md §6, "Landing hero").
 * `"placeholder"` is the neutral, self-hosted `public/demo/` fallback; it has
 * no caller today but stays available for a demo surface that wants to stay
 * off the third-party image service.
 */
export type DemoImageStyle = "placeholder" | "photo";

/** A deterministic photographic placeholder — same seed, same image, every load. */
function photoUrl(seed: string, square: boolean): string {
  const size = square ? "200/200" : "640/360";
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}`;
}

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

function demoValue(
  field: ConfigField,
  unitKey: string,
  imageStyle: DemoImageStyle,
): string | number {
  const override = OVERRIDES[`${unitKey}.${field.name}`];
  if (override !== undefined) return override;
  if (field.default !== undefined) return field.default;

  switch (field.type) {
    case "image": {
      const square = /option|thumb|icon/i.test(field.name);
      return imageStyle === "photo"
        ? photoUrl(`${unitKey}-${field.name}`, square)
        : pick(square ? SQUARE_PLACEHOLDERS : WIDE_PLACEHOLDERS, field.name);
    }
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
 *
 * Conditional fields are resolved in schema order and skipped when inactive
 * (ADR-0011), exactly as the configurator and the save path do — so the demo is
 * always a configuration a user could really have saved. Without that, the
 * landing page would carry every one of the quiz's 42 branching-exit fields,
 * populated with their own labels, for a demo that never reads them.
 */
export function demoConfig(
  configSchema: Json,
  unitKey: string,
  imageStyle: DemoImageStyle = "placeholder",
): Record<string, unknown> {
  const { fields } = parseConfigSchema(configSchema);
  const config: Record<string, unknown> = {};
  // A separate string map, because visibility compares raw values while the
  // config keeps the typed ones — and the values are *generated* during this
  // walk rather than read from an existing map, which is why this cannot reuse
  // the two-pass `visibleFieldNames`.
  const resolved: Record<string, string> = {};
  for (const field of fields) {
    if (!isFieldVisible(field, (n) => resolved[n] ?? "")) continue;
    const value = demoValue(field, unitKey, imageStyle);
    config[field.name] = value;
    resolved[field.name] = String(value);
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
