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

// No <TrackingEvents> is emitted at all any more (ADR-0016). The five
// start/quartile/complete trackers cost one player-fired beacon each — seven per
// impression once <Impression> and viewability are counted — to reproduce
// numbers the buyer's own DSP already reports. An element with no children
// would be pointless, so the whole node is dropped rather than left empty.

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
 * Build a signed tracking/beacon URL for the ingest endpoint (`GET /api/track`).
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
  // `/t`, not `/api/track` — a neutral path that does not announce what it is to
  // every filter between the player and us (ADR-0018). `/api/track` still
  // resolves, forever: it is what tags already pasted into a DSP point at.
  return `${base}/t?cid=${encodeURIComponent(creativeId)}&e=${encodeURIComponent(event)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
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

  // Emitted after <MediaFiles>, which is the XSD's order for Linear's derived
  // sequence (Duration, AdParameters, MediaFiles, VideoClicks, Icons). It used to
  // sit before it. lib/vast-inspect/rules/ordering.ts deliberately does not
  // enforce Linear's order — the XSD contradicts real tags there — but "not
  // warned about" is not a reason for our own output to be the wrong one, and
  // this block went from conditional to unconditional in the same change.
  //
  // <VideoClicks> is emitted even without a tag-level <ClickThrough>: the click
  // tracker is the point, and some templates carry no tag-level destination at
  // all (quiz routes each outcome to its own URL, which the unit passes to the
  // player at click time). VAST 4.2 allows ClickTracking without ClickThrough.
  //
  // What fires it is the player handling the unit's AdClickThru, and the runtime
  // raises that **only** from the final call-to-action that opens the
  // advertiser's URL — never from an intermediate interaction. So this counts
  // clicks that led somewhere, not clicks on the ad. See
  // runtime/lib/vpaid-base.js's clickThrough() and its call sites.
  const clickThrough = ctx.config.clickThroughUrl
    ? `              <ClickThrough>${cdata(ctx.config.clickThroughUrl)}</ClickThrough>\n`
    : "";
  const videoClicks =
    `            <VideoClicks>\n` +
    clickThrough +
    `              <ClickTracking>${cdata(
      trackingUrl(ctx.siteUrl, cid, "click"),
    )}</ClickTracking>\n` +
    `            </VideoClicks>\n`;

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
      <AdSystem version="1.0">CreoSmith</AdSystem>
      <AdTitle><![CDATA[CreoSmith Interactive Creative]]></AdTitle>
      <Error>${cdata(errorUrl)}</Error>
      <Impression>${cdata(trackingUrl(ctx.siteUrl, cid, "impression"))}</Impression>
${adVerifications}      <Creatives>
        <Creative id="${escapeXml(cid)}" sequence="1">
          <UniversalAdId idRegistry="creosmith">${escapeXml(cid)}</UniversalAdId>
          <Linear>
            <Duration>${duration}</Duration>
${adParameters}            <MediaFiles>
${mediaFiles}
            </MediaFiles>
${videoClicks}
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
