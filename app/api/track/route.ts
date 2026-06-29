import { createServiceClient } from "@/lib/supabase/service";
import type { CreativeEventType } from "@/types/database.types";

// Public tracking beacon hit by the player for VAST events. Fire-and-forget:
// always 204, never blocks or leaks. Node runtime for the service-role insert.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map VAST event names (and our own) to the creative_event_type enum.
const EVENT_MAP: Record<string, CreativeEventType> = {
  impression: "impression",
  start: "start",
  firstQuartile: "q25",
  midpoint: "q50",
  thirdQuartile: "q75",
  complete: "complete",
  interaction: "interaction",
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

    if (cid && UUID_RE.test(cid) && eventType) {
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
