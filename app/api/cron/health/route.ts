import { checkSnapshotHealth, describeSnapshotHealth } from "@/lib/serving/health";
import { createServiceClient } from "@/lib/supabase/service";

// Triggered by the Vercel cron in vercel.json. Node runtime for the service-role
// read; never cached, since the whole point is the state right now.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily audit that the CDN snapshots still agree with the database (ADR-0015).
 *
 * Reports by **failing**: a drift returns 503 and logs a line with a stable
 * prefix. Vercel's built-in alerts only fire on error and usage anomalies, so a
 * 200 with `{"healthy": false}` would be invisible — the status code is the only
 * signal the platform actually watches. `npm run check:snapshots` runs the same
 * check from a terminal when you want to look on purpose.
 */
const LOG_PREFIX = "[snapshot-health]";

/**
 * Hourly buckets stay hourly for this long, then collapse to one per day.
 * Intraday pacing is worth reading for about a month; after that the shape of
 * a day is all anyone looks at, and hourly rows cost 24x the storage to keep it.
 */
const ROLLUP_AFTER_DAYS = 30;

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  // Fail closed rather than run unauthenticated: the response body names
  // creative and user ids, so an open endpoint would leak the tenant list.
  if (!secret) {
    console.error(
      `${LOG_PREFIX} CRON_SECRET is not set — refusing to run. ` +
        "Set it in the project's environment variables; Vercel sends it as a " +
        "Bearer token on scheduled invocations.",
    );
    return new Response("CRON_SECRET not configured", { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return unauthorized();
  }

  // Housekeeping first, so a drift 503 below cannot skip it: hourly buckets
  // older than the window collapse into one per day, which is what stops the
  // counter table growing 24x faster than it needs to (ADR-0016). Failure here
  // is logged but must not mask the health verdict — an unrolled bucket is a
  // storage cost, a stale snapshot is a wrong ad.
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("rollup_creative_events", {
      p_older_than_days: ROLLUP_AFTER_DAYS,
    });
    if (error) throw new Error(error.message);
    if (data) console.log(`${LOG_PREFIX} rolled up ${data} day-bucket(s)`);
  } catch (err) {
    console.error(`${LOG_PREFIX} counter rollup failed`, err);
  }

  try {
    const health = await checkSnapshotHealth();
    const summary = describeSnapshotHealth(health);

    if (!health.healthy) {
      console.error(`${LOG_PREFIX} DRIFT — ${summary}`, {
        missingCreatives: health.creatives.missing,
        missingEntitlements: health.entitlements.missing,
      });
      return Response.json(health, { status: 503 });
    }

    console.log(`${LOG_PREFIX} ok — ${summary}`);
    return Response.json(health, { status: 200 });
  } catch (err) {
    console.error(`${LOG_PREFIX} check itself failed`, err);
    return new Response("Health check failed", { status: 503 });
  }
}
