/**
 * The `code` parameter of our `<Error>` beacon — the value a player substitutes
 * for `[ERRORCODE]` — as the key `/t?e=error` counts under (ADR-0032).
 *
 * Dependency-free on purpose: the ad path (`lib/serving/http/track.ts`) imports
 * it. What a code *means* is not here: the dashboard names codes through the
 * inspector's IAB table (`lib/vast-inspect/errors-iab.ts`), the one copy of it.
 */

/** Recorded when the player sent no usable code: literal `[ERRORCODE]`, empty, junk. */
export const UNKNOWN_ERROR_CODE = 0;

/**
 * The code as the counter's key: VAST's three-digit codes, or a vendor's own
 * four-digit one (IMA reports 1005, for instance) — still information, so kept
 * as itself. Everything else is `UNKNOWN_ERROR_CODE`, which bounds the distinct
 * keys one creative can accumulate however the parameter is abused. It is not
 * covered by the beacon's signature — the player fills it in after we sign — so
 * this is the whole of its validation; the table's check constraint repeats it.
 */
export function parseErrorCode(raw: string | null): number {
  if (raw === null || !/^[1-9]\d{2,3}$/.test(raw)) return UNKNOWN_ERROR_CODE;
  return Number(raw);
}
