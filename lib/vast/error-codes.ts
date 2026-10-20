/**
 * VAST error codes (IAB VAST 4.2 §2.3.6.3) — the value a player substitutes for
 * `[ERRORCODE]` in our `<Error>` beacon, and what `/t?e=error` counts (ADR-0032).
 *
 * Dependency-free on purpose: the ad path (`lib/serving/http/track.ts`) imports
 * `parseErrorCode`, and the dashboard reads `KNOWN_VAST_ERROR_CODES` to decide
 * whether a code has a description in the dictionaries. The descriptions
 * themselves live in `lib/i18n/dictionaries.ts` (`vastErrors.codes`) — no locale
 * logic on the public path.
 */

/** Recorded when the player sent no usable code: literal `[ERRORCODE]`, empty, junk. */
export const UNKNOWN_ERROR_CODE = 0;

/** Every code VAST 4.2 defines. Anything else in 100–999 is still counted, as itself. */
export const KNOWN_VAST_ERROR_CODES = [
  100, 101, 102,
  200, 201, 202, 203, 204, 205, 206,
  300, 301, 302, 303, 304,
  400, 401, 402, 403, 405, 406, 407, 408, 409, 410,
  500, 501, 502, 503,
  600, 601, 602, 603, 604,
  900, 901, 902,
] as const;

export type KnownVastErrorCode = (typeof KNOWN_VAST_ERROR_CODES)[number];

const KNOWN = new Set<number>(KNOWN_VAST_ERROR_CODES);

export function isKnownVastErrorCode(code: number): code is KnownVastErrorCode {
  return KNOWN.has(code);
}

/**
 * The `code` parameter as the counter's key. Strictly three digits in the VAST
 * range; everything else is `UNKNOWN_ERROR_CODE`, so the number of distinct keys
 * one creative can accumulate stays bounded however the parameter is abused.
 * It is not covered by the beacon's signature — the player fills it in after we
 * sign — so this is the whole of its validation.
 */
export function parseErrorCode(raw: string | null): number {
  if (raw === null || !/^[1-9]\d{2}$/.test(raw)) return UNKNOWN_ERROR_CODE;
  return Number(raw);
}
