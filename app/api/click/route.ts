import { handleClick } from "@/lib/serving/http/click";
import { nextPlatform } from "@/lib/serving/http/next";

// The click redirect behind every destination in a served tag (ADR-0023). The
// logic is lib/serving/http/click.ts, shared with the ad Worker (ADR-0029),
// which answers `/r` on the ad domain; this route serves `npm run dev` and the
// legacy `/api/click`. Node runtime for `node:crypto` and the service-role write.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleClick(request, nextPlatform);
}

/**
 * Link checkers and unfurlers probe with HEAD. Answer them with the same
 * redirect, minus the click: nobody left an ad.
 */
export function HEAD(request: Request): Promise<Response> {
  return handleClick(request, nextPlatform);
}
