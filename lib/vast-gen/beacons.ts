import { clickUrl } from "@/lib/click-url";
import { trackingUrl } from "@/lib/vast/builder";
import type { VideoBeacons } from "./model";
import { PROGRESS_COUNTER } from "./spec";

/**
 * The signed URLs a served VAST video document carries (ADR-0035). Server-only:
 * both builders sign with the beacon key, which never reaches a browser.
 *
 * The progress beacons are signed under the *counter's* name (`q25`, not
 * `firstQuartile`), which is what `/t` maps and what the signature binds. They
 * are minted only here — the interactive builder emits no TrackingEvents — so a
 * valid `start`/`q25`/… signature exists only for a video creative.
 */
export function servingBeacons(
  siteUrl: string,
  creativeId: string,
  ownerId: string,
  clickFields: readonly string[],
): VideoBeacons {
  return {
    impression: () => trackingUrl(siteUrl, creativeId, "impression"),
    error: () => trackingUrl(siteUrl, creativeId, "error"),
    click: () => trackingUrl(siteUrl, creativeId, "click"),
    progress: (event) => trackingUrl(siteUrl, creativeId, PROGRESS_COUNTER[event]),
    viewable: () => trackingUrl(siteUrl, creativeId, "viewable"),
    // The link names the field, never the destination: `/r` reads the URL from
    // the stored config, so there is nothing in the tag to repoint (ADR-0023).
    // A field `/r` would not resolve — one the template's `click_fields` lacks
    // — keeps its destination, as the interactive builder does, rather than a
    // link that answers every click with a 404.
    clickThrough: (field, destination) =>
      clickFields.includes(field) ? clickUrl(siteUrl, creativeId, ownerId, field) : destination,
  };
}
