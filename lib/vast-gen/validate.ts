import { isHttpUrl, isScriptUrl } from "@/lib/click-destination";
import { MEDIA_MAX_BYTES, mediaHost, parseOwnMediaUrl } from "@/lib/creative-media";
import { getCdnUrl, getSiteUrl } from "@/lib/site";
import { ipLiteral, isPublicIpAddress } from "@/lib/vast-inspect/address";
import { VAST_VERSIONS, type VastVersion } from "@/lib/vast-inspect/model";
import { pixelMacros, type PixelKind } from "@/lib/vast-inspect/spec";
import { checkUrl, macrosIn, mimeFromUrl } from "@/lib/vast-inspect/url";
import type {
  AdChoicesIcon,
  CompanionBanner,
  EventTracker,
  ImageAsset,
  ImageMime,
  MediaSource,
  OmidVerification,
  TrackerSet,
  UniversalAdIdValue,
  VideoConfig,
  VideoMedia,
  VideoMime,
} from "./model";
import { supports, trackerEvents, type GeneratorFeature } from "./spec";

/**
 * The one reading of a VAST video creative's config (ADR-0035), shared by the
 * save action, the browser's live preview and the ad path.
 *
 * It runs at serve time too, and that is the point rather than a belt to the
 * save's braces: an owner can PATCH their own `config_json` through PostgREST,
 * past every server action, so the action is not the control — this is
 * (docs/security.md, "Column grants on `creatives`"). Whatever this returns is
 * what the builder may write into a document a stranger's player executes on a
 * publisher's page.
 *
 * Three modes, one rulebook:
 * - `save`    — strict. Any issue refuses the save, with a code the form maps to
 *               a sentence. Uploaded media must sit under `ownerId`'s prefix.
 * - `preview` — strict, without an owner: the generator previews for signed-out
 *               visitors, who cannot have uploads.
 * - `serve`   — lenient where it can afford to be. A stored config was valid
 *               when it was saved, so a rule tightened by a later deploy must
 *               not silently dark a live tag: an invalid *optional* part — one
 *               tracker, an icon, the verification — is dropped and the ad
 *               still serves. An invalid *required* part (version, title,
 *               media) fails closed, because there is no ad without it.
 */

export const LIMITS = {
  text: 200,
  description: 1000,
  url: 2048,
  impression: 10,
  error: 10,
  click: 10,
  events: 30,
  viewability: 5,
  companions: 3,
  companionTrackers: 5,
  iconTrackers: 5,
  omidParameters: 4096,
  /** The whole stored object, JSON-serialised. */
  configChars: 32_768,
  minDurationMs: 1_000,
  maxDurationMs: 300_000,
  minSide: 16,
  maxSide: 7680,
  maxBannerSide: 4096,
  maxIconSide: 512,
  program: 64,
  registry: 100,
  idValue: 200,
} as const;

export type IssueCode =
  | "bad_shape"
  | "required"
  | "too_long"
  | "too_many"
  | "too_large"
  | "bad_version"
  | "bad_url"
  | "not_https"
  | "not_http"
  | "script_scheme"
  | "unknown_macro"
  | "macro_in_host"
  | "destination_macro"
  | "credentials_in_url"
  | "placeholder_value"
  | "own_host"
  | "private_host"
  | "error_macro_missing"
  | "error_macro_unavailable"
  | "not_own_media"
  | "bad_mime"
  | "mime_mismatch"
  | "out_of_range"
  | "bad_event"
  | "duplicate";

/** `path` is the config path the form highlights, e.g. `trackers.impression.2`. */
export interface Issue {
  path: string;
  code: IssueCode;
}

export interface ParseOptions {
  mode: "save" | "serve" | "preview";
  /** The creative's owner; required for `save` and `serve`, absent for `preview`. */
  ownerId?: string;
}

export type ParseResult =
  | { ok: true; config: VideoConfig; dropped: GeneratorFeature[] }
  | { ok: false; issues: Issue[] };

/* ---------- primitives ---------- */

/**
 * What XML 1.0 cannot carry (C0 controls, DEL, U+FFFE/U+FFFF, a lone
 * surrogate), none of which belongs in a title either. `lib/vast/xml.ts`
 * strips the same at emit time; stripping here keeps the stored value equal
 * to the emitted one.
 */
const CONTROL_RE =
  /[\u0000-\u001f\u007f\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/** The same, less the line break a multi-line field — the description — keeps. */
const CONTROL_EXCEPT_LF_RE =
  /[\u0000-\u0009\u000b-\u001f\u007f\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/**
 * What a URL we publish may never contain: whitespace and controls (XML keeps
 * them, players trip on them), the two non-characters XML refuses, and `<` /
 * `>`, which a well-formed URL carries percent-encoded. Refusing the angle
 * brackets is also what keeps `]]>` — the one sequence a CDATA section cannot
 * hold — out of every URL we emit. And a backslash: WHATWG reads it as `/`, a
 * stricter parser does not, so `https://a.example\@smithcdn.net/` names a
 * different host to each of them.
 */
const URL_FORBIDDEN_RE = /[\s\u0000-\u001f\u007f\uFFFE\uFFFF<>\\]/;
/** A VAST bracket macro or an ad server's `%%MACRO%%`. */
const ANY_MACRO_RE = /\[[A-Z_]+\]|%%[A-Z_]+%%/;
const AD_SERVER_MACRO_RE = /%%[A-Z_]+%%/;
const NO_MACROS: ReadonlySet<string> = new Set();

/**
 * Names that resolve inside the viewer's own network, never on the internet:
 * the reserved ones (RFC 6761, RFC 8375, ICANN's `.internal`) and the
 * undelegated suffixes routers and intranets use.
 */
const PRIVATE_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".localdomain",
  ".lan",
  ".intranet",
  ".corp",
  ".home",
];

/** UniversalAdId values that identify nothing; the inspector warns on the same list. */
const UAID_PLACEHOLDERS = ["unknown", "-", "n/a"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Code points, as a `check (char_length(...))` counts — never half an emoji. */
function length(value: string): number {
  return Array.from(value).length;
}

/**
 * The authority of an absolute URL as written: between `//` and the first
 * `/`, `?` or `#`. Read off the raw string, because the parsed one has had its
 * macros replaced — which is the point: `https://192.168.1.[ADCOUNT]/p` parses
 * as a harmless name, and the player turns it into a private address.
 */
function authorityOf(url: string): string {
  const start = url.indexOf("//");
  if (start < 0) return "";
  const rest = url.slice(start + 2);
  const end = rest.search(/[/?#]/);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Hosts that are ours: the app, the ad domain, the media host, the validator's
 * sandbox, the Supabase project (the legacy media store), by configuration and
 * by name. A tracker, a destination or a linked file pointing at one is
 * refused. The ad domain is the sharp case: a signed `/r` or `/t` link copied
 * out of someone else's tag is a valid https URL, and pasted as a "tracker" it
 * would fire on every impression of this creative — recording clicks, for up
 * to a day, on a creative its pixel's owner never served. The media hosts are
 * the other: linking another account's upload as "your own link" would serve
 * their file under your tag.
 *
 * Read through the same helpers the rest of the app uses, each of which reads
 * its `process.env.NEXT_PUBLIC_*` literally, so a client bundle inlines them.
 * Cached on the values themselves, which a test may change between runs.
 */
let ownHostsCache: { key: string; hosts: string[] } | null = null;

function ownHosts(): string[] {
  const configured = [
    getSiteUrl(),
    getCdnUrl(),
    mediaHost(),
    process.env.NEXT_PUBLIC_SANDBOX_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ];
  const key = configured.join("|");
  if (ownHostsCache?.key === key) return ownHostsCache.hosts;
  const hosts = new Set(["creosmith.com", "smithcdn.net"]);
  for (const value of configured) {
    if (!value) continue;
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      /* an unparseable variable adds nothing */
    }
  }
  ownHostsCache = { key, hosts: [...hosts] };
  return ownHostsCache.hosts;
}

/**
 * Why a host may not appear in a URL we publish, or null when it may.
 *
 * These URLs are fetched by a *viewer's* browser, on a publisher's page, so a
 * private address points the pixel at the viewer's own network — their router,
 * a corporate intranet — and a single-label name resolves nowhere else. A
 * public IP literal is allowed: unusual, but it reaches the internet.
 */
function hostIssue(hostname: string): IssueCode | null {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  if (!host || host.split(".").some((label) => label === "")) return "bad_url";
  if (host === "localhost" || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return "private_host";
  }
  const literal = ipLiteral(host);
  if (literal) {
    return isPublicIpAddress(literal.address, literal.family) ? null : "private_host";
  }
  if (!host.includes(".")) return "private_host";
  for (const own of ownHosts()) {
    if (host === own || host.endsWith(`.${own}`)) return "own_host";
  }
  return null;
}

function cleanText(
  raw: unknown,
  max: number,
  path: string,
  issues: Issue[],
  required: boolean,
  multiline = false,
): string | undefined {
  if (raw === undefined || raw === null || raw === "") {
    if (required) issues.push({ path, code: "required" });
    return undefined;
  }
  if (typeof raw !== "string") {
    issues.push({ path, code: "bad_shape" });
    return undefined;
  }
  const value = (
    multiline ? raw.replace(/\r\n?/g, "\n").replace(CONTROL_EXCEPT_LF_RE, "") : raw.replace(CONTROL_RE, "")
  ).trim();
  if (!value) {
    if (required) issues.push({ path, code: "required" });
    return undefined;
  }
  if (length(value) > max) {
    issues.push({ path, code: "too_long" });
    return undefined;
  }
  return value;
}

function integer(raw: unknown, min: number, max: number, path: string, issues: Issue[]): number | undefined {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    issues.push({ path, code: raw === undefined ? "required" : "bad_shape" });
    return undefined;
  }
  if (raw < min || raw > max) {
    issues.push({ path, code: "out_of_range" });
    return undefined;
  }
  return raw;
}

type ErrorMacroRule = "required" | "forbidden" | "any";

interface TrackerRules {
  /** Which pixel this is, for the macros a player substitutes in it (IAB's macro data). */
  kind?: PixelKind;
  errorMacro?: ErrorMacroRule;
  /** A URL the player loads rather than pings (the OMID script): no macro is substituted in it. */
  noMacros?: boolean;
}

/**
 * A third-party pixel the *player* fetches: https, a public host that is not
 * ours, and no macro a player would leave unsubstituted in that kind of pixel,
 * nor one in the host, where the player's substitution would name a host we
 * never checked. Stored exactly as typed — re-serialising through `URL` would
 * rewrite the buyer's query string, and the macros with it.
 */
function trackerUrl(raw: unknown, path: string, issues: Issue[], rules: TrackerRules = {}): string | undefined {
  const { kind = "other", errorMacro = "any", noMacros = false } = rules;
  if (typeof raw !== "string") {
    issues.push({ path, code: raw === undefined || raw === "" ? "required" : "bad_shape" });
    return undefined;
  }
  const url = raw.trim();
  if (!url) {
    issues.push({ path, code: "required" });
    return undefined;
  }
  if (length(url) > LIMITS.url) {
    issues.push({ path, code: "too_long" });
    return undefined;
  }
  if (URL_FORBIDDEN_RE.test(url)) {
    issues.push({ path, code: "bad_url" });
    return undefined;
  }
  if (isScriptUrl(url)) {
    issues.push({ path, code: "script_scheme" });
    return undefined;
  }
  if (ANY_MACRO_RE.test(authorityOf(url))) {
    issues.push({ path, code: "macro_in_host" });
    return undefined;
  }
  const verdict = checkUrl(url);
  if (!verdict.ok || !verdict.url) {
    issues.push({ path, code: verdict.scheme ? "not_https" : "bad_url" });
    return undefined;
  }
  if (verdict.url.protocol !== "https:") {
    issues.push({ path, code: "not_https" });
    return undefined;
  }
  // A browser refuses to send a subresource request carrying credentials, so
  // the pixel would never fire.
  if (verdict.url.username || verdict.url.password) {
    issues.push({ path, code: "credentials_in_url" });
    return undefined;
  }
  const macros = macrosIn(url);
  const allowed = noMacros ? NO_MACROS : pixelMacros(kind);
  if (macros.some((macro) => !allowed.has(macro)) || AD_SERVER_MACRO_RE.test(url)) {
    issues.push({ path, code: "unknown_macro" });
    return undefined;
  }
  const hasErrorCode = macros.includes("ERRORCODE");
  if (errorMacro === "required" && !hasErrorCode) {
    issues.push({ path, code: "error_macro_missing" });
    return undefined;
  }
  if (errorMacro === "forbidden" && hasErrorCode) {
    issues.push({ path, code: "error_macro_unavailable" });
    return undefined;
  }
  const host = hostIssue(verdict.url.hostname);
  if (host) {
    issues.push({ path, code: host });
    return undefined;
  }
  return url;
}

/**
 * Where a click sends the viewer. http or https — a landing may still be http —
 * never a script scheme, never our own hosts. `{click_id}` and the other
 * destination macros are left for `/r` to expand (lib/click-destination.ts).
 * A `[MACRO]` is refused: the click reaches the destination through `/r`, so no
 * player ever sees the destination to substitute into it, and the buyer's
 * parameter would arrive as literal brackets.
 */
function destinationUrl(raw: unknown, path: string, issues: Issue[]): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") {
    issues.push({ path, code: "bad_shape" });
    return undefined;
  }
  const url = raw.trim();
  if (!url) return undefined;
  if (length(url) > LIMITS.url) {
    issues.push({ path, code: "too_long" });
    return undefined;
  }
  if (URL_FORBIDDEN_RE.test(url)) {
    issues.push({ path, code: "bad_url" });
    return undefined;
  }
  if (isScriptUrl(url)) {
    issues.push({ path, code: "script_scheme" });
    return undefined;
  }
  if (ANY_MACRO_RE.test(url)) {
    issues.push({ path, code: "destination_macro" });
    return undefined;
  }
  if (!isHttpUrl(url)) {
    issues.push({ path, code: "not_http" });
    return undefined;
  }
  const parsed = new URL(url);
  if (parsed.username || parsed.password) {
    // `https://creosmith.com@elsewhere.example` reads as our address and is not.
    issues.push({ path, code: "credentials_in_url" });
    return undefined;
  }
  const host = hostIssue(parsed.hostname);
  if (host) {
    issues.push({ path, code: host });
    return undefined;
  }
  return url;
}

function urlList(
  raw: unknown,
  max: number,
  path: string,
  issues: Issue[],
  lenient: boolean,
  rules: TrackerRules = {},
): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    if (!lenient) issues.push({ path, code: "bad_shape" });
    return [];
  }
  if (raw.length > max) {
    if (!lenient) {
      issues.push({ path, code: "too_many" });
      return [];
    }
  }
  const out: string[] = [];
  for (const [index, entry] of raw.slice(0, max).entries()) {
    const local: Issue[] = [];
    const url = trackerUrl(entry, `${path}.${index}`, local, rules);
    if (local.length > 0) {
      if (!lenient) issues.push(...local);
      continue;
    }
    if (!url) continue;
    if (out.includes(url)) {
      // A duplicate pixel double-counts its owner's numbers.
      if (!lenient) issues.push({ path: `${path}.${index}`, code: "duplicate" });
      continue;
    }
    out.push(url);
  }
  return out;
}

/* ---------- media ---------- */

const VIDEO_EXTENSION_MIME: Record<string, VideoMime> = { mp4: "video/mp4", webm: "video/webm" };
const IMAGE_EXTENSION_MIME: Record<string, ImageMime> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
};
/** What a video creative's video and images may be; the form's pickers offer exactly these. */
export const VIDEO_MIMES: readonly VideoMime[] = ["video/mp4", "video/webm"];
export const IMAGE_MIMES: readonly ImageMime[] = ["image/png", "image/jpeg", "image/gif"];

/**
 * A media URL and the MIME type a MediaFile or StaticResource will declare for
 * it. The declared type must match the file (adtech-standards.md): an upload's
 * type is its key's extension, which we minted from the uploaded type; a
 * linked file's is the buyer's declaration, checked against its extension when
 * it has one.
 */
function mediaFile<M extends string>(
  raw: unknown,
  path: string,
  issues: Issue[],
  ownerId: string | undefined,
  byExtension: Record<string, M>,
  allowed: readonly M[],
): { source: MediaSource; url: string; mime: M } | undefined {
  if (!isRecord(raw)) {
    issues.push({ path, code: raw === undefined ? "required" : "bad_shape" });
    return undefined;
  }
  const source = raw.source;
  if (source !== "upload" && source !== "external") {
    issues.push({ path: `${path}.source`, code: "bad_shape" });
    return undefined;
  }
  if (typeof raw.url !== "string" || !raw.url.trim()) {
    issues.push({ path: `${path}.url`, code: "required" });
    return undefined;
  }
  const url = raw.url.trim();
  if (length(url) > LIMITS.url) {
    issues.push({ path: `${path}.url`, code: "too_long" });
    return undefined;
  }

  if (source === "upload") {
    const own = parseOwnMediaUrl(url);
    if (!own || (ownerId !== undefined && !own.key.startsWith(`${ownerId}/`))) {
      issues.push({ path: `${path}.url`, code: "not_own_media" });
      return undefined;
    }
    const extension = own.key.slice(own.key.lastIndexOf(".") + 1);
    if (!Object.hasOwn(byExtension, extension)) {
      issues.push({ path: `${path}.url`, code: "bad_mime" });
      return undefined;
    }
    return { source, url, mime: byExtension[extension] };
  }

  // A linked file: everything a tracker must be, and no macros at all — a
  // player substitutes them in pixels, not in the asset it is about to play.
  if (ANY_MACRO_RE.test(url) || URL_FORBIDDEN_RE.test(url)) {
    issues.push({ path: `${path}.url`, code: "bad_url" });
    return undefined;
  }
  const verdict = checkUrl(url);
  if (!verdict.ok || !verdict.url) {
    issues.push({ path: `${path}.url`, code: "bad_url" });
    return undefined;
  }
  if (verdict.url.protocol !== "https:") {
    issues.push({ path: `${path}.url`, code: "not_https" });
    return undefined;
  }
  if (verdict.url.username || verdict.url.password) {
    issues.push({ path: `${path}.url`, code: "credentials_in_url" });
    return undefined;
  }
  const host = hostIssue(verdict.url.hostname);
  if (host) {
    issues.push({ path: `${path}.url`, code: host });
    return undefined;
  }
  const declared = raw.mime;
  if (typeof declared !== "string" || !(allowed as readonly string[]).includes(declared)) {
    issues.push({ path: `${path}.mime`, code: "bad_mime" });
    return undefined;
  }
  const implied = mimeFromUrl(url);
  if (implied && implied !== declared) {
    issues.push({ path: `${path}.mime`, code: "mime_mismatch" });
    return undefined;
  }
  return { source, url, mime: declared as M };
}

function videoMedia(raw: unknown, issues: Issue[], ownerId: string | undefined): VideoMedia | undefined {
  const local: Issue[] = [];
  const file = mediaFile(raw, "media", local, ownerId, VIDEO_EXTENSION_MIME, VIDEO_MIMES);
  if (!file || !isRecord(raw)) {
    issues.push(...local);
    return undefined;
  }
  const width = integer(raw.width, LIMITS.minSide, LIMITS.maxSide, "media.width", local);
  const height = integer(raw.height, LIMITS.minSide, LIMITS.maxSide, "media.height", local);
  const durationMs = integer(raw.durationMs, LIMITS.minDurationMs, LIMITS.maxDurationMs, "media.durationMs", local);
  if (local.length > 0 || width === undefined || height === undefined || durationMs === undefined) {
    issues.push(...local);
    return undefined;
  }
  const media: VideoMedia = { ...file, width, height, durationMs };
  // Size is known only for our own uploads: the save action re-reads it from
  // R2 rather than trusting the browser, and bitrate is derived from it here.
  if (file.source === "upload" && typeof raw.bytes === "number" && Number.isInteger(raw.bytes)) {
    if (raw.bytes > 0 && raw.bytes <= MEDIA_MAX_BYTES) {
      media.bytes = raw.bytes;
      // bits per millisecond is kilobits per second.
      media.bitrateKbps = Math.max(1, Math.round((raw.bytes * 8) / durationMs));
    }
  }
  return media;
}

function imageAsset(raw: unknown, path: string, issues: Issue[], ownerId: string | undefined): ImageAsset | undefined {
  return mediaFile(raw, path, issues, ownerId, IMAGE_EXTENSION_MIME, IMAGE_MIMES);
}

/* ---------- parts ---------- */

function trackerSet(raw: unknown, version: VastVersion, issues: Issue[], lenient: boolean): TrackerSet {
  const empty: TrackerSet = {
    impression: [],
    error: [],
    click: [],
    events: [],
    viewable: [],
    notViewable: [],
    viewUndetermined: [],
  };
  if (raw === undefined || raw === null) return empty;
  if (!isRecord(raw)) {
    if (!lenient) issues.push({ path: "trackers", code: "bad_shape" });
    return empty;
  }
  const errorMacro: ErrorMacroRule = supports(version, "errorMacro") ? "required" : "forbidden";
  const viewability = supports(version, "viewableImpression");
  return {
    impression: urlList(raw.impression, LIMITS.impression, "trackers.impression", issues, lenient),
    error: supports(version, "thirdPartyError")
      ? urlList(raw.error, LIMITS.error, "trackers.error", issues, lenient, { kind: "error", errorMacro })
      : [],
    click: urlList(raw.click, LIMITS.click, "trackers.click", issues, lenient, { kind: "click" }),
    events: eventTrackers(raw.events, version, issues, lenient),
    viewable: viewability ? urlList(raw.viewable, LIMITS.viewability, "trackers.viewable", issues, lenient) : [],
    notViewable: viewability
      ? urlList(raw.notViewable, LIMITS.viewability, "trackers.notViewable", issues, lenient)
      : [],
    viewUndetermined: viewability
      ? urlList(raw.viewUndetermined, LIMITS.viewability, "trackers.viewUndetermined", issues, lenient)
      : [],
  };
}

function eventTrackers(raw: unknown, version: VastVersion, issues: Issue[], lenient: boolean): EventTracker[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    if (!lenient) issues.push({ path: "trackers.events", code: "bad_shape" });
    return [];
  }
  if (raw.length > LIMITS.events && !lenient) {
    issues.push({ path: "trackers.events", code: "too_many" });
    return [];
  }
  const allowed = trackerEvents(version);
  const out: EventTracker[] = [];
  for (const [index, entry] of raw.slice(0, LIMITS.events).entries()) {
    const path = `trackers.events.${index}`;
    const local: Issue[] = [];
    if (!isRecord(entry)) {
      local.push({ path, code: "bad_shape" });
    } else if (typeof entry.event !== "string" || !allowed.includes(entry.event)) {
      // The form only offers events this version's XSD names, so anything else
      // is stale or hand-written — and a player silently ignores it.
      local.push({ path: `${path}.event`, code: "bad_event" });
    }
    const url = local.length === 0 && isRecord(entry) ? trackerUrl(entry.url, `${path}.url`, local) : undefined;
    if (local.length > 0 || !url || !isRecord(entry)) {
      if (!lenient) issues.push(...local);
      continue;
    }
    const event = entry.event as string;
    if (out.some((tracker) => tracker.event === event && tracker.url === url)) {
      if (!lenient) issues.push({ path, code: "duplicate" });
      continue;
    }
    out.push({ event, url });
  }
  return out;
}

function companions(
  raw: unknown,
  version: VastVersion,
  issues: Issue[],
  lenient: boolean,
  ownerId: string | undefined,
): CompanionBanner[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    if (!lenient) issues.push({ path: "companions", code: "bad_shape" });
    return [];
  }
  if (raw.length > LIMITS.companions && !lenient) {
    issues.push({ path: "companions", code: "too_many" });
    return [];
  }
  const out: CompanionBanner[] = [];
  for (const [index, entry] of raw.slice(0, LIMITS.companions).entries()) {
    const path = `companions.${index}`;
    const local: Issue[] = [];
    if (!isRecord(entry)) {
      if (!lenient) issues.push({ path, code: "bad_shape" });
      continue;
    }
    const image = imageAsset(entry.image, `${path}.image`, local, ownerId);
    const width = integer(entry.width, 1, LIMITS.maxBannerSide, `${path}.width`, local);
    const height = integer(entry.height, 1, LIMITS.maxBannerSide, `${path}.height`, local);
    const altText = cleanText(entry.altText, LIMITS.text, `${path}.altText`, local, false);
    const creativeView = urlList(
      entry.creativeView,
      LIMITS.companionTrackers,
      `${path}.creativeView`,
      local,
      lenient,
    );
    const clickTracking = supports(version, "companionClickTracking")
      ? urlList(entry.clickTracking, LIMITS.companionTrackers, `${path}.clickTracking`, local, lenient, {
          kind: "click",
        })
      : [];
    if (local.length > 0 || !image || width === undefined || height === undefined) {
      if (!lenient) issues.push(...local);
      continue;
    }
    out.push({ image, width, height, ...(altText ? { altText } : {}), creativeView, clickTracking });
  }
  return out;
}

function icon(
  raw: unknown,
  durationMs: number,
  issues: Issue[],
  lenient: boolean,
  ownerId: string | undefined,
): AdChoicesIcon | undefined {
  if (raw === undefined || raw === null) return undefined;
  const local: Issue[] = [];
  if (!isRecord(raw)) {
    if (!lenient) issues.push({ path: "icon", code: "bad_shape" });
    return undefined;
  }
  const program = cleanText(raw.program, LIMITS.program, "icon.program", local, true);
  const image = imageAsset(raw.image, "icon.image", local, ownerId);
  const width = integer(raw.width, 1, LIMITS.maxIconSide, "icon.width", local);
  const height = integer(raw.height, 1, LIMITS.maxIconSide, "icon.height", local);
  const xPosition = raw.xPosition === "left" || raw.xPosition === "right" ? raw.xPosition : undefined;
  if (!xPosition) local.push({ path: "icon.xPosition", code: "bad_shape" });
  const yPosition = raw.yPosition === "top" || raw.yPosition === "bottom" ? raw.yPosition : undefined;
  if (!yPosition) local.push({ path: "icon.yPosition", code: "bad_shape" });
  const offsetMs = integer(raw.offsetMs ?? 0, 0, Math.max(0, durationMs - 1), "icon.offsetMs", local);
  const iconDuration =
    raw.durationMs === undefined || raw.durationMs === null
      ? undefined
      : integer(raw.durationMs, 1, durationMs, "icon.durationMs", local);
  // Shown from its offset for its duration, which together must end within the ad.
  if (offsetMs !== undefined && iconDuration !== undefined && offsetMs + iconDuration > durationMs) {
    local.push({ path: "icon.durationMs", code: "out_of_range" });
  }
  const clickThroughUrl = destinationUrl(raw.clickThroughUrl, "icon.clickThroughUrl", local);
  const clickTracking = urlList(raw.clickTracking, LIMITS.iconTrackers, "icon.clickTracking", local, lenient, {
    kind: "click",
  });
  const viewTracking = urlList(raw.viewTracking, LIMITS.iconTrackers, "icon.viewTracking", local, lenient);
  if (
    local.length > 0 ||
    !program ||
    !image ||
    width === undefined ||
    height === undefined ||
    !xPosition ||
    !yPosition ||
    offsetMs === undefined
  ) {
    if (!lenient) issues.push(...local);
    return undefined;
  }
  return {
    program,
    image,
    width,
    height,
    xPosition,
    yPosition,
    offsetMs,
    ...(iconDuration !== undefined ? { durationMs: iconDuration } : {}),
    ...(clickThroughUrl ? { clickThroughUrl } : {}),
    clickTracking,
    viewTracking,
  };
}

function verification(raw: unknown, issues: Issue[], lenient: boolean): OmidVerification | undefined {
  if (raw === undefined || raw === null) return undefined;
  const local: Issue[] = [];
  if (!isRecord(raw)) {
    if (!lenient) issues.push({ path: "verification", code: "bad_shape" });
    return undefined;
  }
  const vendor = cleanText(raw.vendor, LIMITS.text, "verification.vendor", local, true);
  // The vendor's script is fetched by the player like any pixel, so it is held
  // to the tracker rules — https, a public host — and to no macro at all: a
  // player substitutes macros in the pixels it pings, not in a script it loads.
  const scriptUrl = trackerUrl(raw.scriptUrl, "verification.scriptUrl", local, { noMacros: true });
  let parameters: string | undefined;
  if (raw.parameters !== undefined && raw.parameters !== null && raw.parameters !== "") {
    if (typeof raw.parameters !== "string") local.push({ path: "verification.parameters", code: "bad_shape" });
    else if (raw.parameters.length > LIMITS.omidParameters) {
      local.push({ path: "verification.parameters", code: "too_long" });
    } else {
      // Opaque to us and passed through unchanged (ADR-0012), less the control
      // characters XML cannot carry at all.
      parameters = raw.parameters.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() || undefined;
    }
  }
  if (local.length > 0 || !vendor || !scriptUrl) {
    if (!lenient) issues.push(...local);
    return undefined;
  }
  return { vendor, scriptUrl, ...(parameters ? { parameters } : {}) };
}

function universalAdId(raw: unknown, issues: Issue[], lenient: boolean): UniversalAdIdValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  const local: Issue[] = [];
  if (!isRecord(raw)) {
    if (!lenient) issues.push({ path: "universalAdId", code: "bad_shape" });
    return undefined;
  }
  const registry = cleanText(raw.registry, LIMITS.registry, "universalAdId.registry", local, true);
  const value = cleanText(raw.value, LIMITS.idValue, "universalAdId.value", local, true);
  if (value && UAID_PLACEHOLDERS.includes(value.toLowerCase())) {
    local.push({ path: "universalAdId.value", code: "placeholder_value" });
  }
  if (local.length > 0 || !registry || !value) {
    if (!lenient) issues.push(...local);
    return undefined;
  }
  return { registry, value };
}

/* ---------- the whole config ---------- */

/** Whether `raw` names a value at `key` — present, and not an empty placeholder. */
function given(raw: Record<string, unknown>, key: string): boolean {
  const value = raw[key];
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function parseVideoConfig(input: unknown, options: ParseOptions): ParseResult {
  const lenient = options.mode === "serve";
  const ownerId = options.mode === "preview" ? undefined : options.ownerId;
  if ((options.mode === "save" || options.mode === "serve") && !ownerId) {
    // A save or a serve without an owner cannot check whose uploads these are.
    return { ok: false, issues: [{ path: "", code: "bad_shape" }] };
  }

  if (!isRecord(input)) return { ok: false, issues: [{ path: "", code: "bad_shape" }] };
  let serialised: string;
  try {
    serialised = JSON.stringify(input);
  } catch {
    return { ok: false, issues: [{ path: "", code: "bad_shape" }] };
  }
  if (serialised.length > LIMITS.configChars) {
    return { ok: false, issues: [{ path: "", code: "too_large" }] };
  }

  const issues: Issue[] = [];
  const optional = <T>(validate: (local: Issue[]) => T): T | undefined => {
    const local: Issue[] = [];
    const value = validate(local);
    if (local.length === 0) return value;
    if (!lenient) issues.push(...local);
    return undefined;
  };

  if (input.v !== 1) issues.push({ path: "v", code: "bad_shape" });
  const version = (VAST_VERSIONS as readonly unknown[]).includes(input.version)
    ? (input.version as VastVersion)
    : undefined;
  if (!version) issues.push({ path: "version", code: "bad_version" });
  const adTitle = cleanText(input.adTitle, LIMITS.text, "adTitle", issues, true);
  const media = videoMedia(input.media, issues, ownerId);

  // Required parts fail in every mode: there is no ad without them.
  if (issues.length > 0 || !version || !adTitle || !media) return { ok: false, issues };

  const dropped: GeneratorFeature[] = [];
  const gate = (feature: GeneratorFeature, present: boolean): boolean => {
    if (!present) return false;
    if (supports(version, feature)) return true;
    dropped.push(feature);
    return false;
  };

  const description = optional((local) =>
    cleanText(input.description, LIMITS.description, "description", local, false, true),
  );
  const advertiser = gate("advertiser", given(input, "advertiser"))
    ? optional((local) => cleanText(input.advertiser, LIMITS.text, "advertiser", local, false))
    : undefined;
  const clickThroughUrl = optional((local) => destinationUrl(input.clickThroughUrl, "clickThroughUrl", local));
  const skipOffsetMs = gate("skip", given(input, "skipOffsetMs"))
    ? optional((local) => integer(input.skipOffsetMs, 0, media.durationMs - 1, "skipOffsetMs", local))
    : undefined;
  const uaid = gate("universalAdId", given(input, "universalAdId"))
    ? universalAdId(input.universalAdId, issues, lenient)
    : undefined;
  const omid = gate("omid", given(input, "verification")) ? verification(input.verification, issues, lenient) : undefined;
  const trackers = trackerSet(input.trackers, version, issues, lenient);
  if (isRecord(input.trackers)) {
    const given_ = (key: string) => given(input.trackers as Record<string, unknown>, key);
    if (!supports(version, "viewableImpression") && ["viewable", "notViewable", "viewUndetermined"].some(given_)) {
      dropped.push("viewableImpression");
    }
    if (!supports(version, "thirdPartyError") && given_("error")) dropped.push("thirdPartyError");
  }
  const banners = companions(input.companions, version, issues, lenient, ownerId);
  if (
    !supports(version, "companionClickTracking") &&
    Array.isArray(input.companions) &&
    input.companions.some((entry) => isRecord(entry) && given(entry, "clickTracking"))
  ) {
    dropped.push("companionClickTracking");
  }
  // The companions' destination means nothing without a companion to click.
  const companionClickThroughUrl =
    banners.length > 0
      ? optional((local) => destinationUrl(input.companionClickThroughUrl, "companionClickThroughUrl", local))
      : undefined;
  const adChoices = gate("icon", given(input, "icon"))
    ? icon(input.icon, media.durationMs, issues, lenient, ownerId)
    : undefined;

  if (issues.length > 0) return { ok: false, issues };

  const config: VideoConfig = {
    v: 1,
    version,
    adTitle,
    ...(description ? { description } : {}),
    ...(advertiser ? { advertiser } : {}),
    media,
    ...(clickThroughUrl ? { clickThroughUrl } : {}),
    ...(companionClickThroughUrl ? { companionClickThroughUrl } : {}),
    ...(skipOffsetMs !== undefined ? { skipOffsetMs } : {}),
    ...(uaid ? { universalAdId: uaid } : {}),
    ...(omid ? { verification: omid } : {}),
    trackers,
    companions: banners,
    ...(adChoices ? { icon: adChoices } : {}),
  };
  // What is stored is this object, not the input, and it can be the larger of
  // the two (defaults, a derived bitrate); `serve` holds the stored one to the
  // same cap. Refusing here is what keeps a saved tag from being dark on its
  // first serve.
  if (!lenient && JSON.stringify(config).length > LIMITS.configChars) {
    return { ok: false, issues: [{ path: "", code: "too_large" }] };
  }
  return { ok: true, config, dropped: [...new Set(dropped)] };
}

/**
 * The version a stored config declares, without validating the rest — for the
 * no-ad answer of a creative that is not serving, which should still speak its
 * own version to a player that only reads that one.
 */
export function declaredVersion(input: unknown): VastVersion | undefined {
  if (!isRecord(input)) return undefined;
  return (VAST_VERSIONS as readonly unknown[]).includes(input.version) ? (input.version as VastVersion) : undefined;
}
