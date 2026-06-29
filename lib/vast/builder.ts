import type { VastBuildContext } from "./types";
import { getAdapter } from "./adapters";
import { cdata, escapeXml, indent } from "./xml";

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

/** Build a tracking/beacon URL for the ingest endpoint (see step 7). */
export function trackingUrl(
  siteUrl: string,
  creativeId: string,
  event: string,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/api/track?cid=${encodeURIComponent(creativeId)}&e=${encodeURIComponent(event)}`;
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
  // (server-injected; never baked into the static asset — ADR-0003).
  const adParams: Record<string, string | number> = {
    durationSeconds: ctx.config.durationSeconds ?? DEFAULT_DURATION_SECONDS,
  };
  if (ctx.config.videoUrl) adParams.videoUrl = ctx.config.videoUrl;
  if (ctx.config.clickThroughUrl) adParams.clickThroughUrl = ctx.config.clickThroughUrl;
  if (ctx.config.productName) adParams.productName = ctx.config.productName;
  if (ctx.config.productImageUrl) adParams.productImageUrl = ctx.config.productImageUrl;
  const adParameters = `            <AdParameters>${cdata(
    JSON.stringify(adParams),
  )}</AdParameters>\n`;

  const mediaFiles = indent(adapter.mediaFilesInner(ctx), 14);

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
      <Creatives>
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
  if (!getAdapter(ctx.serving.selected_format)) return emptyVast();
  if (!ctx.config.videoUrl || !ctx.interactiveUrl) return emptyVast();
  return buildInlineVast(ctx);
}
