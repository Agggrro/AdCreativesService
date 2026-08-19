import type { NextConfig } from "next";
// Imported straight from the manifest, not through lib/runtime-manifest.ts:
// next.config.ts is transpiled and run outside the app's module resolution, so
// the `@/` alias that module uses does not resolve here.
import { RUNTIME_MANIFEST } from "./runtime/manifest";

/**
 * Routing for the split between the app domain and the ad domain (ADR-0018).
 *
 * Everything here runs in Vercel's routing layer, before any function: a rewrite
 * is a routing rule, not code waking up. That is what lets the ad domain serve
 * the creative unit without giving back the CDN win from ADR-0017.
 *
 * Order Next applies: headers → redirects → middleware → beforeFiles rewrites →
 * filesystem → afterFiles → dynamic routes. Middleware therefore sees the
 * *original* path (`/v`), never the rewritten one — see middleware.ts, whose
 * matcher has to exclude these paths by their public names.
 */

/** Bare host of the ad domain, or a value that can never match a real request. */
const CDN_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_CDN_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
})();

/**
 * Public paths, deliberately short and meaningless. `/api/vast?creative_id=…`
 * announces what it is to every filter between the player and us; `/v` does not.
 * They are registered on **every** host, not just the ad domain, so the code has
 * one URL shape to emit and local development exercises the same routes.
 *
 * The `/api/*` originals keep working forever. Tags already pasted into a DSP
 * point at them, and a tag that stops resolving is a campaign that stops.
 */
const NEUTRAL_PATHS = [
  { source: "/v", destination: "/api/vast" },
  { source: "/t", destination: "/api/track" },
  { source: "/c/s/:token", destination: "/api/creative/simid/:token" },
];

/**
 * Origins allowed to frame `/c/player`, the validator's isolated player.
 *
 * The page exists to be cross-origin to the app; letting anyone else frame it
 * would hand them a ready-made VPAID execution surface pointed at our domain.
 * Mirrors `getAllowedParentOrigins()` in lib/site.ts — inlined because
 * next.config.ts runs outside the app's module resolution.
 *
 * Only `frame-ancestors` is set, not a full policy: IMA loads its own script,
 * spawns frames and creates blob URLs, and a script-src guess here would break
 * the playback this page exists for while protecting nothing extra — the origin
 * boundary is the control.
 */
const FRAME_ANCESTORS = (() => {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  try {
    const url = new URL(site);
    const origins = new Set([url.origin]);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      const twin = new URL(site);
      twin.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
      origins.add(twin.origin);
    }
    return [...origins].join(" ");
  } catch {
    return "'none'";
  }
})();

const nextConfig: NextConfig = {
  async rewrites() {
    // Origin of the public blob store, read off the first pushed asset — its
    // store id is part of the hostname and nothing else knows it. Null before
    // anything has been pushed, in which case the `/c/u/` rewrite is simply not
    // registered; nothing resolves to it either.
    const first = Object.values(RUNTIME_MANIFEST.assets)[0];
    let assetOrigin: string | null = null;
    if (first) {
      try {
        assetOrigin = new URL(first.url).origin;
      } catch {
        assetOrigin = null;
      }
    }

    const beforeFiles = [];
    if (CDN_HOST) {
      const onCdn = [{ type: "host" as const, value: CDN_HOST }];

      // The ad domain serves ads and one page explaining itself. Everything else
      // — the dashboard, auth, the Stripe webhook, the free tools — is 404 here.
      // It is loaded inside strangers' players on strangers' pages; the less of
      // the product that answers on it, the smaller the surface.
      beforeFiles.push(
        { source: "/", destination: "/cdn", has: onCdn },
        { source: "/robots.txt", destination: "/cdn-robots.txt", has: onCdn },
        {
          // Everything that is not an ad path, the ad-ops page, or the assets
          // that page needs. The lookahead must list the rewrite *targets* too:
          // beforeFiles entries are all evaluated in turn and can otherwise
          // chain into each other.
          source:
            "/:path((?!v$|t$|c/|cdn$|cdn/|_next/|cdn-robots\\.txt$|favicon\\.ico$).+)",
          destination: "/cdn/blocked",
          has: onCdn,
        },
      );
    }

    const afterFiles = [...NEUTRAL_PATHS];
    if (assetOrigin) {
      // The VPAID unit, served from our own host. An external rewrite proxies at
      // the edge and passes the upstream's headers through, so the object's
      // year-long immutable cache still applies — this costs a hop inside
      // Vercel's network, not a function invocation.
      afterFiles.push({
        source: "/c/u/:path*",
        destination: `${assetOrigin}/:path*`,
      });
    }

    return { beforeFiles, afterFiles, fallback: [] };
  },

  async headers() {
    return [
      {
        // The tag and the assets are read cross-origin by players on publishers'
        // pages. `*` with no `Vary: Origin`: varying would shard a CDN cache
        // that exists precisely to absorb this traffic. Never with
        // `Allow-Credentials` — invalid with `*`, and there are no cookies here.
        source: "/:path(v|t|c/.*)",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
      {
        // Narrower than the rule above and declared after it, so it wins for
        // this one path: the player frame is not a cross-origin asset anyone
        // should fetch, it is a document only our own page may embed.
        source: "/c/player",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS}` },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
