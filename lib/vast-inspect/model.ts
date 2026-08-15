/**
 * The vocabulary of the VAST inspection engine.
 *
 * Nothing here imports React, Next, or Supabase: the engine is a pure function
 * from "some bytes a stranger pasted" to a report, which is what makes it
 * testable against a fixture corpus without standing anything up.
 *
 * Every user-facing string produced by the engine is a `Msg`, carrying both
 * locales at the point it is written. Rule and feature copy deliberately does
 * NOT live in lib/i18n/dictionaries.ts: there are ~80 rules, they are a domain
 * dataset rather than UI chrome, and keeping both languages next to the rule is
 * what stops them drifting apart. UI chrome around the report still goes
 * through the dictionary (docs/design-system.md §8).
 */

/** Both locales, written together so neither can be forgotten. */
export interface Msg {
  ru: string;
  en: string;
}

/**
 * Severity is three-valued on purpose.
 *
 * - `error`    — violates the spec at the version the tag declares. Players are
 *                entitled to reject it, and many will.
 * - `warning`  — legal, but known to break in a meaningful slice of the market
 *                (deprecated constructs, http in an https page, ambiguity a
 *                player has to guess its way through).
 * - `advisory` — works everywhere; an opportunity, not a defect.
 *
 * Collapsing warning into advisory would hide the difference between "this will
 * bite you" and "you could do better", which is the difference an ad ops person
 * is actually reading the report for.
 */
export type Severity = "error" | "warning" | "advisory";

/** VAST versions the engine reasons about, oldest first. */
export const VAST_VERSIONS = ["2.0", "3.0", "4.0", "4.1", "4.2", "4.3"] as const;
export type VastVersion = (typeof VAST_VERSIONS)[number];

/** Where a rule comes from, so a finding can always be argued with. */
export interface SpecRef {
  /** e.g. "VAST 4.2", "SIMID 1.2", "OMID 1.4" */
  doc: string;
  /** e.g. "§3.7.1 MediaFile" — prose section, not an XSD type name */
  section: string;
  url: string;
}

export type RuleGroup =
  | "document"
  | "ad"
  | "inline"
  | "linear"
  | "wrapper"
  | "tracking"
  | "interactive"
  | "verification"
  | "modern"
  | "delivery";

export interface Finding {
  ruleId: string;
  group: RuleGroup;
  severity: Severity;
  /** XPath-ish anchor, e.g. /VAST/Ad[1]/InLine/Creatives/Creative[1]/Linear */
  path: string;
  /** Best-effort 1-based line in the source document. */
  line?: number;
  message: Msg;
  hint: Msg;
  spec: SpecRef;
  /** The IAB error code a player would report for this, where one exists. */
  iabErrorCode?: number;
  /** Which hop of the wrapper chain this was found in (0 = the tag itself). */
  hop: number;
  /** The offending value, shown verbatim in mono. Never interpolated into prose. */
  offending?: string;
}

/**
 * One request in the wrapper chain. Hop 0 is the tag the user gave us; each
 * subsequent hop is a `<VASTAdTagURI>` we followed.
 */
export interface Hop {
  index: number;
  /** The URL requested, or "(inline XML)" when the user pasted a document. */
  url: string;
  /** Differs from `url` when the server redirected us. */
  finalUrl?: string;
  status?: number;
  contentType?: string;
  bytes: number;
  elapsedMs: number;
  redirects: string[];
  kind: "wrapper" | "inline" | "empty" | "error";
  declaredVersion?: string;
  adSystem?: string;
  adCount: number;
  /** Set when the hop could not be retrieved or parsed at all. */
  error?: Msg;
}

/** Every kind of URL a player may ping, kept apart so the inventory is auditable. */
export type TrackerKind =
  | "impression"
  | "tracking"
  | "clickTracking"
  | "customClick"
  | "error"
  | "viewableImpression"
  | "notViewable"
  | "viewUndetermined"
  | "companionClickTracking"
  | "nonLinearClickTracking"
  | "iconViewTracking"
  | "iconClickTracking"
  | "verificationTracking";

export interface TrackerHit {
  hop: number;
  kind: TrackerKind;
  /** For `tracking`, the `event` attribute — "start", "firstQuartile", … */
  event?: string;
  url: string;
  path: string;
}

/**
 * A row of the version/feature matrix. `since` is the version that introduced
 * the element; `availableAtDeclaredVersion` is what turns a static spec table
 * into advice about *this* tag ("you can't use Mezzanine, you declared 3.0").
 */
export interface FeatureHit {
  id: string;
  label: Msg;
  since: VastVersion;
  deprecatedIn?: VastVersion;
  removedIn?: VastVersion;
  present: boolean;
  /**
   * What makes the hit concrete: a count, an element name, an attribute value.
   *
   * Machine text, rendered in mono and identical in both locales — so it must
   * never contain prose. A localised detail would need to be a `Msg`, and the
   * fact that it is a bare `string` is the type saying so.
   */
  detail?: string;
  availableAtDeclaredVersion: boolean;
}

export type InteractiveStandard = "VPAID" | "SIMID" | "OMID";

/**
 * The interactive-standards section. This is the part of the report the rest of
 * the market does not really have, and it is the part that matches what this
 * product actually builds (docs/adtech-standards.md).
 */
export interface InteractiveHit {
  standard: InteractiveStandard;
  present: boolean;
  path?: string;
  /** The script or document URL the standard points at. */
  resource?: string;
  attrs?: Record<string, string>;
  notes: Msg[];
}

export interface Recommendation {
  id: string;
  severity: Severity;
  title: Msg;
  body: Msg;
  /** Findings this recommendation answers, so the UI can link them. */
  relatedRuleIds: string[];
}

export type PixelMode = "dryRun" | "live";
export type Placement = "instream" | "outstream";

/**
 * What the client should hand the player. In dry-run this is a rewritten
 * document whose trackers point at our own 204 endpoint; in live mode it is the
 * user's original tag, untouched. See lib/vast-inspect/neutralize.ts.
 */
export interface Playback {
  mode: PixelMode;
  adsResponse?: string;
  adTagUrl?: string;
}

export type Verdict = "pass" | "warn" | "fail";

/**
 * What the XML says, in the same units the player will report it in.
 *
 * Exists so the report can be checked against reality. Our parser reads the
 * document; the SDK resolves it and says what it actually took. Where the two
 * disagree — a declared 30-second spot that resolves to 15, a UniversalAdId the
 * player never saw — the disagreement is worth more than either number alone,
 * and no other validator on the market surfaces it.
 */
export interface ParsedFacts {
  /** <Duration> converted to seconds, from the final InLine. */
  durationSeconds?: number;
  universalAdIdRegistry?: string;
  universalAdIdValue?: string;
  /** Dimensions of the first video MediaFile. */
  mediaWidth?: number;
  mediaHeight?: number;
  adSystem?: string;
  adTitle?: string;
  /** Every apiFramework declared anywhere, lowercased and deduplicated. */
  apiFrameworks: string[];
  /** How many Wrapper documents the chain passed through. */
  wrapperCount: number;
  skipOffset?: string;
}

export interface InspectReport {
  generatedAt: string;
  source: {
    mode: "url" | "xml";
    /** The URL for url mode; empty for xml mode — we never echo a pasted body. */
    url: string;
    bytes: number;
  };
  verdict: Verdict;
  counts: Record<Severity, number>;
  /** Exactly what the root element declared, unnormalized. */
  declaredVersion?: string;
  /** The declared version snapped to a version we know, when it is one. */
  effectiveVersion?: VastVersion;
  adCount: number;
  facts: ParsedFacts;
  chain: Hop[];
  features: FeatureHit[];
  interactive: InteractiveHit[];
  findings: Finding[];
  trackers: TrackerHit[];
  recommendations: Recommendation[];
  /**
   * Rules that threw during analysis. Non-empty means the report is partial,
   * and saying so is the difference between "no violation" and "never checked".
   */
  degraded: string[];
  playback: Playback;
}

/** Ordering used everywhere a list of findings is shown or serialized. */
export const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  warning: 1,
  advisory: 2,
};

/** True when `version` is at least `min`, treating an unknown version as "no". */
export function atLeast(version: VastVersion | undefined, min: VastVersion): boolean {
  if (!version) return false;
  return VAST_VERSIONS.indexOf(version) >= VAST_VERSIONS.indexOf(min);
}

/** True when `version` is strictly older than `max`. */
export function below(version: VastVersion | undefined, max: VastVersion): boolean {
  if (!version) return false;
  return VAST_VERSIONS.indexOf(version) < VAST_VERSIONS.indexOf(max);
}

/**
 * Snap a declared version string to one we have rules for.
 *
 * VAST tags in the wild declare "4.0", "4.1", but also "4", "2.0.1", "3.0 ". A
 * major-only declaration is read as that major's .0; anything we cannot place
 * returns undefined, which is itself a finding rather than a crash.
 */
export function normalizeVersion(declared: string | undefined): VastVersion | undefined {
  if (!declared) return undefined;
  const trimmed = declared.trim();
  if ((VAST_VERSIONS as readonly string[]).includes(trimmed)) {
    return trimmed as VastVersion;
  }
  const match = /^(\d+)(?:\.(\d+))?/.exec(trimmed);
  if (!match) return undefined;
  const candidate = `${match[1]}.${match[2] ?? "0"}`;
  return (VAST_VERSIONS as readonly string[]).includes(candidate)
    ? (candidate as VastVersion)
    : undefined;
}
