import type { VastVersion } from "./model";

/**
 * What each VAST version defines — the facts the inspector judges a tag by and
 * the VAST generator (lib/vast-gen, ADR-0035) builds one by. Both read them from
 * here, so the tag we emit and the report we give on it cannot disagree about a
 * version: a feature the generator offers at 3.0 is one the validator accepts at
 * 3.0, and an element order the builder writes is the one the ordering rule
 * expects.
 *
 * Pure data with no runtime imports. The generator runs this in the browser (the
 * live XML preview) and in the ad Worker (serving), neither of which may pull in
 * the inspector's XML parser or its Node-only fetcher.
 *
 * Every table below was read out of IAB's own XSDs (InteractiveAdvertisingBureau
 * /vast: vast_2.0.1.xsd, vast3_draft.xsd, vast4.xsd, vast_4.1.xsd, vast_4.2.xsd),
 * not from memory or a blog. There is no XSD for 4.3; it is read as 4.2 here,
 * which its prose supports for everything this file records.
 */

/**
 * The version each feature arrived in. `lib/vast-inspect/features.ts` adds the
 * detection and the labels; the generator gates its form and its builder on the
 * same values through `lib/vast-gen/spec.ts`.
 *
 * Several of these are widely misreported, including by other validators:
 * `Pricing` is 3.0 (vast3_draft.xsd), not 4.0; `<Error>` exists in 2.0 and what
 * 3.0 standardised was the code list; OMID at InLine level is 4.1.
 */
export const FEATURE_SINCE = {
  linear: "2.0",
  "nonlinear-companion": "2.0",
  "basic-tracking": "2.0",
  wrappers: "2.0",
  vpaid: "2.0",
  skip: "3.0",
  "ad-pods": "3.0",
  "error-codes": "2.0",
  "error-macros": "3.0",
  mezzanine: "4.0",
  "universal-ad-id": "4.0",
  "ad-categories": "4.0",
  "viewable-impression": "4.0",
  ssai: "4.0",
  "ad-serving-id": "4.1",
  simid: "4.1",
  omid: "4.1",
  "closed-captions": "4.1",
  icons: "3.0",
  pricing: "3.0",
  expires: "4.1",
} as const satisfies Record<string, VastVersion>;

export type FeatureId = keyof typeof FEATURE_SINCE;

/* ---------- child order ---------- */

/**
 * The `xs:sequence` of InLine and Wrapper children, per version.
 *
 * 2.0 and 3.0 declare InLine as one flat sequence that opens with AdSystem and
 * AdTitle. 4.x derives InLine and Wrapper from `AdDefinitionBase_type`, and an
 * `xs:extension` appends the derived sequence *after* the base's — which is why
 * `<Error>` and `<Pricing>` come before `<AdTitle>` from 4.0 on. Measuring a 3.0
 * document against the 4.x sequence was the ordering rule's false positive on
 * every conformant 2.0/3.0 tag until ADR-0035.
 *
 * One 4.x table serves 4.0 too: the rule skips elements a version does not have,
 * so 4.1's AdServingId and Expires cost a 4.0 document nothing.
 */
const INLINE_2_0 = [
  "AdSystem",
  "AdTitle",
  "Description",
  "Survey",
  "Error",
  "Impression",
  "Creatives",
  "Extensions",
] as const;

const INLINE_3_0 = [
  "AdSystem",
  "AdTitle",
  "Description",
  "Advertiser",
  "Pricing",
  "Survey",
  "Error",
  "Impression",
  "Creatives",
  "Extensions",
] as const;

const INLINE_4_X = [
  "AdSystem",
  "Error",
  "Extensions",
  "Impression",
  "Pricing",
  "ViewableImpression",
  "AdServingId",
  "AdTitle",
  "AdVerifications",
  "Advertiser",
  "Category",
  "Creatives",
  "Description",
  "Expires",
  "Survey",
] as const;

/** 2.0 and 3.0 agree: the ad tag URI comes straight after AdSystem. */
const WRAPPER_2_0_3_0 = [
  "AdSystem",
  "VASTAdTagURI",
  "Error",
  "Impression",
  "Creatives",
  "Extensions",
] as const;

const WRAPPER_4_X = [
  "AdSystem",
  "Error",
  "Extensions",
  "Impression",
  "Pricing",
  "ViewableImpression",
  "AdVerifications",
  "BlockedAdCategories",
  "Creatives",
  "VASTAdTagURI",
] as const;

export type OrderedContainer = "InLine" | "Wrapper";

/**
 * The child sequence for `container` at `version`. An undeclared or unknown
 * version is judged by the 4.x sequence, which is what the rule did before it
 * knew any other.
 */
export function childOrder(container: OrderedContainer, version: VastVersion | undefined): readonly string[] {
  if (container === "Wrapper") {
    return version === "2.0" || version === "3.0" ? WRAPPER_2_0_3_0 : WRAPPER_4_X;
  }
  if (version === "2.0") return INLINE_2_0;
  if (version === "3.0") return INLINE_3_0;
  return INLINE_4_X;
}

/* ---------- tracking events ---------- */

/**
 * The `event` values a player accepts for `<Tracking>`, by version — the
 * *lenient* reading the inspector warns against. Each set includes the earlier
 * versions' events: a 4.2 player still fires `fullscreen`, and warning on it
 * would be a false positive on a working tag.
 */
const ACCEPTED_2_0 = [
  "creativeView",
  "start",
  "midpoint",
  "firstQuartile",
  "thirdQuartile",
  "complete",
  "mute",
  "unmute",
  "pause",
  "rewind",
  "resume",
  "fullscreen",
  "expand",
  "collapse",
  "acceptInvitation",
  "close",
] as const;

const ACCEPTED_3_0 = [
  ...ACCEPTED_2_0,
  "exitFullscreen",
  "skip",
  "progress",
  "closeLinear",
  "acceptInvitationLinear",
] as const;

/**
 * VAST 4.x. `otherAdInteraction` is 4.x, not 3.0 — listing it under 3.0 turned
 * a real finding into a false negative. `interactiveStart` was added by the 4.2
 * XSD and is precisely the event a SIMID creative fires, so its absence here
 * warned on a conformant tag in this product's own domain.
 */
const ACCEPTED_4_X = [
  ...ACCEPTED_3_0,
  "otherAdInteraction",
  "loaded",
  // vast4.xsd enumerates it; 4.1 dropped it from the schema, and a 4.0 tag
  // carrying it is conformant.
  "timeSpentViewing",
  "interactiveStart",
  "playerExpand",
  "playerCollapse",
  "adExpand",
  "adCollapse",
  "minimize",
  "overlayViewDuration",
  "verificationNotExecuted",
] as const;

/** Events a player recognises at `version`, leniently (see above). */
export function acceptedTrackingEvents(version: VastVersion | undefined): readonly string[] {
  if (!version) return ACCEPTED_4_X;
  if (version === "2.0") return ACCEPTED_2_0;
  if (version === "3.0") return ACCEPTED_3_0;
  return ACCEPTED_4_X;
}

/**
 * The `TrackingEvents_type` enumeration exactly as each XSD declares it — the
 * *strict* reading, for what we emit ourselves. The generator only offers an
 * event its version's schema names, so a document it builds validates against
 * that schema and not merely against a forgiving player.
 *
 * The sets do not nest: 4.0 dropped `fullscreen` and `closeLinear` for
 * `playerExpand`/`playerCollapse`, and 4.1 brought `closeLinear` back.
 */
const XSD_EVENTS: Record<"2.0" | "3.0" | "4.0" | "4.1" | "4.2", readonly string[]> = {
  "2.0": ACCEPTED_2_0,
  "3.0": [
    "creativeView",
    "start",
    "firstQuartile",
    "midpoint",
    "thirdQuartile",
    "complete",
    "mute",
    "unmute",
    "pause",
    "rewind",
    "resume",
    "fullscreen",
    "exitFullscreen",
    "expand",
    "collapse",
    "acceptInvitation",
    "close",
    "skip",
    "progress",
    "acceptInvitationLinear",
    "closeLinear",
  ],
  "4.0": [
    "mute",
    "unmute",
    "pause",
    "resume",
    "rewind",
    "skip",
    "playerExpand",
    "playerCollapse",
    "start",
    "firstQuartile",
    "midpoint",
    "thirdQuartile",
    "complete",
    "acceptInvitationLinear",
    "timeSpentViewing",
    "progress",
    "creativeView",
    "acceptInvitation",
    "adExpand",
    "adCollapse",
    "minimize",
    "close",
    "overlayViewDuration",
    "otherAdInteraction",
  ],
  "4.1": [
    "mute",
    "unmute",
    "pause",
    "resume",
    "rewind",
    "skip",
    "playerExpand",
    "playerCollapse",
    "loaded",
    "start",
    "firstQuartile",
    "midpoint",
    "thirdQuartile",
    "complete",
    "progress",
    "closeLinear",
    "creativeView",
    "acceptInvitation",
    "adExpand",
    "adCollapse",
    "minimize",
    "close",
    "overlayViewDuration",
    "otherAdInteraction",
  ],
  "4.2": [
    "mute",
    "unmute",
    "pause",
    "resume",
    "rewind",
    "skip",
    "playerExpand",
    "playerCollapse",
    "loaded",
    "start",
    "firstQuartile",
    "midpoint",
    "thirdQuartile",
    "complete",
    "progress",
    "closeLinear",
    "creativeView",
    "acceptInvitation",
    "adExpand",
    "adCollapse",
    "minimize",
    "close",
    "overlayViewDuration",
    "otherAdInteraction",
    "interactiveStart",
  ],
};

/** The XSD's own enumeration for `version` (4.3 has no XSD and reads as 4.2). */
export function xsdTrackingEvents(version: VastVersion): readonly string[] {
  return version === "4.3" ? XSD_EVENTS["4.2"] : XSD_EVENTS[version];
}

/* ---------- macros ---------- */

/*
 * IAB's own macro list (vast4macros/data/macros-data.json in
 * github.com/InteractiveAdvertisingBureau/vast), by where a player substitutes
 * each one. IAB states they "can be used with all versions of VAST", so none of
 * these sets is gated by version.
 */

/** Substituted in every tracking pixel ("All tracking pixels"). */
const PIXEL_MACROS = [
  "TIMESTAMP",
  "CACHEBUSTING",
  "CONTENTPLAYHEAD",
  "MEDIAPLAYHEAD",
  "BREAKPOSITION",
  "ADCOUNT",
  "TRANSACTIONID",
  "PLACEMENTTYPE",
  "ADTYPE",
  "UNIVERSALADID",
  "BREAKMAXDURATION",
  "BREAKMAXADS",
  "BREAKMINADLENGTH",
  "BREAKMAXADLENGTH",
  "IFA",
  "IFATYPE",
  "CLIENTUA",
  "SERVERUA",
  "DEVICEUA",
  "SERVERSIDE",
  "DEVICEIP",
  "LATLONG",
  "DOMAIN",
  "PAGEURL",
  "APPBUNDLE",
  "OMIDPARTNER",
  "PLAYERCAPABILITIES",
  "CLICKTYPE",
  "PLAYERSTATE",
  "INVENTORYSTATE",
  "PLAYERSIZE",
  "ADPLAYHEAD",
  "ASSETURI",
  "CONTENTID",
  "CONTENTURI",
  "PODSEQUENCE",
  "ADSERVINGID",
  "LIMITADTRACKING",
  "REGULATIONS",
  "GDPRCONSENT",
  "STOREID",
  "STOREURL",
  "PLAYBACKMETHODS",
  "GPPSTRING",
  "GPPSECTIONID",
] as const;

/** Substituted in one kind of pixel only: `<Error>`, `<ClickTracking>`, `verificationNotExecuted`. */
const ERROR_PIXEL_MACROS = ["ERRORCODE"] as const;
const CLICK_PIXEL_MACROS = ["CLICKPOS"] as const;
const VERIFICATION_PIXEL_MACROS = ["REASON"] as const;

/** Substituted in the URI that *requests* a VAST document, never in one of its pixels. */
const REQUEST_URI_MACROS = [
  "BLOCKEDADCATEGORIES",
  "ADCATEGORIES",
  "VASTVERSIONS",
  "APIFRAMEWORKS",
  "EXTENSIONS",
  "VERIFICATIONVENDORS",
  "MEDIAMIME",
  "CONTENTCAT",
  "DSAREQUIRED",
  "DSAPARAMS",
  "DSAPUBRENDER",
] as const;

/**
 * Every macro some player substitutes somewhere — the inspector's reading of a
 * third-party document, in which anything else in `[BRACKETS]` is a template an
 * ad server forgot to fill in before it shipped. Lenient about *where*: a
 * macro in the wrong kind of URL is a different defect from an unfilled one.
 *
 * `US_PRIVACY` stays from the validator's first list although IAB's current
 * data no longer names it (GPP replaced it), so a tag from that era is not
 * newly flagged. The generator does not accept it.
 */
export const PLAYER_SUBSTITUTED_MACROS: ReadonlySet<string> = new Set([
  ...PIXEL_MACROS,
  ...ERROR_PIXEL_MACROS,
  ...CLICK_PIXEL_MACROS,
  ...VERIFICATION_PIXEL_MACROS,
  ...REQUEST_URI_MACROS,
  "US_PRIVACY",
]);

export type PixelKind = "error" | "click" | "other";

const PIXEL_MACRO_SETS: Record<PixelKind, ReadonlySet<string>> = {
  error: new Set([...PIXEL_MACROS, ...ERROR_PIXEL_MACROS]),
  click: new Set([...PIXEL_MACROS, ...CLICK_PIXEL_MACROS]),
  other: new Set(PIXEL_MACROS),
};

/**
 * The macros a player substitutes in a pixel of `kind` — the strict reading,
 * for what the VAST generator emits itself: `[ERRORCODE]` in an impression
 * pixel would go out literally, so the generator refuses it there.
 */
export function pixelMacros(kind: PixelKind): ReadonlySet<string> {
  return PIXEL_MACRO_SETS[kind];
}
