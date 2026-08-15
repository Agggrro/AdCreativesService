import type { Json } from "../../types/database.types";
import type { VastBuildContext } from "./types";
import { getAdapter } from "./adapters";
import { cdata, escapeXml, indent } from "./xml";
import { signTrackToken } from "../track-token";

/** Narrow an arbitrary Json value down to a plain object, or {} otherwise. */
function asRecord(json: Json): Record<string, Json> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, Json>)
    : {};
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
const DEFAULT_DURATION_SECONDS = 30;

// VAST standard quartile/start tracking event names.
const QUARTILE_EVENTS = [
  "start",
  "firstQuartile",
  "midpoint",
  "thirdQuartile",
  "complete",
] as const;

/** Minimal valid empty VAST — the fail-closed / not-entitled response. */
export function emptyVast(): string {
  return `${XML_DECL}\n<VAST version="4.2"></VAST>`;
}

/** Format seconds as HH:MM:SS for <Duration>. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Build a signed tracking/beacon URL for the ingest endpoint (see step 7).
 * Signed so a party who only knows `creativeId` (visible in the VAST tag
 * itself) cannot mint arbitrary hits against `/api/track` — see
 * lib/track-token.ts and docs/security.md.
 */
export function trackingUrl(
  siteUrl: string,
  creativeId: string,
  event: string,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const { exp, sig } = signTrackToken(creativeId, event);
  return `${base}/api/track?cid=${encodeURIComponent(creativeId)}&e=${encodeURIComponent(event)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
}

/** Build a full inline VAST 4.2 document for an entitled creative. */
export function buildInlineVast(ctx: VastBuildContext): string {
  const adapter = getAdapter(ctx.serving.selected_format);
  if (!adapter) {
    // Defensive: callers should check first, but never emit a partial doc.
    return emptyVast();
  }

  const cid = ctx.serving.creative_id;
  const duration = formatDuration(
    ctx.config.durationSeconds ?? DEFAULT_DURATION_SECONDS,
  );

  const trackingEvents = QUARTILE_EVENTS.map(
    (ev) =>
      `            <Tracking event="${ev}">${cdata(
        trackingUrl(ctx.siteUrl, cid, ev),
      )}</Tracking>`,
  ).join("\n");

  const videoClicks = ctx.config.clickThroughUrl
    ? `            <VideoClicks>\n` +
      `              <ClickThrough>${cdata(ctx.config.clickThroughUrl)}</ClickThrough>\n` +
      `            </VideoClicks>\n`
    : "";

  // AdParameters carries the creative config to the SIMID/VPAID runtime
  // (server-injected; never baked into the static asset — ADR-0003). Start from
  // the full raw config_json so per-template custom fields (imageUrl, coverText,
  // revealThreshold, ...) reach the unit, then re-apply the explicit/defaulted
  // fields the builder already computes so a malformed raw value can never
  // shadow the already-coerced typed one.
  const adParams: Record<string, Json> = {
    ...asRecord(ctx.rawConfig),
    durationSeconds: ctx.config.durationSeconds ?? DEFAULT_DURATION_SECONDS,
  };
  if (ctx.config.videoUrl) adParams.videoUrl = ctx.config.videoUrl;
  if (ctx.config.videoMimeType) adParams.videoMimeType = ctx.config.videoMimeType;
  if (ctx.config.clickThroughUrl) adParams.clickThroughUrl = ctx.config.clickThroughUrl;
  if (ctx.config.productName) adParams.productName = ctx.config.productName;
  if (ctx.config.productImageUrl) adParams.productImageUrl = ctx.config.productImageUrl;
  if (ctx.config.width) adParams.width = ctx.config.width;
  if (ctx.config.height) adParams.height = ctx.config.height;
  // Self-reported VPAID viewability (ADR-0012): the unit can't sign its own
  // beacon URL (the HMAC secret is server-only), so it's pre-minted here like
  // every other tracking URL. VPAID-only, by construction rather than by
  // convention: `viewable` is documented (docs/data-model.md) as never
  // produced by a SIMID creative, and AdParameters is fully inspectable
  // (ADR-0003) — a SIMID document handed a working signed "viewable" URL
  // could fire it itself even though nothing in the runtime does today, so
  // simply not minting the URL for that format is what actually keeps the
  // invariant true rather than merely documented. `viewableTrackingUrl` is a
  // reserved AdParameters key: no template's config_schema may name a field
  // that.
  if (ctx.serving.selected_format === "vpaid") {
    adParams.viewableTrackingUrl = trackingUrl(ctx.siteUrl, cid, "viewable");
  }
  const adParameters = `            <AdParameters>${cdata(
    JSON.stringify(adParams),
  )}</AdParameters>\n`;

  const mediaFiles = indent(adapter.mediaFilesInner(ctx), 14);

  // OMID pass-through (ADR-0012): SIMID-only today (adapter.adVerificationsInner
  // is optional; VPAID's adapter doesn't implement it). Omitted entirely when
  // the fragment is empty (no vendor configured) rather than emitting an empty
  // <AdVerifications> element.
  const adVerificationsFragment = adapter.adVerificationsInner?.(ctx) ?? "";
  const adVerifications = adVerificationsFragment
    ? `      <AdVerifications>\n${indent(adVerificationsFragment, 8)}\n      </AdVerifications>\n`
    : "";

  // [ERRORCODE] is a VAST macro the player substitutes; it must stay literal.
  const errorUrl = `${trackingUrl(ctx.siteUrl, cid, "error")}&code=[ERRORCODE]`;

  return `${XML_DECL}
<VAST version="4.2">
  <Ad id="${escapeXml(cid)}">
    <InLine>
      <AdSystem version="1.0">AdInteract</AdSystem>
      <AdTitle><![CDATA[AdInteract Interactive Creative]]></AdTitle>
      <Error>${cdata(errorUrl)}</Error>
      <Impression>${cdata(trackingUrl(ctx.siteUrl, cid, "impression"))}</Impression>
${adVerifications}      <Creatives>
        <Creative id="${escapeXml(cid)}" sequence="1">
          <UniversalAdId idRegistry="adinteract">${escapeXml(cid)}</UniversalAdId>
          <Linear>
            <Duration>${duration}</Duration>
${adParameters}            <TrackingEvents>
${trackingEvents}
            </TrackingEvents>
${videoClicks}            <MediaFiles>
${mediaFiles}
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;
}

/**
 * Top-level entry: decide whether to serve the interactive payload or fail
 * closed. Returns empty VAST on any missing entitlement, unknown format, or
 * missing required asset. This is the single decision point for the endpoint.
 */
export function generateVast(ctx: VastBuildContext): string {
  if (!ctx.serving.should_serve) return emptyVast();
  const adapter = getAdapter(ctx.serving.selected_format);
  if (!adapter) return emptyVast();
  // The interactive unit is always required; video is required only for formats
  // that need it (SIMID). VPAID image-only creatives have no videoUrl.
  if (!ctx.interactiveUrl) return emptyVast();
  if (!adapter.isServable(ctx)) return emptyVast();
  return buildInlineVast(ctx);
}
