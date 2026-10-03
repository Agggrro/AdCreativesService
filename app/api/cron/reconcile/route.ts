import { hasCronBearer } from "@/lib/cron-auth";
import { reconcileRecentSnapshots } from "@/lib/serving/reconcile";

// Republishes recently changed snapshots that no longer match Postgres
// (lib/serving/reconcile.ts, ADR-0029). Called by the web Worker's cron every
// ten minutes. Never cached: the point is the state right now.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[snapshot-reconcile]";

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  // Fail closed, as /api/cron/health does: the response names creative and
  // user ids, so an open endpoint would leak the tenant list.
  if (!secret) {
    console.error(`${LOG_PREFIX} CRON_SECRET is not set — refusing to run.`);
    return new Response("CRON_SECRET not configured", { status: 503 });
  }
  if (!hasCronBearer(request, secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await reconcileRecentSnapshots();
    const repaired = result.republished.users.length + result.republished.creatives.length;
    const failed = result.failed.users.length + result.failed.creatives.length;
    if (repaired > 0) {
      // A repair means a writer's publish did not land — worth a line every time.
      console.warn(`${LOG_PREFIX} republished drifted snapshots`, result.republished);
    }
    if (failed > 0) {
      console.error(`${LOG_PREFIX} could not republish`, result.failed);
      return Response.json(result, { status: 503 });
    }
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error(`${LOG_PREFIX} run failed`, err);
    return new Response("Reconcile failed", { status: 503 });
  }
}
