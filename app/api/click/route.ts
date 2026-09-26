import { waitUntil } from "@vercel/functions";
import { createServiceClient } from "@/lib/supabase/service";
import { snapshots } from "@/lib/serving";
import { UUID_RE } from "@/lib/uuid";
import { checkClickToken, isLikelyBot, mintClickId } from "@/lib/click-url";
import {
  CLICK_FIELD_RE,
  TAG_CLICK_FIELD,
  expandClickMacros,
  isHttpUrl,
} from "@/lib/click-destination";
import { asJsonObject } from "@/lib/json";
import type { Json } from "@/types/database.types";

// The click redirect behind every destination in a served tag (ADR-0023),
// public as `/r`. A viewer's browser lands here from a player on a publisher's
// page; we mint a click id, record the click, and send them on. Node runtime
// for `node:crypto` and the service-role write, like `/t`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Never cached, anywhere. A cached 302 would hand the next viewer the previous
 * viewer's click id — two people, one id, and a conversion credited to whoever
 * the network happens to match.
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Clicks recorded per creative per minute before record_click() stops writing
 * rows; the redirect itself is never affected. Anyone can fetch a tag from `/v`
 * and replay its links, and each replay would otherwise be a new row — this is
 * what bounds that. Ten a second is several times what one creative's genuine
 * traffic produces at the volumes this product serves.
 */
const CLICKS_PER_MINUTE = 600;

/** Stable prefix, so a database that stopped answering here is greppable. */
const LOG_PREFIX = "[click-redirect]";

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

/** Our own state could not be read: say so, rather than pretend the link is dead. */
function unavailable(): Response {
  return new Response("Unavailable", { status: 503, headers: NO_STORE });
}

type Resolved =
  | {
      status: "ok";
      /** Whoever owns the creative now — the signature must have been minted for them. */
      ownerId: string;
      /** The field actually used — the requested one, or the tag-level fallback. */
      field: string;
      destination: string;
    }
  | { status: "missing" }
  | { status: "unavailable" };

/**
 * The destination for `field`, read from the creative's own config — never
 * from the request.
 *
 * Snapshot first, database on a miss, the same order as `/v` (ADR-0015). A
 * field that no longer resolves falls back to the tag-level destination rather
 * than to a 404: the tag this link came from may predate an edit, and a viewer
 * who clicked should arrive somewhere the advertiser chose. The quiz unit does
 * the same with an empty exit URL.
 */
async function resolve(creativeId: string, field: string): Promise<Resolved> {
  let ownerId: string;
  let config: Json;
  let fields: string[];

  const snapshot = await snapshots.getCreative(creativeId);
  // A snapshot without `click_fields` predates ADR-0023 — or was republished by
  // an older deployment mid-rollout, after this link's tag was built by a newer
  // one. It cannot say which fields are destinations, so it is treated as a
  // miss: the database always can, and a clicked link must not 404 over it.
  if (snapshot && Array.isArray(snapshot.click_fields)) {
    ownerId = snapshot.user_id;
    config = snapshot.config_json;
    fields = snapshot.click_fields;
  } else {
    const { data, error } = await createServiceClient().rpc("get_creative_serving", {
      p_creative_id: creativeId,
    });
    if (error) return { status: "unavailable" };
    if (!data || data.length === 0) return { status: "missing" };
    ownerId = data[0].user_id;
    config = data[0].config_json;
    fields = Array.isArray(data[0].click_fields) ? data[0].click_fields : [];
  }

  const values = asJsonObject(config);
  for (const candidate of [field, TAG_CLICK_FIELD]) {
    const destination = values[candidate];
    if (fields.includes(candidate) && isHttpUrl(destination)) {
      return { status: "ok", ownerId, field: candidate, destination };
    }
  }
  return { status: "missing" };
}

async function redirect(request: Request, isHead: boolean): Promise<Response> {
  const url = new URL(request.url);
  const creativeId = url.searchParams.get("cid") ?? "";
  const field = url.searchParams.get("f") ?? "";
  if (!UUID_RE.test(creativeId) || !CLICK_FIELD_RE.test(field)) return notFound();

  let resolved: Resolved;
  try {
    resolved = await resolve(creativeId, field);
  } catch {
    resolved = { status: "unavailable" };
  }
  if (resolved.status === "unavailable") {
    console.error(`${LOG_PREFIX} could not read the creative`, { creativeId });
    return unavailable();
  }
  if (resolved.status === "missing") return notFound();

  // After the read, because the signature covers the creative's owner and only
  // the read knows who that is now. A forged, long-dead or other-owner link is
  // a 404 rather than a redirect: without this, `/r` would send anyone to the
  // URL any free account configured — including one that took over the id of
  // a deleted creative whose links it had collected.
  const token = checkClickToken(
    creativeId,
    resolved.ownerId,
    field,
    url.searchParams.get("exp"),
    url.searchParams.get("sig"),
  );
  if (token === "invalid") return notFound();

  // A stale link still redirects, but only a fresh one records — and never a
  // HEAD probe or a known crawler, which get the identical 302 without a click
  // id (lib/click-url.ts, isLikelyBot).
  const clickId =
    !isHead && token === "fresh" && !isLikelyBot(request.headers.get("user-agent"))
      ? mintClickId()
      : "";

  // Normalized through URL before anything is recorded. `Location` is a header,
  // and headers carry Latin-1 only: a destination with Cyrillic, CJK or an
  // emoji — or a `.рф` host — would make the Response constructor throw. `href`
  // is the ASCII serialization: punycode host, UTF-8 percent-encoded path and
  // query, and the same address a browser would have opened.
  const location = new URL(
    expandClickMacros(resolved.destination, {
      click_id: clickId,
      creative_id: creativeId,
      outcome: resolved.field,
    }),
  ).href;

  if (clickId) {
    // Two-letter country from the platform's geo header; the IP address is not
    // stored. Not awaited, for the reason `/t` gives: the viewer is waiting on
    // this redirect, and a network posts back seconds to days later, long after
    // the write has landed.
    //
    // Which means the id is already on its way to the network when the write
    // happens, so a write that did not land is logged: unlike `/t`'s counters,
    // this row is the only thing a conversion can attach to, and a postback for
    // an id with no row comes back `unknown_click`. Both outcomes are handled
    // because off Vercel `waitUntil` is a no-op and a rejection would surface
    // as unhandled in local dev — and supabase-js resolves, not rejects, on a
    // database error.
    const geo = request.headers.get("x-vercel-ip-country") ?? "";
    waitUntil(
      Promise.resolve(
        createServiceClient().rpc("record_click", {
          p_click_id: clickId,
          p_creative_id: creativeId,
          p_field: resolved.field,
          p_country: /^[A-Z]{2}$/.test(geo) ? geo : null,
          p_per_minute: CLICKS_PER_MINUTE,
        }),
      ).then(
        ({ data, error }) => {
          if (error) {
            console.error(`${LOG_PREFIX} click not recorded`, {
              creativeId,
              message: error.message,
            });
          } else if (data === false) {
            console.warn(`${LOG_PREFIX} click over the per-minute cap, not recorded`, {
              creativeId,
            });
          }
        },
        (err: unknown) => {
          console.error(`${LOG_PREFIX} click not recorded`, { creativeId, err });
        },
      ),
    );
  }

  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE, Location: location },
  });
}

export function GET(request: Request): Promise<Response> {
  return redirect(request, false);
}

/**
 * Link checkers and unfurlers probe with HEAD. Answer them with the same
 * redirect, minus the click: nobody left an ad.
 */
export function HEAD(request: Request): Promise<Response> {
  return redirect(request, true);
}
