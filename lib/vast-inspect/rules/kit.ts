import type { Msg, RuleGroup, Severity, SpecRef, VastVersion } from "../model";
import type { VNode } from "../xml-tree";

/**
 * Shared vocabulary for the rule catalogue.
 *
 * A rule is a small, self-describing object rather than a branch in a big
 * function, for three reasons: it can cite the clause it enforces, it can be
 * gated on the version the document declares, and the catalogue can be listed
 * in the UI without running anything.
 *
 * Rules deliberately validate against prose rather than an XSD. There is no
 * published XSD for VAST 4.3 at all, XSD cannot express most of what actually
 * breaks players ("this URL is http on an https page", "this MediaFile claims
 * mp4 and ends in .webm"), and its error messages are unusable by a human.
 * See ADR-0014.
 */

export interface RuleContext {
  /** 0 for the tag the user supplied, 1+ for each wrapper we followed. */
  hop: number;
  /** Root element of this hop's document. */
  root: VNode;
  /** The version attribute exactly as written, if present at all. */
  declaredRaw?: string;
  /** The declared version snapped to one we have rules for. */
  declared?: VastVersion;
  /** Raw XML of this hop, for checks that must see the bytes (CDATA, macros). */
  source: string;
}

/** What a rule reports. The runner supplies id, group, severity and spec. */
export interface RuleHit {
  path: string;
  line?: number;
  message: Msg;
  hint: Msg;
  /** The offending value, rendered verbatim in mono — never inlined into prose. */
  offending?: string;
  /** Overrides the rule's default IAB code where a hit maps to a different one. */
  iabErrorCode?: number;
}

export interface Rule {
  id: string;
  group: RuleGroup;
  severity: Severity;
  spec: SpecRef;
  iabErrorCode?: number;
  /** Version gating. Absent means "applies to every version". */
  appliesTo?(ctx: RuleContext): boolean;
  check(ctx: RuleContext): RuleHit[];
}

/* ---------- spec references ---------- */

const VAST_42_URL = "https://iabtechlab.com/wp-content/uploads/2019/06/VAST_4.2_final_june26.pdf";
const VAST_43_URL = "https://iabtechlab.com/wp-content/uploads/2022/09/VAST_4.3.pdf";
const SIMID_12_URL = "https://iabtechlab.com/wp-content/uploads/2022/09/SIMID-1.2.pdf";
const OMID_URL = "https://iabtechlab.com/standards/open-measurement-sdk/";

export const vast = (section: string): SpecRef => ({ doc: "VAST 4.2", section, url: VAST_42_URL });
export const vast43 = (section: string): SpecRef => ({ doc: "VAST 4.3", section, url: VAST_43_URL });
export const simid = (section: string): SpecRef => ({ doc: "SIMID 1.2", section, url: SIMID_12_URL });
export const omid = (section: string): SpecRef => ({ doc: "OMID", section, url: OMID_URL });

/* ---------- shared predicates ---------- */

/** A `HH:MM:SS` or `HH:MM:SS.mmm` timestamp, which is the only legal Duration. */
export const DURATION_RE = /^\d{2,}:[0-5]\d:[0-5]\d(\.\d{1,3})?$/;

/** skipoffset accepts a timestamp or a percentage; nothing else. */
export const SKIPOFFSET_RE = /^(\d{2,}:[0-5]\d:[0-5]\d(\.\d{1,3})?|\d{1,3}%)$/;

export interface UrlVerdict {
  ok: boolean;
  url?: URL;
  /** Set when the string parses but is not http(s). */
  scheme?: string;
}

/**
 * VAST URIs must be absolute — a player has no base to resolve against, since
 * the document may have arrived through three redirects from another company.
 * Macros are stripped before parsing so `[CACHEBUSTING]` in a query string does
 * not make an otherwise valid URL look malformed.
 */
export function checkUrl(raw: string): UrlVerdict {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false };
  const withoutMacros = trimmed.replace(/\[[A-Z_]+\]/g, "MACRO").replace(/%%[A-Z_]+%%/g, "MACRO");
  let url: URL;
  try {
    url = new URL(withoutMacros);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, url, scheme: url.protocol };
  }
  return { ok: true, url };
}

/** Extension → the MIME type a correctly-authored MediaFile would declare. */
const EXTENSION_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
  mov: "video/quicktime",
  m3u8: "application/x-mpegurl",
  mpd: "application/dash+xml",
  js: "application/javascript",
  html: "text/html",
  "3gp": "video/3gpp",
  flv: "video/x-flv",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

/**
 * The MIME type implied by a URL's extension, or undefined when the URL carries
 * no usable extension (which is common and not itself a defect — plenty of
 * CDNs serve `/media/12345` with a correct Content-Type).
 */
export function mimeFromUrl(raw: string): string | undefined {
  const verdict = checkUrl(raw);
  if (!verdict.ok || !verdict.url) return undefined;
  const match = /\.([a-z0-9]{2,5})$/i.exec(verdict.url.pathname);
  if (!match) return undefined;
  return EXTENSION_MIME[match[1].toLowerCase()];
}

/**
 * Whether a MediaFile's declared type is playable video.
 *
 * `video/*` is not sufficient: on CTV the base rendition is normally an HLS or
 * DASH manifest, whose MIME types are `application/…`. Testing for the `video/`
 * prefix alone reports a conformant streaming creative as having no video.
 */
export function isPlayableVideoType(type: string | undefined): boolean {
  const value = (type ?? "").toLowerCase().split(";")[0].trim();
  if (value.startsWith("video/")) return true;
  return [
    "application/x-mpegurl",
    "application/vnd.apple.mpegurl",
    "application/dash+xml",
    "application/mp4",
  ].includes(value);
}

/** Two MIME types that mean the same thing to a player. */
export function mimeEquivalent(a: string, b: string): boolean {
  const norm = (value: string) =>
    value
      .toLowerCase()
      .split(";")[0]
      .trim()
      .replace("application/x-mpegurl", "application/vnd.apple.mpegurl")
      .replace("video/mpeg4", "video/mp4")
      .replace("text/javascript", "application/javascript")
      .replace("application/x-javascript", "application/javascript");
  return norm(a) === norm(b);
}

/** Every `[MACRO]` occurring in a string. */
export function macrosIn(text: string): string[] {
  return [...text.matchAll(/\[([A-Z_]+)\]/g)].map((match) => match[1]);
}

/**
 * True when the element's text was authored as a CDATA section.
 *
 * The parser hands back decoded text either way, so this reads the raw bytes.
 * It matters because a URL containing a bare `&` is only well-formed inside
 * CDATA, and a document that survives our parser may still break a stricter one.
 */
export function looksLikeCdata(source: string, tag: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${tag}\\b[^>]*>\\s*<!\\[CDATA\\[\\s*${escaped}`, "i");
  return re.test(source);
}

/**
 * Convenience for the very common "one hit per offending node" shape.
 *
 * `iabErrorCode` overrides the rule's default, for the cases where the same
 * rule maps to different codes depending on what it found.
 */
export function hit(
  node: VNode,
  message: Msg,
  hint: Msg,
  offending?: string,
  iabErrorCode?: number,
): RuleHit {
  return { path: node.path, line: node.line, message, hint, offending, iabErrorCode };
}

/**
 * Whether a node sits inside a Wrapper rather than an InLine.
 *
 * The distinction runs through half the catalogue: a Wrapper's Creatives carry
 * tracking and nothing else, so every "this element is required" rule has to
 * skip them or it reports a fault on every correctly-authored redirect.
 */
export function isInsideWrapper(node: VNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.name === "Wrapper") return true;
    if (current.name === "InLine") return false;
    current = current.parent;
  }
  return false;
}
