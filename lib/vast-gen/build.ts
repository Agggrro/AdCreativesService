import type { VastVersion } from "@/lib/vast-inspect/model";
import { childOrder } from "@/lib/vast-inspect/spec";
import { omidVerificationXml } from "@/lib/vast/verification";
import { cdata, escapeXml, xmlLines } from "@/lib/vast/xml";
import type { AdChoicesIcon, CompanionBanner, VideoBeacons, VideoConfig } from "./model";
import { PROGRESS_EVENTS, supports } from "./spec";

/**
 * The VAST document for a VAST video creative (ADR-0035), at the version it
 * declares and in that version's XSD order — for the InLine children from the
 * inspector's own table (`childOrder`), for everything below from the sequences
 * recorded here. Pure: the server passes signed beacons, the generator's live
 * preview inert ones, and nothing here can reach a secret.
 *
 * Takes a config `parseVideoConfig` has already validated. Every dynamic value
 * still goes through `escapeXml` or `cdata`: validation decides what is
 * *allowed*, escaping is what keeps an allowed value from becoming markup.
 */

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

/** Our own registry for the default UniversalAdId: the creative id, which is what the tag identifies. */
const OWN_UNIVERSAL_AD_ID_REGISTRY = "creosmith";

export interface VideoIds {
  /** The creative's uuid: Ad id, Creative id, AdServingId and the default UniversalAdId. */
  creativeId: string;
}

/* ---------- per-version sequences below InLine ---------- */

/**
 * Linear's children. 2.0 is a flat sequence; 3.0 added Icons and
 * CreativeExtensions in front; 4.x derives Linear_Inline_type from
 * Linear_Base_type, so the base's Icons and TrackingEvents come first and
 * MediaFiles moves before VideoClicks. (vast_2.0.1.xsd, vast3_draft.xsd,
 * vast4.xsd, vast_4.1.xsd, vast_4.2.xsd.)
 */
function linearOrder(version: VastVersion): readonly string[] {
  if (version === "2.0") return ["Duration", "TrackingEvents", "AdParameters", "VideoClicks", "MediaFiles"];
  if (version === "3.0") {
    return ["Icons", "CreativeExtensions", "Duration", "TrackingEvents", "AdParameters", "VideoClicks", "MediaFiles"];
  }
  return ["Icons", "TrackingEvents", "AdParameters", "Duration", "MediaFiles", "VideoClicks"];
}

/**
 * VideoClicks' children. ClickThrough leads in 2.0/3.0; in 4.0 and 4.1 it
 * follows ClickTracking and CustomClick (base, then derived); 4.2 puts it
 * between the two. Emitting ClickTracking then ClickThrough is valid for every
 * 4.x schema, and we never emit CustomClick.
 */
function videoClicksOrder(version: VastVersion): readonly string[] {
  if (version === "2.0" || version === "3.0") return ["ClickThrough", "ClickTracking", "CustomClick"];
  return ["ClickTracking", "ClickThrough", "CustomClick"];
}

/** An InLine companion's children. 4.x is the resource base first, then the derived sequence. */
function companionOrder(version: VastVersion): readonly string[] {
  if (version === "2.0") return ["StaticResource", "TrackingEvents", "CompanionClickThrough", "AltText", "AdParameters"];
  if (version === "3.0") {
    return ["StaticResource", "CreativeExtensions", "TrackingEvents", "CompanionClickThrough", "AltText", "AdParameters"];
  }
  return [
    "StaticResource",
    "AdParameters",
    "AltText",
    "CompanionClickThrough",
    "CompanionClickTracking",
    "CreativeExtensions",
    "TrackingEvents",
  ];
}

/** IconClicks: 3.0 lists the trackers first; 4.x the click-through first. */
function iconClicksOrder(version: VastVersion): readonly string[] {
  return version === "3.0" ? ["IconClickTracking", "IconClickThrough"] : ["IconClickThrough", "IconClickTracking"];
}

/**
 * Join `parts` in `order`. A part whose name the sequence does not list is a
 * bug in this file, not a document to emit: it throws rather than misorder.
 * On the ad path that lands in `handleVast`'s catch — a 503 with an empty
 * document, behind which the ad Worker keeps serving its last good copy — so
 * the answer is never a partial tag.
 */
function ordered(order: readonly string[], parts: Record<string, string[]>, where: string): string[] {
  for (const name of Object.keys(parts)) {
    if (!order.includes(name)) throw new Error(`vast-gen: <${name}> has no place in ${where}`);
  }
  return order.flatMap((name) => parts[name] ?? []);
}

/** A block element around already-built child lines. */
function block(open: string, close: string, children: string[]): string[] {
  return [open, ...children.map((line) => `  ${line}`), close];
}

/* ---------- values ---------- */

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * `HH:MM:SS.mmm` from 3.0, `HH:MM:SS` in 2.0, whose prose defines no fraction.
 * Valid for Duration, skipoffset and the icon's offset and duration alike.
 */
export function vastTime(ms: number, version: VastVersion): string {
  const millis = Math.max(0, Math.round(ms));
  const fractional = version !== "2.0";
  const totalSeconds = fractional ? Math.floor(millis / 1000) : Math.round(millis / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return fractional ? `${base}.${pad(millis % 1000, 3)}` : base;
}

function cdataElement(name: string, value: string, attributes = ""): string {
  return `<${name}${attributes}>${cdata(value)}</${name}>`;
}

/* ---------- pieces ---------- */

function trackingEvents(entries: { event: string; url: string }[]): string[] {
  if (entries.length === 0) return [];
  return block(
    "<TrackingEvents>",
    "</TrackingEvents>",
    entries.map(({ event, url }) => cdataElement("Tracking", url, ` event="${escapeXml(event)}"`)),
  );
}

function iconXml(icon: AdChoicesIcon, version: VastVersion): string[] {
  const attributes =
    ` program="${escapeXml(icon.program)}" width="${icon.width}" height="${icon.height}"` +
    ` xPosition="${icon.xPosition}" yPosition="${icon.yPosition}"` +
    ` offset="${vastTime(icon.offsetMs, version)}"` +
    (icon.durationMs !== undefined ? ` duration="${vastTime(icon.durationMs, version)}"` : "");
  const clicks = ordered(
    iconClicksOrder(version),
    {
      ...(icon.clickThroughUrl ? { IconClickThrough: [cdataElement("IconClickThrough", icon.clickThroughUrl)] } : {}),
      ...(icon.clickTracking.length > 0
        ? { IconClickTracking: icon.clickTracking.map((url) => cdataElement("IconClickTracking", url)) }
        : {}),
    },
    "IconClicks",
  );
  const children = [
    cdataElement("StaticResource", icon.image.url, ` creativeType="${escapeXml(icon.image.mime)}"`),
    ...(clicks.length > 0 ? block("<IconClicks>", "</IconClicks>", clicks) : []),
    ...icon.viewTracking.map((url) => cdataElement("IconViewTracking", url)),
  ];
  return block("<Icons>", "</Icons>", block(`<Icon${attributes}>`, "</Icon>", children));
}

function companionXml(
  banner: CompanionBanner,
  index: number,
  version: VastVersion,
  clickThrough: string | undefined,
): string[] {
  const parts: Record<string, string[]> = {
    StaticResource: [
      cdataElement("StaticResource", banner.image.url, ` creativeType="${escapeXml(banner.image.mime)}"`),
    ],
  };
  if (banner.altText) parts.AltText = [`<AltText>${escapeXml(banner.altText)}</AltText>`];
  if (clickThrough) parts.CompanionClickThrough = [cdataElement("CompanionClickThrough", clickThrough)];
  if (banner.clickTracking.length > 0 && supports(version, "companionClickTracking")) {
    // `id` is required on 4.x CompanionClickTracking; it names the tracker, not the click.
    parts.CompanionClickTracking = banner.clickTracking.map((url, n) =>
      cdataElement("CompanionClickTracking", url, ` id="${index + 1}-${n + 1}"`),
    );
  }
  const views = trackingEvents(banner.creativeView.map((url) => ({ event: "creativeView", url })));
  if (views.length > 0) parts.TrackingEvents = views;
  return block(
    `<Companion width="${banner.width}" height="${banner.height}">`,
    "</Companion>",
    ordered(companionOrder(version), parts, "Companion"),
  );
}

function universalAdIdXml(config: VideoConfig, ids: VideoIds): string[] {
  if (!supports(config.version, "universalAdId")) return [];
  const registry = config.universalAdId?.registry ?? OWN_UNIVERSAL_AD_ID_REGISTRY;
  const value = config.universalAdId?.value ?? ids.creativeId;
  // 4.0 declares both `idRegistry` and `idValue` required; 4.1 dropped
  // `idValue` for the element's text, which 4.0 also allows.
  const idValue = config.version === "4.0" ? ` idValue="${escapeXml(value)}"` : "";
  return [`<UniversalAdId idRegistry="${escapeXml(registry)}"${idValue}>${escapeXml(value)}</UniversalAdId>`];
}

/* ---------- the document ---------- */

export function buildVideoVast(config: VideoConfig, beacons: VideoBeacons, ids: VideoIds): string {
  const { version } = config;
  const cid = escapeXml(ids.creativeId);

  // --- Linear ---
  const ourProgress = PROGRESS_EVENTS.map((event) => ({ event, url: beacons.progress(event) }));
  const linearParts: Record<string, string[]> = {
    TrackingEvents: trackingEvents([...ourProgress, ...config.trackers.events]),
    Duration: [`<Duration>${vastTime(config.media.durationMs, version)}</Duration>`],
    MediaFiles: block("<MediaFiles>", "</MediaFiles>", [
      cdataElement(
        "MediaFile",
        config.media.url,
        ` delivery="progressive" type="${escapeXml(config.media.mime)}"` +
          ` width="${config.media.width}" height="${config.media.height}"` +
          (config.media.bitrateKbps !== undefined ? ` bitrate="${config.media.bitrateKbps}"` : "") +
          ` scalable="true" maintainAspectRatio="true"`,
      ),
    ]),
    VideoClicks: block(
      "<VideoClicks>",
      "</VideoClicks>",
      ordered(
        videoClicksOrder(version),
        {
          ClickTracking: [beacons.click(), ...config.trackers.click].map((url) => cdataElement("ClickTracking", url)),
          ...(config.clickThroughUrl
            ? {
                ClickThrough: [
                  cdataElement("ClickThrough", beacons.clickThrough("clickThroughUrl", config.clickThroughUrl)),
                ],
              }
            : {}),
        },
        "VideoClicks",
      ),
    ),
  };
  if (config.icon && supports(version, "icon")) linearParts.Icons = iconXml(config.icon, version);
  const skip =
    config.skipOffsetMs !== undefined && supports(version, "skip")
      ? ` skipoffset="${vastTime(config.skipOffsetMs, version)}"`
      : "";
  const linear = block(`<Linear${skip}>`, "</Linear>", ordered(linearOrder(version), linearParts, "Linear"));

  // --- Creatives ---
  // One Creative per kind: 2.0 and 3.0 declare Creative as a choice of Linear,
  // CompanionAds or NonLinearAds. 4.x requires a UniversalAdId in every one,
  // and 4.2's sequence puts it last.
  const uaid = universalAdIdXml(config, ids);
  const creatives = [
    ...block(`<Creative id="${cid}" sequence="1">`, "</Creative>", [...linear, ...uaid]),
  ];
  if (config.companions.length > 0) {
    const companionClickThrough = config.companionClickThroughUrl
      ? beacons.clickThrough("companionClickThroughUrl", config.companionClickThroughUrl)
      : undefined;
    const companionAds = block(
      "<CompanionAds>",
      "</CompanionAds>",
      config.companions.flatMap((banner, index) => companionXml(banner, index, version, companionClickThrough)),
    );
    creatives.push(...block(`<Creative id="${cid}-companions" sequence="1">`, "</Creative>", [...companionAds, ...uaid]));
  }

  // --- InLine ---
  const errorBeacon = supports(version, "errorMacro") ? `${beacons.error()}&code=[ERRORCODE]` : beacons.error();
  const inlineParts: Record<string, string[]> = {
    AdSystem: ['<AdSystem version="1.0">CreoSmith</AdSystem>'],
    AdTitle: [cdataElement("AdTitle", config.adTitle)],
    // One Error before 4.0 (maxOccurs="1" in 2.0.1 and 3.0): ours.
    Error: [errorBeacon, ...(supports(version, "thirdPartyError") ? config.trackers.error : [])].map((url) =>
      cdataElement("Error", url),
    ),
    Impression: [beacons.impression(), ...config.trackers.impression].map((url) => cdataElement("Impression", url)),
    Creatives: block("<Creatives>", "</Creatives>", creatives),
  };
  if (config.description) inlineParts.Description = [cdataElement("Description", config.description)];
  if (config.advertiser && supports(version, "advertiser")) {
    inlineParts.Advertiser = [cdataElement("Advertiser", config.advertiser)];
  }
  if (supports(version, "viewableImpression")) {
    inlineParts.ViewableImpression = block(`<ViewableImpression id="${cid}">`, "</ViewableImpression>", [
      ...[beacons.viewable(), ...config.trackers.viewable].map((url) => cdataElement("Viewable", url)),
      ...config.trackers.notViewable.map((url) => cdataElement("NotViewable", url)),
      ...config.trackers.viewUndetermined.map((url) => cdataElement("ViewUndetermined", url)),
    ]);
  }
  // Required and non-empty from 4.1 (§3.4). The creative id, as the
  // interactive builder does: the tag is cached for a minute, so a per-response
  // id would be one id for every response in that minute anyway.
  if (supports(version, "adServingId")) inlineParts.AdServingId = [`<AdServingId>${cid}</AdServingId>`];
  if (config.verification && supports(version, "omid")) {
    inlineParts.AdVerifications = block(
      "<AdVerifications>",
      "</AdVerifications>",
      xmlLines(omidVerificationXml(config.verification)),
    );
  }

  const inline = ordered(childOrder("InLine", version), inlineParts, "InLine");
  const ad = block(`<Ad id="${cid}">`, "</Ad>", block("<InLine>", "</InLine>", inline));
  return `${XML_DECL}\n${block(`<VAST version="${version}">`, "</VAST>", ad).join("\n")}`;
}
