import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Whether a request carries `Authorization: Bearer <CRON_SECRET>` — compared in
 * constant time, like every other secret check here. The cron routes it guards
 * read across every tenant, write the snapshot stores and return tenant ids.
 * Both sides are hashed first so the comparison never depends on length.
 */
export function hasCronBearer(request: Request, secret: string): boolean {
  const given = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}
