/**
 * The id shape every public path validates before it reaches the database.
 *
 * `docs/security.md` states the rule as "validate `creative_id` shape before any
 * DB call": junk should cost a regex, not a round trip and a log line anyone can
 * spam. The pattern had been copy-pasted verbatim into each route that needed
 * it; one definition is what keeps a third and fourth copy from drifting.
 */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
