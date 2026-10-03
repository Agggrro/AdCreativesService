import { handleTrack } from "@/lib/serving/http/track";
import { nextPlatform } from "@/lib/serving/http/next";

// The tracking beacon. Public, fire-and-forget, always 204. The logic is
// lib/serving/http/track.ts, shared with the ad Worker (ADR-0029), which answers
// `/t` on the ad domain; this route serves `npm run dev` and the legacy
// `/api/track`. Node runtime for the service-role write.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Response {
  return handleTrack(request, nextPlatform);
}
