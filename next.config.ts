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
  // The click redirect every served destination goes through (ADR-0023). Lives
  // on the ad domain, since that is where the tag's links point.
  { source: "/r", destination: "/api/click" },
  // S2S postbacks. Registered everywhere like the rest, but only ever handed
  // out on the app domain: a network's server is not a publisher's page, and
  // the ad domain's catch-all below keeps answering it 404 there.
  { source: "/pb", destination: "/api/postback" },
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
  /**
   * `app/icon.tsx` generates the tab icon and Next links it as `/icon`, which is
   * what a browser reading the markup uses. Nothing serves `/favicon.ico` any
   * more, though — the starter default that used to sit there was deleted — and
   * anything that requests that path blind rather than reading the `<link>` (a
   * crawler, a feed reader, a bookmark service) got a 404 where it used to get
   * 200. This restores the path without keeping a second copy of the mark.
   */
  async redirects() {
    // App domain only. Redirects run *before* the rewrites below (see the order
    // at the top of this file), so an unscoped rule would fire on the ad domain
    // too — turning a request the catch-all sends straight to `/cdn/blocked`
    // into a 307 that advertises an app route name to a publisher's page. The
    // ad domain answers ads and one page explaining itself (ADR-0018); a
    // favicon is not either of those, and it keeps getting the catch-all.
    return CDN_HOST
      ? [
          {
            source: "/favicon.ico",
            destination: "/icon",
            permanent: false,
            missing: [{ type: "host" as const, value: CDN_HOST }],
          },
        ]
      : [{ source: "/favicon.ico", destination: "/icon", permanent: false }];
  },

  async rewrites() {
    // Origin of the runtime store, read off the first pushed asset — the media
    // host since ADR-0029. Null before anything has been pushed, in which case
    // the `/c/u/` rewrite is simply not registered; nothing resolves to it either.
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
            "/:path((?!v$|t$|r$|c/|cdn$|cdn/|_next/|cdn-robots\\.txt$|favicon\\.ico$).+)",
          destination: "/cdn/blocked",
          has: onCdn,
        },
      );
    }

    const afterFiles = [...NEUTRAL_PATHS];
    if (assetOrigin) {
      // A VPAID unit from our own host. Served tags name the unit's media-host
      // URL directly (ADR-0029); this path is for the configurator's previews,
      // which load the unit from the page's own origin so the unit's telemetry
      // can reach it (ADR-0019), and for tags built before the move.
      //
      // **Scripts under `runtime/` only.** The store behind the media host also
      // holds every advertiser's uploads and the SIMID document, so `/c/u/:path*`
      // would proxy the whole bucket through the app — 25 MB videos on our
      // transfer, and HTML rendered on the origin that holds the session.
      // Mirrors RUNTIME_SCRIPT_KEY_RE (lib/runtime-keys.ts), which next.config.ts
      // cannot import.
      afterFiles.push({
        source: "/c/u/:path(runtime/(?:[a-z0-9_-]+/)*[a-z0-9_-]+\\.[0-9a-f]{8}\\.js)",
        destination: `${assetOrigin}/:path`,
      });
    }

    return { beforeFiles, afterFiles, fallback: [] };
  },

  async headers() {
    return [
      {
        // The beacons and the creative assets. `*` is all they need: a beacon
        // is a simple GET, delivered whether or not its response is readable,
        // and the assets load by navigation and `<script src>`, which never
        // read a response through CORS. No `Vary: Origin` — varying would
        // shard a CDN cache that exists precisely to absorb this traffic.
        //
        // Not the tag. VAST 4.2 requires `/v` to echo the request's origin and
        // allow credentials, which a static header cannot do, so its handler
        // owns its CORS outright (lib/vast/cors.ts, ADR-0026). A rule here
        // would be a second source that could only override or duplicate it.
        source: "/:path(t|c/.*)",
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
