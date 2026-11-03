import type { Msg, RuleGroup, Severity, SpecRef, VastVersion } from "../model";
import { attr, descendants, type VNode } from "../xml-tree";

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

// Moved to ../url.ts (ADR-0035) so the VAST generator can share them without the
// XML tree; re-exported here so no rule's import changes.
export { checkUrl, isPlayableVideoType, macrosIn, mimeEquivalent, mimeFromUrl, type UrlVerdict } from "../url";

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

/**
 * Every node that declares VPAID, on either a MediaFile or a Creative.
 *
 * Lives here rather than in the interactive group because two groups now ask
 * the question: `interactive` to check how the unit is authored, and `modern`
 * to stay quiet about VAST elements a VPAID creative replaces with its own
 * machinery. A second copy of this predicate would be a second answer.
 */
export function vpaidNodes(root: VNode): VNode[] {
  return [...descendants(root, "MediaFile"), ...descendants(root, "Creative")].filter(
    (node) => (attr(node, "apiFramework") ?? "").toLowerCase() === "vpaid",
  );
}
