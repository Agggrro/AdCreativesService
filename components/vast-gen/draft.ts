import type { VastVersion } from "@/lib/vast-inspect/model";
import type { VideoConfig } from "@/lib/vast-gen/model";
import { DEFAULT_VERSION, GENERATOR_VERSIONS, supports, trackerEvents, type GeneratorFeature } from "@/lib/vast-gen/spec";
import type { Issue } from "@/lib/vast-gen/validate";

/** The types a file control accepts, for the picker and the link's type menu — the validator's own lists. */
export { IMAGE_MIMES, VIDEO_MIMES } from "@/lib/vast-gen/validate";

/**
 * The VAST generator's form state (ADR-0035), and the two translations it
 * needs: into the stored `VideoConfig` shape the validator and builder read,
 * and back out of a saved config for editing.
 *
 * The form keeps *everything* the user typed, at every version; the
 * translation into a config is where a version's limits apply. Switching to 2.0
 * and back to 4.2 therefore loses nothing, while a 2.0 tag never carries what
 * 2.0 cannot — and the form says what it left out.
 */

export interface MediaDraft {
  source: "upload" | "external";
  url: string;
  mime: string;
  width?: number;
  height?: number;
  durationMs?: number;
  /** An upload's size, for the readout; the server re-reads it from R2. */
  bytes?: number;
  /** Display only, never sent. */
  fileName?: string;
}

export interface CompanionDraft {
  key: string;
  image: MediaDraft | null;
  width: string;
  height: string;
  altText: string;
}

/** A pixel row: one URL and what it fires on. */
export type PixelType =
  | "impression"
  | "error"
  | "click"
  | "viewable"
  | "notViewable"
  | "viewUndetermined"
  | "companionView"
  | "companionClick"
  | "iconView"
  | "iconClick"
  | `event:${string}`;

export interface PixelDraft {
  key: string;
  type: PixelType;
  url: string;
}

export type Toggle = "off" | "on";
export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export interface GeneratorDraft {
  name: string;
  version: VastVersion;
  adTitle: string;
  description: string;
  advertiser: string;
  media: MediaDraft | null;
  clickThroughUrl: string;
  skip: Toggle;
  skipSeconds: string;
  companions: CompanionDraft[];
  companionClickThroughUrl: string;
  icon: Toggle;
  iconProgram: string;
  iconImage: MediaDraft | null;
  iconWidth: string;
  iconHeight: string;
  iconCorner: Corner;
  iconOffsetSeconds: string;
  iconDurationSeconds: string;
  iconClickThroughUrl: string;
  omid: Toggle;
  omidVendor: string;
  omidScriptUrl: string;
  omidParameters: string;
  uaid: "auto" | "custom";
  uaidRegistry: string;
  uaidValue: string;
  pixels: PixelDraft[];
}

let counter = 0;
/** A stable React key for a row the user added. Never stored. */
export function rowKey(): string {
  counter += 1;
  return `r${Date.now().toString(36)}${counter}`;
}

export function emptyDraft(): GeneratorDraft {
  return {
    name: "",
    version: DEFAULT_VERSION,
    adTitle: "",
    description: "",
    advertiser: "",
    media: null,
    clickThroughUrl: "",
    skip: "off",
    skipSeconds: "5",
    companions: [],
    companionClickThroughUrl: "",
    icon: "off",
    iconProgram: "AdChoices",
    iconImage: null,
    iconWidth: "20",
    iconHeight: "20",
    iconCorner: "topRight",
    iconOffsetSeconds: "0",
    iconDurationSeconds: "",
    iconClickThroughUrl: "",
    omid: "off",
    omidVendor: "",
    omidScriptUrl: "",
    omidParameters: "",
    uaid: "auto",
    uaidRegistry: "",
    uaidValue: "",
    pixels: [],
  };
}

export function emptyCompanion(): CompanionDraft {
  return { key: rowKey(), image: null, width: "", height: "", altText: "" };
}

/* ---------- which pixel types a version offers ---------- */

/**
 * The pixel types the form offers at `version`, in menu order. The player
 * events come from the version's own XSD enumeration (lib/vast-gen/spec.ts),
 * so a menu can never list an event the tag's schema does not name.
 */
export function pixelTypes(version: VastVersion, hasCompanions: boolean, hasIcon: boolean): PixelType[] {
  const types: PixelType[] = ["impression", "click"];
  if (supports(version, "thirdPartyError")) types.push("error");
  for (const event of trackerEvents(version)) types.push(`event:${event}`);
  if (supports(version, "viewableImpression")) types.push("viewable", "notViewable", "viewUndetermined");
  if (hasCompanions) {
    types.push("companionView");
    if (supports(version, "companionClickTracking")) types.push("companionClick");
  }
  if (hasIcon) types.push("iconView", "iconClick");
  return types;
}

/* ---------- draft → config ---------- */

function seconds(value: string): number | undefined {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n * 1000) : Number.NaN;
}

function int(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

function mediaValue(media: MediaDraft | null): Record<string, unknown> | undefined {
  if (!media) return undefined;
  return {
    source: media.source,
    url: media.url,
    mime: media.mime,
    ...(media.width !== undefined ? { width: media.width } : {}),
    ...(media.height !== undefined ? { height: media.height } : {}),
    ...(media.durationMs !== undefined ? { durationMs: media.durationMs } : {}),
    ...(media.bytes !== undefined ? { bytes: media.bytes } : {}),
  };
}

export interface DraftConfig {
  /** The object `parseVideoConfig` reads — not yet validated. */
  config: Record<string, unknown>;
  /** Config path → the form control it came from, so an issue lands on its field. */
  origin: Map<string, string>;
  /** What the draft holds that this *version* leaves out, for the form's notice. */
  excluded: (GeneratorFeature | "events")[];
  /** What the form itself can tell is missing before the validator sees it. */
  issues: Issue[];
}

/** Where an icon in each corner sits, as the Icon element's two attributes. */
const POSITION: Record<Corner, { x: "left" | "right"; y: "top" | "bottom" }> = {
  topLeft: { x: "left", y: "top" },
  topRight: { x: "right", y: "top" },
  bottomLeft: { x: "left", y: "bottom" },
  bottomRight: { x: "right", y: "bottom" },
};

/** The form id of a pixel row's URL input. */
export const pixelField = (key: string) => `pixel:${key}`;

export function draftToConfig(draft: GeneratorDraft): DraftConfig {
  const { version } = draft;
  const origin = new Map<string, string>();
  const excluded = new Set<GeneratorFeature | "events">();

  const issues: Issue[] = [];
  const companionsOn = draft.companions.length > 0;
  const iconOn = draft.icon === "on";
  const iconAllowed = iconOn && supports(version, "icon");
  if (iconOn && !iconAllowed) excluded.add("icon");
  const offered = new Set(pixelTypes(version, companionsOn, iconAllowed));
  /**
   * The feature whose version gate keeps a pixel out, or null when the version
   * is not why: a banner pixel with no banner is the form's state, and no
   * version switch would bring it back (PixelRows says so on the row).
   */
  const versionGate = (type: PixelType): GeneratorFeature | "events" | null => {
    if (type.startsWith("event:")) return "events";
    if (type === "error") return "thirdPartyError";
    if (type === "viewable" || type === "notViewable" || type === "viewUndetermined") return "viewableImpression";
    if (type === "companionClick") return companionsOn ? "companionClickTracking" : null;
    if (type === "iconView" || type === "iconClick") return iconOn && !iconAllowed ? "icon" : null;
    return null;
  };

  const lists: Record<string, string[]> = {
    impression: [],
    error: [],
    click: [],
    viewable: [],
    notViewable: [],
    viewUndetermined: [],
    companionView: [],
    companionClick: [],
    iconView: [],
    iconClick: [],
  };
  const events: { event: string; url: string }[] = [];
  const pathFor = (type: PixelType, index: number): string[] => {
    switch (type) {
      case "companionView":
        return draft.companions.map((_, n) => `companions.${n}.creativeView.${index}`);
      case "companionClick":
        return draft.companions.map((_, n) => `companions.${n}.clickTracking.${index}`);
      case "iconView":
        return [`icon.viewTracking.${index}`];
      case "iconClick":
        return [`icon.clickTracking.${index}`];
      default:
        return [`trackers.${type}.${index}`];
    }
  };
  for (const pixel of draft.pixels) {
    const url = pixel.url.trim();
    if (!url) continue;
    if (!offered.has(pixel.type)) {
      const gate = versionGate(pixel.type);
      if (gate) excluded.add(gate);
      continue;
    }
    if (pixel.type.startsWith("event:")) {
      origin.set(`trackers.events.${events.length}`, pixelField(pixel.key));
      origin.set(`trackers.events.${events.length}.url`, pixelField(pixel.key));
      origin.set(`trackers.events.${events.length}.event`, pixelField(pixel.key));
      events.push({ event: pixel.type.slice("event:".length), url });
      continue;
    }
    const list = lists[pixel.type];
    for (const path of pathFor(pixel.type, list.length)) origin.set(path, pixelField(pixel.key));
    list.push(url);
  }

  const config: Record<string, unknown> = {
    v: 1,
    version,
    adTitle: draft.adTitle,
    trackers: {
      impression: lists.impression,
      error: lists.error,
      click: lists.click,
      events,
      viewable: lists.viewable,
      notViewable: lists.notViewable,
      viewUndetermined: lists.viewUndetermined,
    },
    companions: draft.companions.map((companion) => ({
      image: mediaValue(companion.image),
      width: int(companion.width) ?? companion.image?.width,
      height: int(companion.height) ?? companion.image?.height,
      altText: companion.altText,
      creativeView: lists.companionView,
      clickTracking: lists.companionClick,
    })),
  };
  origin.set("version", "version");
  origin.set("adTitle", "adTitle");

  const media = mediaValue(draft.media);
  if (media) config.media = media;
  origin.set("media", "media");
  for (const key of ["media.url", "media.mime", "media.width", "media.height", "media.durationMs", "media.source"]) {
    origin.set(key, "media");
  }

  if (draft.description.trim()) {
    config.description = draft.description;
    origin.set("description", "description");
  }
  if (draft.advertiser.trim()) {
    if (supports(version, "advertiser")) {
      config.advertiser = draft.advertiser;
      origin.set("advertiser", "advertiser");
    } else excluded.add("advertiser");
  }
  if (draft.clickThroughUrl.trim()) {
    config.clickThroughUrl = draft.clickThroughUrl;
    origin.set("clickThroughUrl", "clickThroughUrl");
  }
  if (draft.skip === "on") {
    if (supports(version, "skip")) {
      origin.set("skipOffsetMs", "skipSeconds");
      const offset = seconds(draft.skipSeconds);
      // Empty is not zero: "skippable at once" is a choice, never a default.
      if (offset === undefined) issues.push({ path: "skipOffsetMs", code: "required" });
      else config.skipOffsetMs = offset;
    } else excluded.add("skip");
  }
  draft.companions.forEach((companion, n) => {
    for (const key of ["image", "image.url", "image.mime", "image.source"]) {
      origin.set(`companions.${n}.${key}`, `companion:${companion.key}:image`);
    }
    origin.set(`companions.${n}.width`, `companion:${companion.key}:width`);
    origin.set(`companions.${n}.height`, `companion:${companion.key}:height`);
    origin.set(`companions.${n}.altText`, `companion:${companion.key}:altText`);
    origin.set(`companions.${n}`, `companion:${companion.key}:image`);
  });
  if (companionsOn && draft.companionClickThroughUrl.trim()) {
    config.companionClickThroughUrl = draft.companionClickThroughUrl;
    origin.set("companionClickThroughUrl", "companionClickThroughUrl");
  }
  if (iconAllowed) {
    const { x, y } = POSITION[draft.iconCorner] ?? POSITION.topRight;
    config.icon = {
      program: draft.iconProgram,
      image: mediaValue(draft.iconImage),
      width: int(draft.iconWidth),
      height: int(draft.iconHeight),
      xPosition: x,
      yPosition: y,
      offsetMs: seconds(draft.iconOffsetSeconds) ?? 0,
      ...(seconds(draft.iconDurationSeconds) !== undefined ? { durationMs: seconds(draft.iconDurationSeconds) } : {}),
      ...(draft.iconClickThroughUrl.trim() ? { clickThroughUrl: draft.iconClickThroughUrl } : {}),
      clickTracking: lists.iconClick,
      viewTracking: lists.iconView,
    };
    for (const [path, field] of [
      ["icon", "iconImage"],
      ["icon.program", "iconProgram"],
      ["icon.image", "iconImage"],
      ["icon.image.url", "iconImage"],
      ["icon.image.mime", "iconImage"],
      ["icon.width", "iconWidth"],
      ["icon.height", "iconHeight"],
      ["icon.offsetMs", "iconOffsetSeconds"],
      ["icon.durationMs", "iconDurationSeconds"],
      ["icon.clickThroughUrl", "iconClickThroughUrl"],
    ] as const) {
      origin.set(path, field);
    }
  }
  if (draft.omid === "on") {
    if (supports(version, "omid")) {
      config.verification = {
        vendor: draft.omidVendor,
        scriptUrl: draft.omidScriptUrl,
        ...(draft.omidParameters.trim() ? { parameters: draft.omidParameters } : {}),
      };
      origin.set("verification", "omidVendor");
      origin.set("verification.vendor", "omidVendor");
      origin.set("verification.scriptUrl", "omidScriptUrl");
      origin.set("verification.parameters", "omidParameters");
    } else excluded.add("omid");
  }
  if (draft.uaid === "custom") {
    if (supports(version, "universalAdId")) {
      config.universalAdId = { registry: draft.uaidRegistry, value: draft.uaidValue };
      origin.set("universalAdId", "uaidRegistry");
      origin.set("universalAdId.registry", "uaidRegistry");
      origin.set("universalAdId.value", "uaidValue");
    } else excluded.add("universalAdId");
  }

  return { config, origin, excluded: [...excluded], issues };
}

/* ---------- config → draft (editing a saved creative) ---------- */

const CORNER: Record<string, Corner> = {
  "top:left": "topLeft",
  "top:right": "topRight",
  "bottom:left": "bottomLeft",
  "bottom:right": "bottomRight",
};

function fromSeconds(ms: number | undefined): string {
  return ms === undefined ? "" : String(Math.round(ms) / 1000);
}

export function configToDraft(config: VideoConfig, name: string | null): GeneratorDraft {
  const pixels: PixelDraft[] = [];
  const push = (type: PixelType, urls: string[]) => {
    for (const url of urls) pixels.push({ key: rowKey(), type, url });
  };
  push("impression", config.trackers.impression);
  push("click", config.trackers.click);
  push("error", config.trackers.error);
  for (const tracker of config.trackers.events) pixels.push({ key: rowKey(), type: `event:${tracker.event}`, url: tracker.url });
  push("viewable", config.trackers.viewable);
  push("notViewable", config.trackers.notViewable);
  push("viewUndetermined", config.trackers.viewUndetermined);
  // The form edits one list of banner pixels and writes it onto every banner,
  // so banners whose lists differ (a hand edit) are read as their union:
  // nothing is dropped, though every banner then carries all of them.
  const union = (lists: string[][]) => [...new Set(lists.flat())];
  push("companionView", union(config.companions.map((banner) => banner.creativeView)));
  push("companionClick", union(config.companions.map((banner) => banner.clickTracking)));
  if (config.icon) {
    push("iconView", config.icon.viewTracking);
    push("iconClick", config.icon.clickTracking);
  }

  const draft = emptyDraft();
  return {
    ...draft,
    name: name ?? "",
    version: config.version,
    adTitle: config.adTitle,
    description: config.description ?? "",
    advertiser: config.advertiser ?? "",
    media: {
      source: config.media.source,
      url: config.media.url,
      mime: config.media.mime,
      width: config.media.width,
      height: config.media.height,
      durationMs: config.media.durationMs,
      bytes: config.media.bytes,
    },
    clickThroughUrl: config.clickThroughUrl ?? "",
    skip: config.skipOffsetMs !== undefined ? "on" : "off",
    skipSeconds: config.skipOffsetMs !== undefined ? fromSeconds(config.skipOffsetMs) : draft.skipSeconds,
    companions: config.companions.map((banner) => ({
      key: rowKey(),
      image: { ...banner.image },
      width: String(banner.width),
      height: String(banner.height),
      altText: banner.altText ?? "",
    })),
    companionClickThroughUrl: config.companionClickThroughUrl ?? "",
    ...(config.icon
      ? {
          icon: "on" as const,
          iconProgram: config.icon.program,
          iconImage: { ...config.icon.image },
          iconWidth: String(config.icon.width),
          iconHeight: String(config.icon.height),
          iconCorner: CORNER[`${config.icon.yPosition}:${config.icon.xPosition}`] ?? "topRight",
          iconOffsetSeconds: fromSeconds(config.icon.offsetMs),
          iconDurationSeconds: fromSeconds(config.icon.durationMs),
          iconClickThroughUrl: config.icon.clickThroughUrl ?? "",
        }
      : {}),
    ...(config.verification
      ? {
          omid: "on" as const,
          omidVendor: config.verification.vendor,
          omidScriptUrl: config.verification.scriptUrl,
          omidParameters: config.verification.parameters ?? "",
        }
      : {}),
    ...(config.universalAdId
      ? { uaid: "custom" as const, uaidRegistry: config.universalAdId.registry, uaidValue: config.universalAdId.value }
      : {}),
    pixels,
  };
}

/* ---------- the draft kept in this browser ---------- */

/**
 * A new creative's draft survives a sign-in round trip — including the email
 * confirmation, which lands in another tab — in this browser's storage (ADR-0036).
 * A per-viewer convenience: wrapped in try/catch everywhere, because storage can
 * be unavailable (a private window, blocked site data) and the form must work
 * without it. Uploaded files are never kept here, only their URLs, and only a
 * signed-in visitor can have one.
 */
const DRAFT_KEY = "creosmith.vastGen.draft.v1";
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function saveDraft(draft: GeneratorDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), draft }));
  } catch {
    /* storage unavailable: the form still works, the draft just does not persist */
  }
}

/**
 * The stored draft's raw string, as a `useSyncExternalStore` snapshot: a string
 * compares by value, so React sees it change only when the storage does. The
 * server snapshot is null, which is what keeps hydration identical.
 */
export function readDraftRaw(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

/** Another tab saving or clearing the draft (the sign-up confirmation opens in one). */
export function subscribeDraft(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mediaFrom(value: unknown): MediaDraft | null {
  if (!isObject(value) || (value.source !== "upload" && value.source !== "external")) return null;
  if (typeof value.url !== "string" || typeof value.mime !== "string") return null;
  const number = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
  return {
    source: value.source,
    url: value.url,
    mime: value.mime,
    width: number(value.width),
    height: number(value.height),
    durationMs: number(value.durationMs),
    bytes: number(value.bytes),
    ...(typeof value.fileName === "string" ? { fileName: value.fileName } : {}),
  };
}

/**
 * A stored draft read back field by field over an empty one. Storage is
 * written by an older form as often as by this one, and by anything else on
 * this origin, so nothing is taken on its shape: a value of the wrong kind
 * falls back to the empty draft's, and a version this form no longer offers to
 * the default — a draft that crashed the page on every visit would leave the
 * visitor no "Start over" to press.
 */
function sanitizeDraft(raw: unknown): GeneratorDraft | null {
  if (!isObject(raw)) return null;
  const draft = emptyDraft();
  const text = (key: keyof GeneratorDraft) => {
    if (typeof raw[key] === "string") (draft as unknown as Record<string, unknown>)[key] = raw[key];
  };
  for (const key of [
    "name",
    "adTitle",
    "description",
    "advertiser",
    "clickThroughUrl",
    "skipSeconds",
    "companionClickThroughUrl",
    "iconProgram",
    "iconWidth",
    "iconHeight",
    "iconOffsetSeconds",
    "iconDurationSeconds",
    "iconClickThroughUrl",
    "omidVendor",
    "omidScriptUrl",
    "omidParameters",
    "uaidRegistry",
    "uaidValue",
  ] as const) {
    text(key);
  }
  if ((GENERATOR_VERSIONS as readonly unknown[]).includes(raw.version)) draft.version = raw.version as VastVersion;
  for (const key of ["skip", "icon", "omid"] as const) if (raw[key] === "on" || raw[key] === "off") draft[key] = raw[key];
  if (raw.uaid === "auto" || raw.uaid === "custom") draft.uaid = raw.uaid;
  if (typeof raw.iconCorner === "string" && Object.hasOwn(POSITION, raw.iconCorner)) {
    draft.iconCorner = raw.iconCorner as Corner;
  }
  draft.media = mediaFrom(raw.media);
  draft.iconImage = mediaFrom(raw.iconImage);
  if (Array.isArray(raw.pixels)) {
    draft.pixels = raw.pixels
      .filter((pixel): pixel is Record<string, unknown> => isObject(pixel))
      .filter((pixel) => typeof pixel.type === "string" && typeof pixel.url === "string")
      .map((pixel) => ({ key: rowKey(), type: pixel.type as PixelType, url: pixel.url as string }));
  }
  if (Array.isArray(raw.companions)) {
    draft.companions = raw.companions.filter(isObject).map((companion) => ({
      key: rowKey(),
      image: mediaFrom(companion.image),
      width: typeof companion.width === "string" ? companion.width : "",
      height: typeof companion.height === "string" ? companion.height : "",
      altText: typeof companion.altText === "string" ? companion.altText : "",
    }));
  }
  return draft;
}

export function parseStoredDraft(raw: string | null): GeneratorDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown; draft?: unknown };
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) return null;
    return sanitizeDraft(parsed.draft);
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Removes a stored draft that has expired or cannot be read, so "kept for at
 * most a day" (ADR-0036) holds for what sits in storage, not only for what is
 * shown. Called from an effect, never from a render.
 */
export function pruneStoredDraft(): void {
  const raw = readDraftRaw();
  if (raw && !parseStoredDraft(raw)) clearDraft();
}

/** True when nothing in the draft differs from a fresh one — the only draft not worth keeping. */
export function isEmptyDraft(draft: GeneratorDraft): boolean {
  const empty = emptyDraft();
  if (draft.pixels.length > 0 || draft.companions.length > 0) return false;
  return (Object.keys(empty) as (keyof GeneratorDraft)[])
    .filter((key) => key !== "pixels" && key !== "companions")
    .every((key) => draft[key] === empty[key]);
}
