import type { VastVersion } from "@/lib/vast-inspect/model";

/**
 * A VAST video creative's `config_json` (ADR-0035), as `parseVideoConfig`
 * hands it to the builder. Everything here has been validated: lengths, URL
 * schemes, hosts, macros, numeric bounds, and what the declared version allows.
 *
 * The shape is the stored one. Two fields sit at the top level for a reason the
 * model would not otherwise have: `/r` resolves a click destination by reading
 * `config_json[field]` for a field in `click_fields`, which the system
 * template's `config_schema` declares as exactly `clickThroughUrl` and
 * `companionClickThroughUrl`.
 */

/** Video types the generator hosts or links: what IMA, Fluid and every major SSP play progressively. */
export type VideoMime = "video/mp4" | "video/webm";

/** Image types a companion banner or an icon may be. No SVG: it is a document, not a picture. */
export type ImageMime = "image/png" | "image/jpeg" | "image/gif";

/**
 * Where a file lives. `upload` is ours — on R2 under the owner's prefix,
 * re-checked against `parseOwnMediaUrl` and HEAD-ed at save — and `external`
 * is the buyer's own https URL, which we neither host nor size.
 */
export type MediaSource = "upload" | "external";

export interface VideoMedia {
  source: MediaSource;
  url: string;
  mime: VideoMime;
  width: number;
  height: number;
  /** Read by the browser from the file itself, bounded on the server. */
  durationMs: number;
  /** An upload's size from R2; absent for an external file. */
  bytes?: number;
  /** Computed on the server from `bytes` and `durationMs`; absent when either is unknown. */
  bitrateKbps?: number;
}

export interface ImageAsset {
  source: MediaSource;
  url: string;
  mime: ImageMime;
}

/** The quartile events, in VAST's own names: what our builder fires and what a buyer's tracker may listen for. */
export type ProgressEvent = "start" | "firstQuartile" | "midpoint" | "thirdQuartile" | "complete";

/** A third-party `<Tracking>` pixel: the event it fires on, and where. */
export interface EventTracker {
  event: string;
  url: string;
}

export interface TrackerSet {
  impression: string[];
  error: string[];
  click: string[];
  events: EventTracker[];
  /** `<ViewableImpression>` children, 4.0+. */
  viewable: string[];
  notViewable: string[];
  viewUndetermined: string[];
}

export interface CompanionBanner {
  image: ImageAsset;
  width: number;
  height: number;
  altText?: string;
  /** Third-party `creativeView` pixels. */
  creativeView: string[];
  /** Third-party `<CompanionClickTracking>`, 4.0+ (2.0 and 3.0 InLine companions have none). */
  clickTracking: string[];
}

export interface AdChoicesIcon {
  /** `program` — "AdChoices" for the industry icon, or another program name. */
  program: string;
  image: ImageAsset;
  width: number;
  height: number;
  xPosition: "left" | "right";
  yPosition: "top" | "bottom";
  offsetMs: number;
  durationMs?: number;
  /**
   * Opened directly, never through `/r`: an AdChoices click is a disclosure,
   * not an ad click, and counting it would inflate CTR with privacy-page views.
   */
  clickThroughUrl?: string;
  clickTracking: string[];
  viewTracking: string[];
}

export interface OmidVerification {
  vendor: string;
  scriptUrl: string;
  parameters?: string;
}

export interface UniversalAdIdValue {
  registry: string;
  value: string;
}

export interface VideoConfig {
  /** Shape version of this object, so a later change can migrate stored configs. */
  v: 1;
  version: VastVersion;
  adTitle: string;
  description?: string;
  /** 3.0+. */
  advertiser?: string;
  media: VideoMedia;
  /** Through `/r`, so the click gets a click id (ADR-0023). */
  clickThroughUrl?: string;
  /** The companions' one destination, through `/r` like the video's. */
  companionClickThroughUrl?: string;
  /** 3.0+. Absent: not skippable. */
  skipOffsetMs?: number;
  /** 4.0+. Absent: our own registry, with the creative id. */
  universalAdId?: UniversalAdIdValue;
  /** 4.1+. */
  verification?: OmidVerification;
  trackers: TrackerSet;
  companions: CompanionBanner[];
  /** 3.0+. */
  icon?: AdChoicesIcon;
}

/** The URLs the builder writes for us — signed when serving, inert in a preview. */
export interface VideoBeacons {
  impression(): string;
  /** Without the code macro: the builder appends `&code=[ERRORCODE]` from 3.0. */
  error(): string;
  click(): string;
  progress(event: ProgressEvent): string;
  viewable(): string;
  /** A click destination, routed through `/r` when serving. */
  clickThrough(field: "clickThroughUrl" | "companionClickThroughUrl", destination: string): string;
}
