import type { PlayerEvent } from "./types";

/**
 * Receiver for the creative telemetry channel (ADR-0019).
 *
 * The VPAID runtime posts one record per lifecycle event, plus whatever a
 * template declares through `api.debug()`, to the origin it was served from.
 * That is what makes the inside of a creative legible while it is running
 * inside a player's own iframe — including a cross-origin one, where nothing
 * else about the ad is reachable from this side.
 */

/** One record as the runtime posts it. Mirrors `_report` in runtime/lib/vpaid-base.js. */
export interface CreativeTelemetryRecord {
  __creosmith: 1;
  v: number;
  /**
   * Per-run id. Only one unit is ever live on a page — `getVPAIDAd` is a global
   * — but a host that remounts to re-run still has the previous unit's teardown
   * record in flight when the next one starts, so records are attributed rather
   * than assumed.
   */
  runId: string;
  /** Per-run counter, used to de-duplicate the parent/top double-post. */
  seq: number;
  /** `TEMPLATE.name` from the render module, when it declares one. */
  template: string | null;
  /** A VPAID event name ("AdStarted"), or a template's own, prefixed `tpl:`. */
  name: string;
  /** Milliseconds since the unit was constructed. */
  at: number;
  data: unknown;
}

declare global {
  interface Window {
    /**
     * Every record this page has received, newest last. Exists purely so a
     * developer — or an automated browser session driving the page — can read
     * the run back with one expression instead of watching a UI scroll past.
     */
    __creosmith?: CreativeTelemetryRecord[];
  }
}

/** Beyond this the buffer starts dropping its oldest entries. */
const MAX_BUFFERED = 500;

function isRecord(value: unknown): value is CreativeTelemetryRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CreativeTelemetryRecord>;
  return (
    candidate.__creosmith === 1 &&
    typeof candidate.runId === "string" &&
    typeof candidate.seq === "number" &&
    typeof candidate.name === "string" &&
    typeof candidate.at === "number"
  );
}

/**
 * Lifecycle names that mean something happened worth colouring. Anything not
 * listed is informational, which is the right default: this vocabulary comes
 * from the creative, and an unrecognised name is a new event rather than a
 * problem. The cold half of the state vocabulary only
 * (docs/design-system.md §3) — the warm accent never means alarm.
 */
const TONES: Record<string, PlayerEvent["tone"]> = {
  AdStarted: "live",
  AdImpression: "live",
  AdVideoStart: "live",
  AdSkipped: "warn",
  AdError: "dead",
};

/** Render a record's payload as the one-line machine detail `PlayerEvent` wants. */
function describe(record: CreativeTelemetryRecord): string | undefined {
  const { data } = record;
  if (data === null || data === undefined) return undefined;
  if (typeof data !== "object") return String(data);
  // `{args: [...]}` is how the runtime forwards a VPAID event's own arguments;
  // AdClickThru's first argument is the destination, which is the only one
  // anyone reads.
  const args = (data as { args?: unknown[] }).args;
  if (Array.isArray(args)) {
    return args.filter((a) => a !== "" && a != null).map(String).join(" · ") || undefined;
  }
  return Object.entries(data as Record<string, unknown>)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

/** A received record in the shape the existing timeline UI already renders. */
export function toPlayerEvent(record: CreativeTelemetryRecord): PlayerEvent {
  return {
    at: record.at,
    source: "player",
    name: record.name,
    detail: describe(record),
    tone: TONES[record.name] ?? "info",
  };
}

/**
 * Start listening for creative telemetry on this page. Returns the unsubscribe.
 *
 * The origin check is not redundant with the sender's `targetOrigin`. That one
 * stops our records reaching a page that should not have them; this one stops
 * *someone else's* messages being mistaken for ours. Both directions have to be
 * closed, and `message` is a shared bus — SIMID, OMID, MRAID and every ad SDK
 * on the page post to the same listener set.
 */
export function subscribeToCreativeTelemetry(
  onRecord: (record: CreativeTelemetryRecord) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const seen = new Set<string>();

  const handler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (!isRecord(event.data)) return;

    // The runtime posts to `parent` and `top` both, so a unit two frames deep
    // delivers each record twice. Identity is the run plus its counter.
    const key = `${event.data.runId}:${event.data.seq}`;
    if (seen.has(key)) return;
    seen.add(key);

    const buffer = (window.__creosmith ??= []);
    buffer.push(event.data);
    if (buffer.length > MAX_BUFFERED) buffer.splice(0, buffer.length - MAX_BUFFERED);

    onRecord(event.data);
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
