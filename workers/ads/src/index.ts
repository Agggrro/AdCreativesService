/**
 * creosmith-ads — the ad domain (ADR-0029).
 *
 * Every request a player, a viewer's browser or a crawler makes to the ad domain
 * lands here. The ad paths are answered by the very modules the Next app runs
 * (lib/serving/http): this file is routing, the tag cache, and the few headers
 * Vercel used to add on its own. Nothing in it decides whether an ad serves.
 *
 *   /v                    the VAST tag, cached per data centre
 *   /t                    the beacon
 *   /r                    the click redirect
 *   /c/s/:token           the SIMID document
 *   /c/u/runtime/…        a unit, forwarded to the media host (tags in flight)
 *   /robots.txt           Disallow: /
 *   /, /cdn…, /c/player,
 *   /_next/…              forwarded unchanged to the app
 *   anything else         404
 */
import {
  STABLE_MAX_AGE,
  STALE_IF_ERROR,
  handleVast,
  handleVastPreflight,
} from "@/lib/serving/http/vast";
import { handleTrack } from "@/lib/serving/http/track";
import { handleClick } from "@/lib/serving/http/click";
import { handleSimidDocument } from "@/lib/serving/http/interactive";
import { normalizeCountry, type ServingPlatform } from "@/lib/serving/http/platform";
import { kvSnapshotStore } from "@/lib/serving/store-kv";
import { bindingNamespace, type KvBinding } from "@/lib/serving/kv";
import { SNAPSHOT_CACHE_SECONDS } from "@/lib/serving/store";
import { vastCorsHeaders } from "@/lib/vast/cors";
import { emptyVast } from "@/lib/vast/builder";
import { RUNTIME_SCRIPT_KEY_RE } from "@/lib/runtime-keys";
import { UUID_RE } from "@/lib/uuid";

// The slice of the Workers runtime this file uses, typed here rather than by
// pulling @cloudflare/workers-types into the app's global scope, where its
// Request and Response would collide with the DOM's.
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  /** Serving snapshots (lib/serving/store-kv.ts). */
  SNAPSHOTS: KvBinding;
  /** The Next app on Workers (creosmith-web). Until it exists, the zone's origin answers. */
  WEB?: Fetcher;
  /** Changes on every deploy; keys the tag cache, so a deploy never serves the previous build's tag. */
  CF_VERSION_METADATA: { id: string };
  /** Where the runtime units live — the media host (ADR-0029). */
  NEXT_PUBLIC_MEDIA_URL: string;
}

/** What Vercel sent on every answer from the ad domain; kept so nothing changes for a browser. */
const HSTS = "max-age=63072000";

/** The ad domain's crawl policy, byte for byte what `public/cdn-robots.txt` served. */
const ROBOTS = "User-agent: *\nDisallow: /\n";

/** Next answered OPTIONS on its routes with this; the ad paths keep doing so. */
const ROUTE_METHODS = "GET, HEAD, OPTIONS";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env, ctx);
    } catch (err) {
      // Every handler fails closed on its own. This is the backstop for a bug
      // in the routing itself, and it answers like one — without detail. The
      // tag keeps its contract even here: a VAST body, the VAST 4.2 CORS
      // headers, and a 503 nothing may store.
      const path = new URL(request.url).pathname;
      console.error("[ads-worker] unhandled", { path, err: String(err) });
      response =
        path === "/v"
          ? new Response(emptyVast(), {
              status: 503,
              headers: {
                ...vastCorsHeaders(request),
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "no-store",
              },
            })
          : new Response("Internal error", {
              status: 500,
              headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
            });
    }
    return finish(response, request);
  },
};

export default worker;

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Next redirects a trailing slash away before any route sees the path, so
  // `/v/` was a 308 to `/v` and stays one.
  if (path.length > 1 && path.endsWith("/")) {
    const target = new URL(url);
    target.pathname = path.replace(/\/+$/, "") || "/";
    return new Response(null, { status: 308, headers: { Location: target.href } });
  }

  if (path === "/v") {
    if (method === "OPTIONS") return handleVastPreflight(request);
    if (method !== "GET" && method !== "HEAD") return notAllowed();
    return headOf(await serveVast(request, url, env, ctx), method);
  }

  if (path === "/t") {
    if (method === "OPTIONS") return allowed(true);
    if (method !== "GET" && method !== "HEAD") return notAllowed();
    // A HEAD runs the GET, as Next's route did — a signed beacon counts either way.
    return withAnyOrigin(handleTrack(request, platform(env, ctx)));
  }

  if (path === "/r") {
    if (method === "OPTIONS") return allowed(false);
    if (method !== "GET" && method !== "HEAD") return notAllowed();
    return handleClick(request, platform(env, ctx));
  }

  if (path.startsWith("/c/s/")) {
    const token = path.slice("/c/s/".length);
    if (!token || token.includes("/")) return notFound();
    if (method === "OPTIONS") return allowed(true);
    if (method !== "GET" && method !== "HEAD") return notAllowed();
    return headOf(await handleSimidDocument(token), method);
  }

  if (path.startsWith("/c/u/")) {
    if (method !== "GET" && method !== "HEAD") return notAllowed();
    return forwardUnit(request, path.slice("/c/u/".length), env);
  }

  if (path === "/robots.txt" || path === "/cdn-robots.txt") {
    return headOf(
      new Response(ROBOTS, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      }),
      method,
    );
  }

  // The one page the ad domain shows people, the validator's player frame, and
  // the assets both need: rendered by the app, which keeps every rule it hangs
  // on the ad domain's Host (next.config.ts, middleware.ts). ACME challenges go
  // the same way: while Vercel is the origin it renews the domain's certificate
  // over HTTP-01, and a 404 here would let that certificate lapse.
  //
  // GET and HEAD only. A POST to `/` with a `Next-Action` header is a server
  // action, and the app's sign-in and sign-up actions need no session: answered
  // on the ad domain, `finish()` stripping their cookie would be the only thing
  // keeping a session off it. Nothing here needs another method.
  if (
    path === "/" ||
    path === "/cdn" ||
    path.startsWith("/cdn/") ||
    path === "/c/player" ||
    path.startsWith("/_next/") ||
    path.startsWith("/.well-known/acme-challenge/")
  ) {
    if (method !== "GET" && method !== "HEAD") return notAllowed();
    return forwardToApp(request, env);
  }

  return notFound();
}

function platform(env: Env, ctx: ExecutionContext): ServingPlatform {
  return {
    snapshots: kvSnapshotStore(() => bindingNamespace(env.SNAPSHOTS, SNAPSHOT_CACHE_SECONDS)),
    waitUntil: (promise) => ctx.waitUntil(promise),
    country: (req) =>
      normalizeCountry((req as Request & { cf?: { country?: string } }).cf?.country ?? null),
  };
}

/**
 * The tag, through the data centre's cache (ADR-0029 §1).
 *
 * Keyed on the creative alone: a DSP appends a cache-buster to every request,
 * and keying on the whole query made every one of them a miss. The body is
 * stored without CORS headers and they are added per request, so one copy
 * serves every publisher's origin. The deploy's version is in the key, so a new
 * build never serves the previous build's document.
 *
 * The Cache API has no `stale-if-error`, so it is rebuilt here: every good
 * answer is also kept, for as long as Vercel's CDN would have served it stale,
 * under a second key — and served when our own state cannot be read. A 503 is
 * never stored. While the last good copy is being served it is also put back
 * as the fresh copy for a few seconds, so an outage costs this data centre one
 * failed read per creative every few seconds rather than one per request.
 *
 * The cache is an optimisation, never a dependency: a cache that cannot be
 * read is a miss, and one that cannot be written is logged and ignored.
 */
async function serveVast(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const creativeId = url.searchParams.get("creative_id");
  // A junk id is answered by the handler without a read; nothing to cache.
  if (!creativeId || !UUID_RE.test(creativeId)) {
    return publicTag(await handleVast(request, platform(env, ctx)));
  }

  const cache = (caches as unknown as { default: Cache }).default;
  const version = env.CF_VERSION_METADATA?.id ?? "dev";
  const freshKey = new Request(`${url.origin}/__tag/${version}/${creativeId.toLowerCase()}`);
  const lastGoodKey = new Request(`${url.origin}/__tag-last/${version}/${creativeId.toLowerCase()}`);
  const store = (entries: [Request, Response][]) =>
    ctx.waitUntil(
      Promise.all(entries.map(([key, value]) => cache.put(key, value))).catch((err: unknown) => {
        console.error("[ads-worker] tag cache write failed", { err: String(err) });
      }),
    );

  const cached = await cache.match(freshKey).catch(() => undefined);
  if (cached) return tagFromCache(cached, request);

  const response = await handleVast(request, platform(env, ctx));
  if (response.status === 200) {
    const body = await response.text();
    store([
      [freshKey, storedTag(body, STABLE_MAX_AGE)],
      [lastGoodKey, storedTag(body, STABLE_MAX_AGE + STALE_IF_ERROR)],
    ]);
    return publicTag(new Response(body, response));
  }

  if (response.status === 503) {
    const lastGood = await cache.match(lastGoodKey).catch(() => undefined);
    if (lastGood) {
      console.warn("[serving-fallback] state unreadable, serving the last good tag", { creativeId });
      const body = await lastGood.text();
      store([[freshKey, storedTag(body, OUTAGE_BACKOFF_SECONDS)]]);
      return tagFromCache(new Response(body), request);
    }
  }
  return response;
}

/**
 * How long a data centre serves the last good tag without asking again, once
 * asking has failed. Short against the 360 s the copy itself may be served, so
 * the outage is noticed ending within seconds.
 */
const OUTAGE_BACKOFF_SECONDS = 10;

/** The cache's copy: the document and its type, nothing that varies by request. */
function storedTag(body: string, maxAge: number): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
}

function tagFromCache(cached: Response, request: Request): Response {
  return new Response(cached.body, {
    status: 200,
    headers: {
      ...vastCorsHeaders(request),
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": DOWNSTREAM_CACHE_CONTROL,
    },
  });
}

/**
 * What a 200 tag tells caches downstream of us. Vercel's CDN consumed
 * `s-maxage` and the stale directives and passed on `public`; `max-age=0` is
 * added because a bare `public` 200 lets a shared cache invent a lifetime of
 * its own (RFC 9111 §4.2.2), and a window we cannot purge is one the kill
 * switch cannot reach.
 */
const DOWNSTREAM_CACHE_CONTROL = "public, max-age=0";

function publicTag(response: Response): Response {
  if (response.status !== 200) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", DOWNSTREAM_CACHE_CONTROL);
  return new Response(response.body, { status: 200, headers });
}

/**
 * A unit named by a tag built before units moved to the media host. Only a
 * content-addressed runtime **script** is forwarded: the ad domain does not
 * become a second door to the media bucket, and the SIMID document — HTML — is
 * never rendered here without the CSP `/c/s/` gives it.
 */
async function forwardUnit(request: Request, key: string, env: Env): Promise<Response> {
  if (!RUNTIME_SCRIPT_KEY_RE.test(key)) return notFound();
  const origin = (env.NEXT_PUBLIC_MEDIA_URL ?? "").replace(/\/+$/, "");
  if (!origin) return notFound();

  const upstream = await fetch(`${origin}/${key}`, { method: request.method });
  if (!upstream.ok) return notFound();

  const headers = new Headers();
  // No Content-Length or Content-Encoding: the runtime may have decompressed the
  // body on the way in, and a length copied from upstream would then be wrong.
  for (const name of ["Cache-Control", "ETag", "Last-Modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Always a script, whatever type the object was stored with: anyone holding
  // the bucket's key can add an object under `runtime/` (the lock stops
  // overwrites, not additions), and one stored as HTML must not render as a
  // page on the ad domain.
  headers.set("Content-Type", "application/javascript; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(request.method === "HEAD" ? null : upstream.body, { status: 200, headers });
}

/**
 * Hand the request to the app, untouched — same path, same Host. On a route,
 * a plain `fetch` of the incoming request goes to the zone's origin (Vercel,
 * until the app moves); once the app is a Worker, the service binding is used.
 */
async function forwardToApp(request: Request, env: Env): Promise<Response> {
  return env.WEB ? env.WEB.fetch(request) : fetch(request);
}

/**
 * Every answer leaves through here: HSTS, as Vercel added it, and no cookie
 * ever — the ad domain loads inside other people's pages (ADR-0018), and a
 * forwarded response is the one place one could come from.
 */
function finish(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  headers.delete("Set-Cookie");
  if (new URL(request.url).protocol === "https:") {
    headers.set("Strict-Transport-Security", HSTS);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** HEAD gets the GET's status and headers, without the body. */
function headOf(response: Response, method: string): Response {
  if (method !== "HEAD") return response;
  return new Response(null, { status: response.status, headers: response.headers });
}

/** `next.config.ts` gave `/t` and `/c/*` a static `*`; the ad paths keep it. */
function withAnyOrigin(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, { status: response.status, headers });
}

function allowed(anyOrigin: boolean): Response {
  const headers: Record<string, string> = { Allow: ROUTE_METHODS };
  if (anyOrigin) headers["Access-Control-Allow-Origin"] = "*";
  return new Response(null, { status: 204, headers });
}

function notAllowed(): Response {
  return new Response(null, { status: 405, headers: { Allow: ROUTE_METHODS } });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
