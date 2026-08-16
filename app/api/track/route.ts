import { waitUntil } from "@vercel/functions";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyTrackToken } from "@/lib/track-token";
import type { CreativeEventType } from "@/types/database.types";
import { UUID_RE } from "@/lib/uuid";

// Public tracking beacon hit by the player for VAST events. Fire-and-forget:
// always 204, never blocks or leaks. Node runtime for the service-role insert.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Map VAST/runtime event names to the creative_event_type enum.
//
// Only names something actually fires a beacon for are accepted — not every
// value the enum carries. Accepting a name we never emit would only let a third
// party write event types we cannot produce, into numbers a customer reads.
//
// ADR-0016 cut this to three. `start` and the quartiles are gone: the player
// fired one beacon each, seven per impression, for numbers the buyer's own DSP
// already reports. What is left is what only we can report:
//   * `impression` — the one number that must reconcile with the DSP.
//   * `viewable`   — self-reported, VPAID-only (ADR-0012); fired by the unit's
//                    own IntersectionObserver, not by the host player.
//   * `click`      — fired via VAST <ClickTracking> when the player handles the
//                    unit's AdClickThru, which the runtime raises **only** from
//                    the final call-to-action that opens the advertiser's URL.
//                    An intermediate interaction (a quiz answer, a slider drag)
//                    never reaches it. `interaction` stays unmapped for the same
//                    reason it always was: nothing emits it.
const EVENT_MAP: Record<string, CreativeEventType> = {
  impression: "impression",
  viewable: "viewable",
  click: "click",
};

const NO_CONTENT = new Response(null, {
  status: 204,
  headers: { "Cache-Control": "no-store" },
});

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const cid = url.searchParams.get("cid");
    const eventName = url.searchParams.get("e") ?? "";
    const eventType = EVENT_MAP[eventName];

    // Every beacon the VAST builder emits is signed (lib/track-token.ts) — a
    // hit with no valid signature is either forged or stale, and is dropped
    // the same way an unentitled creative_id is dropped: silently, no error
    // surfaced to the caller (this endpoint is fire-and-forget by contract).
    if (
      cid &&
      UUID_RE.test(cid) &&
      eventType &&
      verifyTrackToken(cid, eventName, url.searchParams.get("exp"), url.searchParams.get("sig"))
    ) {
      const supabase = createServiceClient();
      // Not awaited: the player is blocked on this 204, and a single impression
      // fires up to seven beacons, each of which used to hold the response open
      // for a round trip to Postgres. `waitUntil` keeps the function alive for
      // the insert without making the beacon wait for it.
      //
      // Ignore FK/insert errors (unknown creative, etc.) — beacon is
      // best-effort, as before. The `.catch` is load-bearing rather than
      // decorative: off Vercel `waitUntil` is a no-op, so the promise is
      // orphaned and an unhandled rejection would surface in local dev.
      // One upsert into the (creative, event, hour) counter instead of a row per
      // beacon (ADR-0016). Done in SQL rather than read-then-write in app code,
      // because concurrent beacons for the same creative are the normal case on
      // this path and a lost update would silently undercount.
      //
      // `Promise.resolve` because the query builder is a PromiseLike, not a
      // Promise: it has no `.catch`, and both settle paths have to be handled
      // here for the reason above.
      waitUntil(
        Promise.resolve(
          supabase.rpc("increment_creative_event", {
            p_creative_id: cid,
            p_event_type: eventType,
          }),
        ).then(
          () => undefined,
          () => undefined,
        ),
      );
    }
  } catch {
    // never surface tracking errors to the player
  }
  return NO_CONTENT;
}
