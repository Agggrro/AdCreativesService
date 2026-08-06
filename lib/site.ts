/** Public base URL (no trailing slash). Used for VAST tags, auth redirects, etc. */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/**
 * The origin a request actually arrived on — for URLs a *same-origin* client
 * must be able to fetch back (the live-preview tag and the beacons inside it).
 * The canonical `getSiteUrl()` is wrong for those: it is a fixed env var, so
 * under `npm run dev:https` it still says `http://localhost:3000` while the
 * page is https, and the resulting protocol mismatch breaks the player.
 *
 * Prefers the forwarded headers a proxy sets (Vercel) over `request.url`, whose
 * host can be the internal one behind a proxy.
 */
export function getRequestOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    url.protocol.replace(/:$/, "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0].trim() ??
    request.headers.get("host") ??
    url.host;
  return `${proto}://${host}`.replace(/\/+$/, "");
}
