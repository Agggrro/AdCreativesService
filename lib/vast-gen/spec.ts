import { atLeast, VAST_VERSIONS, type VastVersion } from "@/lib/vast-inspect/model";
import { FEATURE_SINCE, xsdTrackingEvents } from "@/lib/vast-inspect/spec";
import type { ProgressEvent } from "./model";

/**
 * What the VAST generator offers at each version (ADR-0035). The form shows a
 * section only when `supports()` says so, the validator drops what a version
 * cannot carry, and the builder emits by the same answer — three readers, one
 * table, and the table's facts come from the inspector's `FEATURE_SINCE`
 * wherever the inspector knows the feature, so a generated tag can never use a
 * feature the validator would call unavailable at its version.
 */

/** Every version the generator emits: the inspector's own list, 2.0 to 4.3. */
export const GENERATOR_VERSIONS: readonly VastVersion[] = VAST_VERSIONS;

/** What a new creative starts at: current, and what the interactive builder emits. */
export const DEFAULT_VERSION: VastVersion = "4.2";

const SINCE = {
  /** `skipoffset` and the `skip` event. */
  skip: FEATURE_SINCE.skip,
  /** `[ERRORCODE]` in `<Error>`: the code list and its macro are 3.0. */
  errorMacro: FEATURE_SINCE["error-macros"],
  /**
   * A buyer's own `<Error>` pixel beside ours. 2.0 and 3.0 declare InLine's
   * Error `maxOccurs="1"`, so the one slot carries our beacon (the per-code
   * error report, ADR-0033); from 4.0 Error is repeatable. IAB's XSDs, checked
   * by `npm run check:vast-xsd` — the inspector does not count Error elements.
   */
  thirdPartyError: "4.0",
  /** `<Advertiser>` is in vast3_draft.xsd's InLine, not in 2.0.1's. */
  advertiser: "3.0",
  icon: FEATURE_SINCE.icons,
  universalAdId: FEATURE_SINCE["universal-ad-id"],
  viewableImpression: FEATURE_SINCE["viewable-impression"],
  /** `<CompanionClickTracking>` inside an InLine companion: 2.0 and 3.0 have it only in Wrapper companions. */
  companionClickTracking: "4.0",
  adServingId: FEATURE_SINCE["ad-serving-id"],
  omid: FEATURE_SINCE.omid,
} as const satisfies Record<string, VastVersion>;

export type GeneratorFeature = keyof typeof SINCE;

export function supports(version: VastVersion, feature: GeneratorFeature): boolean {
  return atLeast(version, SINCE[feature]);
}

/** The version a feature first appears in, for the form's "from VAST x" notes. */
export function featureSince(feature: GeneratorFeature): VastVersion {
  return SINCE[feature];
}

/**
 * Third-party tracker events the form offers, in this order, before the
 * version's own XSD filters them. `progress` is left out because it needs an
 * offset attribute the form does not model; `close` and `collapse` belong to
 * non-linear and companion ads.
 */
const OFFERED_EVENTS = [
  "creativeView",
  "start",
  "firstQuartile",
  "midpoint",
  "thirdQuartile",
  "complete",
  "mute",
  "unmute",
  "pause",
  "resume",
  "rewind",
  "skip",
  "fullscreen",
  "exitFullscreen",
  "playerExpand",
  "playerCollapse",
  "closeLinear",
] as const;

/**
 * The tracker events `version` lets a buyer attach a pixel to: the offered set,
 * cut to what that version's XSD enumerates. A tag never carries an event its
 * own schema does not name — 4.0 has no `fullscreen` and no `closeLinear`.
 */
export function trackerEvents(version: VastVersion): readonly string[] {
  const allowed = xsdTrackingEvents(version);
  return OFFERED_EVENTS.filter((event) => allowed.includes(event));
}

/** Our own progress beacons, in the order a player fires them. */
export const PROGRESS_EVENTS: readonly ProgressEvent[] = [
  "start",
  "firstQuartile",
  "midpoint",
  "thirdQuartile",
  "complete",
];

/**
 * The `/t` event name — the `creative_event_type` value — for each progress
 * event. The VAST names are what a player reads; these are what the counter
 * stores, and the beacon's signature binds the stored name.
 */
export const PROGRESS_COUNTER: Record<ProgressEvent, "start" | "q25" | "q50" | "q75" | "complete"> = {
  start: "start",
  firstQuartile: "q25",
  midpoint: "q50",
  thirdQuartile: "q75",
  complete: "complete",
};
