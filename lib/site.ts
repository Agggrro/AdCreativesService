/** Public base URL (no trailing slash). Used for VAST tags, auth redirects, etc. */
export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

/**
 * Base URL for everything a third-party player fetches: the VAST tag, the
 * tracking beacons, and the creative assets. Separate from `getSiteUrl()` so the
 * ad domain and the app domain can differ (ADR-0018).
 *
 * Falls back to the app URL when unset, which is what makes the domain cutover a
 * two-step: deploy the code with this empty and nothing changes; set it and the
 * tags move. Rolling back is unsetting it again.
 */
export function getCdnUrl(): string {
  return (process.env.NEXT_PUBLIC_CDN_URL ?? getSiteUrl()).replace(/\/+$/, "");
}

/**
 * Bare hostname of the ad domain, or null when it is not configured. Used to
 * recognise a request that arrived on it — see middleware.ts, which must never
 * set a cookie there.
 */
export function getCdnHost(): string | null {
  const url = process.env.NEXT_PUBLIC_CDN_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
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

/**
 * Origin the VAST validator runs a stranger's creative on.
 *
 * The validator plays a tag the visitor supplied, through Google IMA, in
 * `VpaidMode.INSECURE` — which is not a lapse but the point: every production
 * player that runs VPAID at all runs it that way, and a sandboxed check would
 * report a success the tag will never have. The consequence is that arbitrary
 * third-party JavaScript executes with whatever privileges the hosting page has.
 * On the app origin that means the visitor's session, our own API routes, and
 * `localStorage`.
 *
 * So it does not run on the app origin. It runs in an iframe on a different one,
 * where the same-origin policy makes that reach unavailable — the fidelity is
 * kept and the blast radius is not.
 *
 * Resolution order:
 *  1. `NEXT_PUBLIC_SANDBOX_URL`, for an origin dedicated to this and nothing else.
 *  2. `NEXT_PUBLIC_CDN_URL` — the ad domain (ADR-0018). A separate registrable
 *     domain, so no cookie of ours can be scoped to it, and middleware already
 *     refuses to write one there.
 *  3. In local development only, the loopback twin: `localhost` ↔ `127.0.0.1` on
 *     the same dev server. A genuinely different origin by the same-origin
 *     policy, reachable because `next dev` binds `127.0.0.1`. This exists so the
 *     isolation is exercised locally rather than first met in production; it can
 *     only ever produce a loopback host, so it cannot leak into a deployment.
 *
 * **Returns null when no cross-origin home exists, and the caller must then
 * refuse to play.** Falling back to the app's own origin would turn the control
 * off silently, which is the one failure mode a security boundary may not have.
 *
 * Takes the origin the page is actually on rather than reading `getSiteUrl()`:
 * under `dev:https` the env var still says `http://localhost:3000` while the
 * page is https, and comparing against the wrong one would either disable the
 * sandbox or point it at a scheme the browser will not frame.
 */
export function getSandboxUrl(appOrigin: string): string | null {
  const configured = process.env.NEXT_PUBLIC_SANDBOX_URL || process.env.NEXT_PUBLIC_CDN_URL;
  if (configured) {
    try {
      const origin = new URL(configured).origin;
      // Configured to the app's own origin is not a sandbox. Fail closed rather
      // than pretend.
      return origin === appOrigin ? null : origin;
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(appOrigin);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.origin;
    }
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      return url.origin;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Origins the sandbox page will accept a document from.
 *
 * The mirror of `getSandboxUrl()`: whatever that resolves to for the app, the
 * app is what the sandbox must trust back. Both loopback spellings are included
 * when the site URL is one, because either can be the page the developer has
 * open while the other serves the frame.
 */
export function getAllowedParentOrigins(): string[] {
  const site = getSiteUrl();
  const origins = new Set<string>();
  try {
    const url = new URL(site);
    origins.add(url.origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      const twin = new URL(site);
      twin.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
      origins.add(twin.origin);
    }
  } catch {
    /* an unparseable site URL leaves the list empty, which accepts nothing */
  }
  return [...origins];
}
