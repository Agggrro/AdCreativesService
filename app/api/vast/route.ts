import { handleVast, handleVastPreflight } from "@/lib/serving/http/vast";
import { nextPlatform } from "@/lib/serving/http/next";

// The VAST tag. Public and unauthenticated. The logic is
// lib/serving/http/vast.ts, shared with the ad Worker (ADR-0029): on the ad
// domain workers/ads answers `/v`, and this route serves `npm run dev` and the
// legacy `/api/vast` that tags pasted before ADR-0018 still point at.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preflight. A plain VAST fetch is a simple request and never triggers this,
 * but players that add a header (or use `fetch` with custom options) do.
 */
export function OPTIONS(request: Request): Response {
  return handleVastPreflight(request);
}

export function GET(request: Request): Promise<Response> {
  return handleVast(request, nextPlatform);
}
