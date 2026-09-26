import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs the tracking-beacon URLs the VAST builder embeds in `<Impression>` /
 * `<Tracking>` / `<Error>`, so a third party who only knows a creative_id
 * (visible in plain sight in the VAST tag URL they were given, or in any
 * pasted DSP screenshot) cannot mint arbitrary `/api/track` hits for it.
 * Those events now feed a customer-facing dashboard
 * (`public.get_creative_overview`), so an unsigned beacon is no longer a
 * cosmetic gap — see docs/security.md.
 *
 * `exp` is generous (not the 120s of the live-preview token) because a
 * tracking URL must stay valid for the full lifetime of one ad play —
 * buffering, a long `durationSeconds`, a slow network — not just until the
 * VAST document is fetched.
 */
const TRACK_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * `TRACK_TOKEN_SECRET` is the intended, independent secret (docs/security.md:
 * "never derive one from another"). Until it's provisioned, fall back to a
 * domain-separated derivation of `PREVIEW_TOKEN_SECRET` — HMAC with a fixed
 * label is a standard KDF pattern, not secret reuse — so this ships without
 * requiring a new Vercel environment variable on this deploy. Set
 * `TRACK_TOKEN_SECRET` (e.g. `openssl rand -base64 32`) to fully separate the
 * two trust domains. No code needs to change when you do, but it is a key
 * rotation: every signed URL in flight stops verifying, and since ADR-0023
 * that includes click links, which then 404 for the viewer rather than being
 * quietly dropped like a beacon. Do it off-peak (docs/security.md).
 */
function deriveKey(): Buffer {
  const dedicated = process.env.TRACK_TOKEN_SECRET;
  if (dedicated) return Buffer.from(dedicated, "utf8");

  const master = process.env.PREVIEW_TOKEN_SECRET;
  if (!master) throw new Error("Missing TRACK_TOKEN_SECRET (or PREVIEW_TOKEN_SECRET as fallback)");
  return createHmac("sha256", master)
    .update("creosmith:track-token:v1")
    .digest();
}

function sign(creativeId: string, event: string, exp: number): string {
  return createHmac("sha256", deriveKey())
    .update(`${creativeId}.${event}.${exp}`)
    .digest("base64url");
}

/**
 * Mint the `exp`/`sig` pair for one tracking beacon URL.
 *
 * `ttlSeconds` exists for the click links (ADR-0023), which outlive a beacon's
 * hour on purpose: a viewer may sit on a quiz's result screen, and a tag may be
 * cached downstream of us, and an expired click link loses its attribution.
 */
export function signTrackToken(
  creativeId: string,
  event: string,
  ttlSeconds: number = TRACK_TOKEN_TTL_SECONDS,
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: sign(creativeId, event, exp) };
}

/**
 * Verify a beacon hit. Returns false on any problem — the route must fail
 * closed (drop the beacon) exactly like `/api/vast` fails closed to empty
 * VAST, never distinguishing "bad signature" from "expired" from "missing".
 *
 * `graceSeconds` accepts a genuine signature that expired no longer ago than
 * that. Only the click redirect uses it, and only to decide whether to redirect
 * at all — never to record anything (ADR-0023).
 */
export function verifyTrackToken(
  creativeId: string,
  event: string,
  expRaw: string | null,
  sigRaw: string | null,
  graceSeconds = 0,
): boolean {
  if (!expRaw || !sigRaw) return false;
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000) - graceSeconds) {
    return false;
  }

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(creativeId, event, exp), "base64url");
    actual = Buffer.from(sigRaw, "base64url");
  } catch {
    return false;
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
