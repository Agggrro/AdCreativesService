import type { VideoBeacons } from "./model";
import { PROGRESS_COUNTER } from "./spec";

/**
 * Stand-in URLs for a document no player will count (ADR-0035): the
 * generator's live preview, which builds in the visitor's browser — signed out,
 * as often as not — and the save action's self-check.
 *
 * Nothing is signed: the beacon key is server-only, and a public page that
 * minted real beacons would be a free counter-inflation service. These point at
 * our own `/t` so the XML reads like the tag it previews, with `cid=preview`,
 * which `/t` drops before any write because it is not a uuid.
 */

/** Stands in for the creative id until there is one: the preview's ids are placeholders like its beacons. */
export const PREVIEW_CREATIVE_ID = "00000000-0000-4000-8000-000000000000";

/**
 * The ad domain every deployment that serves tags uses (ADR-0018), standing in
 * when the configured base is not https. That happens only in local
 * development, where the CDN falls back to `http://localhost`, and it matters
 * there: our own validator warns on an http tracker, and the save-time check
 * refuses a document it warns on — so with the local base every local save
 * would fail on placeholders that never ship.
 */
const HTTPS_PLACEHOLDER_BASE = "https://smithcdn.net";

export function previewBeacons(siteUrl: string, options: { routeClicks?: boolean } = {}): VideoBeacons {
  const base = siteUrl.startsWith("https://") ? siteUrl.replace(/\/+$/, "") : HTTPS_PLACEHOLDER_BASE;
  const inert = (event: string) => `${base}/t?cid=preview&e=${event}`;
  return {
    impression: () => inert("impression"),
    error: () => inert("error"),
    click: () => inert("click"),
    progress: (event) => inert(PROGRESS_COUNTER[event]),
    viewable: () => inert("viewable"),
    // The browser's preview keeps the buyer's own destination, so a click in
    // the well opens their landing. The self-check routes it the way the served
    // tag does, through `/r`, so our validator judges the document that ships
    // and not one carrying a destination no player will ever see.
    clickThrough: (field, destination) =>
      options.routeClicks ? `${base}/r?cid=preview&f=${encodeURIComponent(field)}` : destination,
  };
}
