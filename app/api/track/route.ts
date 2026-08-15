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
// value the enum carries. `interaction` and `click` stay unmapped (there is
// no <ClickTracking> element yet); accepting them would only let a third
// party write event types we cannot produce, and those rows feed a
// customer-facing dashboard. Add a name back when a beacon starts firing it,
// not before. `viewable` is the first entry here fired by the creative's own
// JS (runtime/lib/vpaid-base.js's IntersectionObserver, ADR-0012) rather than
// by the host player hitting a VAST <TrackingEvents> URL — VPAID-only; SIMID
// never sends it.
const EVENT_MAP: Record<string, CreativeEventType> = {
  impression: "impression",
  start: "start",
  firstQuartile: "q25",
  midpoint: "q50",
  thirdQuartile: "q75",
  complete: "complete",
  viewable: "viewable",
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
      // Ignore FK/insert errors (unknown creative, etc.) — beacon is best-effort.
      await supabase
        .from("creative_events")
        .insert({ creative_id: cid, event_type: eventType });
    }
  } catch {
    // never surface tracking errors to the player
  }
  return NO_CONTENT;
}
