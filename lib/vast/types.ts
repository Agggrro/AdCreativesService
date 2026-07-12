import type { CreativeServing, DeliveryFormat } from "../../types/database.types";

/**
 * Normalized, builder-ready view of a creative's `config_json`. The endpoint
 * parses the raw JSON into this shape (see config.ts); the builder never reads
 * untyped JSON directly.
 */
export interface CreativeConfig {
  /** Base video media file URL (e.g. an mp4). */
  videoUrl?: string;
  /** MIME type of the base video; defaults to video/mp4. */
  videoMimeType?: string;
  /** Linear ad duration in seconds; defaults to 30. */
  durationSeconds?: number;
  /** Click-through landing URL, if any. */
  clickThroughUrl?: string;
  /** Shoppable overlay: product label shown on the "Shop Now" badge. */
  productName?: string;
  /** Shoppable overlay: product thumbnail URL. */
  productImageUrl?: string;
  /** Player dimensions; default 640x360. */
  width?: number;
  height?: number;
}

/** Everything the VAST builder needs, already resolved by the endpoint. */
export interface VastBuildContext {
  serving: CreativeServing;
  config: CreativeConfig;
  /** Signed, short-TTL URL to the SIMID document / VPAID JS unit. */
  interactiveUrl: string;
  /** Public base URL (trailing slash optional) for tracking/error beacons. */
  siteUrl: string;
}

/**
 * A format adapter knows how to emit the format-specific nodes for one
 * interactive standard. Adding a standard = adding an adapter (ADR-0002); the
 * endpoint and builder stay format-agnostic.
 */
export interface FormatAdapter {
  readonly format: DeliveryFormat;
  /**
   * Whether this format can serve for the given context. VPAID renders the unit
   * itself (always servable); SIMID layers over a playing video and needs a base
   * loop, so it is servable only when a videoUrl is present (ADR-0005).
   */
  isServable(ctx: VastBuildContext): boolean;
  /** XML fragment to place inside <MediaFiles>. */
  mediaFilesInner(ctx: VastBuildContext): string;
}
