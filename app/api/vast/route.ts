import { createServiceClient } from "@/lib/supabase/service";
import { resolveInteractiveUrl } from "@/lib/storage";
import { generateVast, emptyVast, parseCreativeConfig } from "@/lib/vast";
import { snapshots, snapshotToServing } from "@/lib/serving";
import { UUID_RE } from "@/lib/uuid";
import { getCdnUrl } from "@/lib/site";
import type { CreativeServing } from "@/types/database.types";

// Public, unauthenticated ad-serving endpoint. Node runtime keeps full
// supabase-js/storage support; the ~60s CDN cache (Cache-Control below) absorbs
// QPS/latency. Edge migration is a documented optimization, not required for MVP.
// See docs/architecture.md.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ~60s cache. Used for every answer that is *correct and stable*: a served ad,
 * and an empty ad for a creative that genuinely may not serve (unknown id,
 * lapsed subscription, archived creative). Subscription changes take effect
 * within this window plus snapshot propagation — see ADR-0004 / ADR-0015.
 */
const STABLE_MAX_AGE = 60;

/**
 * How long the CDN may keep serving the last good document when the origin
 * fails. This is the whole point of returning a 5xx from `unavailable()` below:
 * a blip in Blob or Supabase costs nothing, because the player is handed the
 * previous valid VAST instead of an empty one.
 *
 * The cost of the window is that a subscription cancelled during an outage can
 * keep serving for up to this long. The kill-switch already has a ~2 min budget
 * (response cache + snapshot propagation), so 5 minutes is the same order and
 * not a new class of exposure.
 */
const STALE_IF_ERROR = 300;

/**
 * The tag is fetched cross-origin by players running on publishers' pages, so
 * the response has to be readable there. `*` rather than a reflected origin,
 * and deliberately **no `Vary: Origin`**: this endpoint is high-QPS and CDN
 * cached, and varying on origin would shard that cache per publisher — paying
 * an origin miss for every new site the tag appears on. Safe because the
 * response carries no credentials and nothing user-specific.
 *
 * `Access-Control-Allow-Credentials` must never be added here: it is invalid
 * with `*`, and there are no cookies on this path to want it for.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
} as const;

/** A servable answer: 200 with a VAST body — players expect that even when empty. */
function vastResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control":
        `public, s-maxage=${STABLE_MAX_AGE}, stale-while-revalidate=30, ` +
        `stale-if-error=${STALE_IF_ERROR}`,
    },
  });
}

/** A settled "no ad": correct, stable, and cacheable for the normal window. */
function noAd(): Response {
  return vastResponse(emptyVast());
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
function unavailable(): Response {
  return new Response(emptyVast(), {
    status: 503,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Preflight. A plain VAST fetch is a simple request and never triggers this,
 * but players that add a header (or use `fetch` with custom options) do.
 */
export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

type Load =
  | { status: "ok"; serving: CreativeServing }
  | { status: "missing" }
  | { status: "unavailable" };

/**
 * Resolve the serving row without touching Postgres when possible (ADR-0015).
 *
 * Snapshots first; the database is the fallback for a creative whose snapshot
 * has not been published yet (or whose schema version this build does not
 * understand). The fallback is what makes the whole migration safe to roll out:
 * a snapshot miss degrades to exactly the previous behaviour rather than to a
 * dark ad. It is meant to be removed only once misses are observed to be zero.
 */
async function loadServing(creativeId: string): Promise<Load> {
  const snapshot = await snapshots.getCreative(creativeId);
  if (snapshot) {
    // A null entitlement document is not an error: a user who never subscribed
    // has none, and `shouldServe` reads that as "not entitled".
    const entitlement = await snapshots.getEntitlement(snapshot.user_id);
    return { status: "ok", serving: snapshotToServing(snapshot, entitlement) };
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("get_creative_serving", {
    p_creative_id: creativeId,
  });
  // Distinguished on purpose: "the database said no such creative" is settled,
  // "the database did not answer" is not, and they get different cache lives.
  if (error) return { status: "unavailable" };
  if (!data || data.length === 0) return { status: "missing" };
  return { status: "ok", serving: data[0] };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const creativeId = url.searchParams.get("creative_id");

  // Validate input before any read; fail closed on junk. A malformed id is a
  // settled answer, so it caches for the normal window.
  if (!creativeId || !UUID_RE.test(creativeId)) {
    return noAd();
  }

  try {
    const loaded = await loadServing(creativeId);
    if (loaded.status === "missing") return noAd();
    if (loaded.status === "unavailable") return unavailable();

    const serving = loaded.serving;

    // Subscription gate: not entitled / not active => empty VAST.
    if (!serving.should_serve) return noAd();

    // The ad domain, not the app domain (ADR-0018): every URL inside this
    // document — beacons, the SIMID document, the unit — inherits it, and they
    // are fetched by third-party players rather than by us. `getCdnUrl()` falls
    // back to the app URL while NEXT_PUBLIC_CDN_URL is unset, which is what
    // makes the cutover reversible by unsetting one variable.
    const siteUrl = getCdnUrl();

    // Local HMAC, no network: both formats resolve to our own proxy routes now,
    // so building this document touches no Supabase service at all. A failure
    // here means the template has no asset for the selected format — a settled
    // configuration fact, not a transient outage.
    const interactiveUrl = resolveInteractiveUrl(serving, siteUrl);
    if (!interactiveUrl) return noAd();

    const config = parseCreativeConfig(serving.config_json);

    const vast = generateVast({
      serving,
      config,
      rawConfig: serving.config_json,
      interactiveUrl,
      siteUrl,
    });
    return vastResponse(vast);
  } catch {
    // Any unexpected error: never leak a partial payload, and never let the
    // failure itself get cached for a full minute.
    return unavailable();
  }
}
