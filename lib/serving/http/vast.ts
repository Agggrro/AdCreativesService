import { createServiceClient } from "@/lib/supabase/service";
import { resolveInteractiveUrl } from "@/lib/storage";
import { emptyVast, generateVast } from "@/lib/vast/builder";
import { parseCreativeConfig } from "@/lib/vast/config";
import { vastCorsHeaders, vastPreflightHeaders } from "@/lib/vast/cors";
import { snapshotToServing } from "@/lib/serving/row";
import { UUID_RE } from "@/lib/uuid";
import { getCdnUrl } from "@/lib/site";
import type { CreativeServing } from "@/types/database.types";
import type { ServingPlatform } from "./platform";

/**
 * The VAST tag (`/v`, and `/api/vast` forever after — ADR-0018). Public and
 * unauthenticated: a player on a publisher's page fetches it.
 */

/**
 * ~60s cache. Used for every answer that is *correct and stable*: a served ad,
 * and an empty ad for a creative that genuinely may not serve (unknown id,
 * lapsed subscription, archived creative). Subscription changes take effect
 * within this window plus snapshot propagation — see ADR-0004 / ADR-0015.
 */
export const STABLE_MAX_AGE = 60;

/**
 * How long the last good document may be served when the origin fails. This is
 * the whole point of returning a 5xx from `unavailable()` below: a blip in the
 * snapshot store or Supabase costs nothing, because the player is handed the
 * previous valid VAST instead of an empty one.
 *
 * The cost of the window is that a subscription cancelled during an outage can
 * keep serving for up to this long. The kill-switch already has a ~2 min budget
 * (response cache + snapshot propagation), so 5 minutes is the same order and
 * not a new class of exposure.
 *
 * Vercel's CDN honoured it as `stale-if-error`; the ad Worker's Cache API does
 * not, so workers/ads keeps the last good document itself for the same time.
 */
export const STALE_IF_ERROR = 300;

/**
 * How long the Postgres fallback may take before it counts as "could not read".
 * Players commonly give a tag 5–8 s end to end; 2.5 s leaves room for the rest
 * of the trip and for the last good document to be served instead.
 */
const DATABASE_FALLBACK_TIMEOUT_MS = 2500;

/**
 * The tag is fetched cross-origin by players on publishers' pages, and some of
 * them fetch it with credentials. Every response here — served, empty, failed,
 * preflight — carries the CORS headers VAST 4.2 requires: the request's origin
 * echoed with `Access-Control-Allow-Credentials`, and `Vary: Origin` so a cache
 * keeps one copy per origin (lib/vast/cors.ts, ADR-0026). `next.config.ts`
 * deliberately sets none for `/v`: this handler is the only source.
 */
type Cors = Record<string, string>;

/** A servable answer: 200 with a VAST body — players expect that even when empty. */
function vastResponse(body: string, cors: Cors): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        `public, s-maxage=${STABLE_MAX_AGE}, stale-while-revalidate=30, ` +
        `stale-if-error=${STALE_IF_ERROR}`,
    },
  });
}

/** A settled "no ad": correct, stable, and cacheable for the normal window. */
function noAd(cors: Cors): Response {
  return vastResponse(emptyVast(), cors);
}

/**
 * "We could not read our own state" — deliberately a 5xx, not an empty 200.
 *
 * An empty 200 is indistinguishable from "this creative may not serve", so the
 * CDN cached it as a valid answer and a one-second blip became a minute of dark
 * inventory on every PoP that missed during it. A 5xx instead activates
 * `stale-if-error` on the previously cached document: the player gets the last
 * good VAST and the impression is not lost. The error never reaches the player
 * unless there is no cached copy at all — in which case there was no ad to save.
 *
 * The body is still a valid empty VAST so a player that ignores the status code
 * parses something sane rather than garbage. `no-store` keeps the failure itself
 * out of the cache.
 */
function unavailable(cors: Cors): Response {
  return new Response(emptyVast(), {
    status: 503,
    headers: {
      ...cors,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Preflight. A plain VAST fetch is a simple request and never triggers this,
 * but players that add a header (or use `fetch` with custom options) do.
 */
export function handleVastPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: vastPreflightHeaders(request) });
}

type Load =
  | { status: "ok"; serving: CreativeServing }
  | { status: "missing" }
  | { status: "unavailable" };

/**
 * Resolve the serving row without touching Postgres when possible (ADR-0015).
 *
 * Snapshots first; the database is the fallback for a creative whose snapshot
 * has not been published yet, or cannot be read (lib/serving/store.ts). The
 * fallback is what makes the store safe to change underneath: a snapshot miss
 * degrades to exactly the previous behaviour rather than to a dark ad.
 */
async function loadServing(creativeId: string, platform: ServingPlatform): Promise<Load> {
  const snapshot = await platform.snapshots.getCreative(creativeId).catch((err: unknown) => {
    console.warn("[serving-fallback] creative snapshot unreadable, reading Postgres", {
      creativeId,
      err: String(err),
    });
    return null;
  });

  if (snapshot) {
    try {
      // A null entitlement document is not an error: a user who never
      // subscribed has none, and `shouldServe` reads that as "not entitled".
      const entitlement = await platform.snapshots.getEntitlement(snapshot.user_id);
      return { status: "ok", serving: snapshotToServing(snapshot, entitlement) };
    } catch (err) {
      // A document that could not be read is "we do not know", not "not
      // entitled": Postgres answers instead. Before ADR-0029 this came back as
      // null and served an empty ad, which then sat in the cache for a minute.
      console.warn("[serving-fallback] entitlement snapshot unreadable, reading Postgres", {
        creativeId,
        err: String(err),
      });
    }
  } else {
    // Stable prefix so the fallback rate is greppable in the logs. Without it
    // this path is invisible: everything keeps working, just against the
    // database we went to some trouble to leave, and nothing says so. A
    // non-zero rate here means a publisher is broken or a backfill is owed —
    // see `npm run check:snapshots`.
    console.warn("[serving-fallback] snapshot miss, reading Postgres", { creativeId });
  }

  const supabase = createServiceClient();
  // Bounded: a database that is slow rather than down must still end in a 503
  // while the player is waiting, or the last good document is never reached —
  // the player's own VAST timeout would fire first.
  const { data, error } = await supabase
    .rpc("get_creative_serving", { p_creative_id: creativeId })
    .abortSignal(AbortSignal.timeout(DATABASE_FALLBACK_TIMEOUT_MS));
  // Distinguished on purpose: "the database said no such creative" is settled,
  // "the database did not answer" is not, and they get different cache lives.
  if (error) return { status: "unavailable" };
  if (!data || data.length === 0) return { status: "missing" };
  return { status: "ok", serving: data[0] };
}

/** `GET /v?creative_id=…` */
export async function handleVast(request: Request, platform: ServingPlatform): Promise<Response> {
  const cors = vastCorsHeaders(request);
  const url = new URL(request.url);
  const creativeId = url.searchParams.get("creative_id");

  // Validate input before any read; fail closed on junk. A malformed id is a
  // settled answer, so it caches for the normal window.
  if (!creativeId || !UUID_RE.test(creativeId)) {
    return noAd(cors);
  }

  try {
    const loaded = await loadServing(creativeId, platform);
    if (loaded.status === "missing") return noAd(cors);
    if (loaded.status === "unavailable") return unavailable(cors);

    const serving = loaded.serving;

    // Subscription gate: not entitled / not active => empty VAST.
    if (!serving.should_serve) return noAd(cors);

    // The ad domain, not the app domain (ADR-0018): every URL inside this
    // document — beacons, the SIMID document, the click links — inherits it, and
    // they are fetched by third-party players rather than by us. `getCdnUrl()`
    // falls back to the app URL while NEXT_PUBLIC_CDN_URL is unset, which is what
    // makes the cutover reversible by unsetting one variable.
    const siteUrl = getCdnUrl();

    // Local HMAC, no network: building this document touches no Supabase
    // service at all. A failure here means the template has no asset for the
    // selected format — a settled configuration fact, not a transient outage.
    const interactiveUrl = resolveInteractiveUrl(serving, siteUrl);
    if (!interactiveUrl) return noAd(cors);

    const config = parseCreativeConfig(serving.config_json);

    const vast = generateVast({
      serving,
      config,
      rawConfig: serving.config_json,
      interactiveUrl,
      siteUrl,
    });
    return vastResponse(vast, cors);
  } catch {
    // Any unexpected error: never leak a partial payload, and never let the
    // failure itself get cached for a full minute.
    return unavailable(cors);
  }
}
