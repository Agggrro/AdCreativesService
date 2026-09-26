import { randomBytes } from "node:crypto";
import { signTrackToken, verifyTrackToken } from "./track-token";

/**
 * Click links: how a click from a served creative gets a click id (ADR-0023).
 * The signed, server-only half; what a destination is and how macros expand
 * live in lib/click-destination.ts, which a client bundle can import.
 *
 * The VAST builder replaces every click destination in the tag — the
 * `<ClickThrough>` and the same URL fields inside `<AdParameters>` — with a
 * signed link to `/r`. The redirect mints a click id, records the click, and
 * sends the viewer on to the destination with `{click_id}` filled in. The
 * partner network stores that id and posts it back to `/pb` when the viewer
 * converts, which is the only way a conversion can be tied to a creative.
 *
 * The link carries the *field name*, never the destination: `/r` reads the URL
 * from the creative's own config, so there is no parameter to point it anywhere
 * else. That alone would still let any account — signing up is free — turn our
 * ad domain into a redirect to whatever it configured, so `/r` also demands a
 * genuine signature, which only `/v` mints and only for a creative that may
 * serve (checkClickToken below).
 */

/**
 * Signed under the beacon key with an `r:` prefix, which is the domain
 * separation: `/t` accepts only its own three event names and `/r` only
 * `r:<field>`, so neither signature is accepted by the other route.
 */
const SIGNED_EVENT_PREFIX = "r:";

/** 96 bits: collision-free at any click volume this product will see. */
export function mintClickId(): string {
  return randomBytes(12).toString("hex");
}

/**
 * How long a click link records. A day, not a beacon's hour: the signature
 * protects nothing that `/v` does not hand out afresh on every fetch, and an
 * expired link costs a real conversion its attribution — a viewer on a quiz's
 * result screen, a tag cached by an SSP or a server-side ad inserter.
 */
export const CLICK_LINK_TTL_SECONDS = 24 * 60 * 60;

/**
 * How much longer a genuine link still *redirects*, without recording. A click
 * through a stale tag should still reach the advertiser; a link nobody could
 * have been served this week should not. It is also the longest a lapsed
 * account's last-served links keep redirecting.
 */
export const CLICK_LINK_GRACE_SECONDS = 7 * 24 * 60 * 60;

/**
 * What a click link's signature covers: the field and the creative's *owner*,
 * as well as the creative id the token itself signs. The owner is not in the
 * link — `/r` reads it from the creative — so a link only verifies against the
 * account it was minted for. Without it, an id freed by a deleted creative could
 * be taken by another account, and every link collected while the old creative
 * was live would redirect to the new owner's URL for the rest of its life.
 */
function clickEvent(ownerId: string, field: string): string {
  return `${SIGNED_EVENT_PREFIX}${field}:${ownerId}`;
}

/** The signed `/r` link the builder puts in place of one click destination. */
export function clickUrl(
  siteUrl: string,
  creativeId: string,
  ownerId: string,
  field: string,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const { exp, sig } = signTrackToken(
    creativeId,
    clickEvent(ownerId, field),
    CLICK_LINK_TTL_SECONDS,
  );
  return (
    `${base}/r?cid=${encodeURIComponent(creativeId)}` +
    `&f=${encodeURIComponent(field)}` +
    `&exp=${exp}&sig=${encodeURIComponent(sig)}`
  );
}

/**
 * What a `/r` hit's signature proves, for exactly this creative, owner and
 * field:
 *
 * - `fresh`   — minted by `/v` within the TTL. Redirect and record.
 * - `stale`   — genuine, but past the TTL and within the grace. Redirect only.
 * - `invalid` — forged, missing, older than that, or minted for another owner.
 *   No redirect at all: a genuine signature is the only evidence that this
 *   creative was ever served, and without it `/r` would redirect for any
 *   account's configured URL.
 */
export function checkClickToken(
  creativeId: string,
  ownerId: string,
  field: string,
  exp: string | null,
  sig: string | null,
): "fresh" | "stale" | "invalid" {
  const event = clickEvent(ownerId, field);
  if (verifyTrackToken(creativeId, event, exp, sig)) return "fresh";
  if (verifyTrackToken(creativeId, event, exp, sig, CLICK_LINK_GRACE_SECONDS)) {
    return "stale";
  }
  return "invalid";
}

/**
 * Crawlers, scanners and link previewers that fetch a click-through with GET.
 * Ad-quality scanners and landing-page audits do this on every creative they
 * see, and each fetch would otherwise mint a click and dilute CR. They get the
 * same redirect as anyone — an answer that differed by user agent would look
 * like cloaking — just no click id and no row. A heuristic, not a bot filter:
 * a scanner posing as a browser is still counted.
 *
 * `bot` only counts as a word followed by a separator — `Googlebot/2.1`,
 * `AdsBot-Google`, `PetalBot;` — because a bare substring also matches phone
 * models: an Android WebView from a CUBOT handset says `CUBOT X30 Build/…`, and
 * that viewer is a person.
 */
const BOT_UA =
  /bot[/\-_;)]|\bbot\b|crawler|spider|slurp|crawl|mediapartners|inspectiontool|preview|scanner|headless|lighthouse|facebookexternalhit|embedly|curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|okhttp|axios\/|node-fetch|httpclient|libwww|phantomjs|puppeteer|playwright/i;

export function isLikelyBot(userAgent: string | null): boolean {
  return !userAgent || BOT_UA.test(userAgent);
}
