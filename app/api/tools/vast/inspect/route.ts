import { getRequestOrigin } from "@/lib/site";
import { inspect, MAX_PASTED_BYTES } from "@/lib/vast-inspect";
import type { PixelMode } from "@/lib/vast-inspect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inspect a VAST tag or document.
 *
 * Public and unauthenticated by product decision: the validator is a free tool
 * and gating it would defeat the point. Two consequences are worth stating
 * where a reader will find them.
 *
 * First, this is the only route in the codebase that fetches a URL a stranger
 * chose. Every guard that makes that safe lives in lib/vast-inspect/fetch-tag.ts
 * — scheme, address class, redirect count, deadline, byte cap — and is enforced
 * at connect time rather than as a pre-flight check. See docs/security.md.
 *
 * Second, there is no rate limit here, which is a known and deliberate gap
 * rather than an oversight. Nothing is persisted, so the exposure is compute
 * and egress rather than data.
 *
 * Body: { mode: "url" | "xml", value: string, pixelMode?: "dryRun" | "live" }
 */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    value?: unknown;
    pixelMode?: unknown;
  } | null;

  const mode = body?.mode === "url" || body?.mode === "xml" ? body.mode : null;
  const value = typeof body?.value === "string" ? body.value : "";
  // Anything but an explicit "live" is dry-run. A typo in this field must fail
  // towards not firing a stranger's pixels, never towards firing them.
  const pixelMode: PixelMode = body?.pixelMode === "live" ? "live" : "dryRun";

  if (!mode) {
    return Response.json({ error: "mode must be \"url\" or \"xml\"" }, { status: 400 });
  }
  if (!value.trim()) {
    return Response.json({ error: "value is required" }, { status: 400 });
  }

  if (mode === "xml" && Buffer.byteLength(value, "utf8") > MAX_PASTED_BYTES) {
    return Response.json({ error: "document too large" }, { status: 413 });
  }
  if (mode === "url") {
    // Reject an unparseable URL before any work is scheduled. The address-class
    // checks are not repeated here on purpose: they belong to the fetcher, which
    // has to re-run them per redirect anyway, and a second copy would drift.
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return Response.json({ error: "only http and https URLs are supported" }, { status: 400 });
      }
    } catch {
      return Response.json({ error: "value is not a valid absolute URL" }, { status: 400 });
    }
  }

  try {
    const report = await inspect({
      mode,
      value,
      pixelMode,
      origin: getRequestOrigin(request),
    });
    return Response.json(report, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (cause) {
    // A crash in the engine is our defect, not the user's tag being invalid;
    // saying so plainly is better than dressing it up as a validation result.
    //
    // Logged, because the platform records an uncaught throw and nothing at all
    // for a caught one: swallowing it silently would turn a rule crashing on a
    // whole class of real tags into an unexplained trickle of 500s with no
    // stack and no input shape. The caller still gets nothing but the status.
    console.error("[tools/vast/inspect] engine failure", { mode, cause });
    return Response.json({ error: "inspection failed" }, { status: 500 });
  }
}
