import type { PlayerEvent } from "@/components/players/types";
import type { Playback } from "@/lib/vast-inspect/model";

/**
 * The wire between the validator page and the player frame it hosts.
 *
 * The player runs on a different origin (see `getSandboxUrl`), so nothing can be
 * passed by reference and every message crosses a real trust boundary. Two rules
 * hold on both sides and neither is negotiable:
 *
 * 1. **`targetOrigin` is never `*` once the peer is known.** The single exception
 *    is the frame's opening `ready` ping, which carries no data at all and exists
 *    only because the frame cannot know its parent's origin before being told.
 * 2. **Every received message is checked against the expected origin *and* the
 *    expected `source` window.** Origin alone is not enough: any frame on a
 *    trusted origin could post, and on the parent side the page has other frames
 *    (IMA's own) that must not be able to inject timeline rows.
 *
 * This mirrors the discipline of the creative telemetry channel (ADR-0019),
 * which exists for the same reason at the next boundary in.
 */

/** Marker so a stray message from any other library is ignored cheaply. */
export const SANDBOX_CHANNEL = "creosmith-validator-sandbox";

/** The frame is mounted and listening. Carries nothing; sent before the peer is known. */
export interface SandboxReady {
  channel: typeof SANDBOX_CHANNEL;
  type: "ready";
}

/**
 * Everything the frame needs for one run.
 *
 * `playback` is nullable because the page starts the frame inside the click and
 * the inspection has not returned yet — the frame sets IMA up and waits. A
 * second `init` with a document follows.
 */
export interface SandboxInit {
  channel: typeof SANDBOX_CHANNEL;
  type: "init";
  playback: Playback | null;
  /** Content clip the ad break interrupts, as an absolute URL on the app origin. */
  contentSrc?: string;
  /** So IMA's own chrome is not in a different language from the page. */
  locale: string;
}

/** One timeline row. */
export interface SandboxEvent {
  channel: typeof SANDBOX_CHANNEL;
  type: "event";
  event: PlayerEvent;
}

/** What the SDK says the tag actually resolved to, for the parser cross-check. */
export interface SandboxResolved {
  channel: typeof SANDBOX_CHANNEL;
  type: "resolved";
  ad: ResolvedAd;
}

export type SandboxMessage = SandboxReady | SandboxInit | SandboxEvent | SandboxResolved;

/** What the SDK says the tag actually resolved to. */
export interface ResolvedAd {
  adId: string;
  adSystem: string;
  title: string;
  duration: number;
  width: number;
  height: number;
  contentType: string;
  apiFramework: string | null;
  universalAdIdRegistry: string;
  universalAdIdValue: string;
  wrapperAdSystems: string[];
  skipTimeOffset: number;
  linear: boolean;
  mediaUrl: string;
}

/**
 * A structurally valid message on our channel.
 *
 * Deliberately shallow: this says the shape is ours, not that the contents are
 * safe. Both sides treat the payload as data and neither renders it as markup.
 */
export function isSandboxMessage(data: unknown): data is SandboxMessage {
  if (typeof data !== "object" || data === null) return false;
  const message = data as { channel?: unknown; type?: unknown };
  if (message.channel !== SANDBOX_CHANNEL) return false;
  return (
    message.type === "ready" ||
    message.type === "init" ||
    message.type === "event" ||
    message.type === "resolved"
  );
}

/**
 * The timeline name for "the SDK never arrived".
 *
 * Exported because the page reads it back off the event stream to raise its own
 * notice: an ad blocker is the one stage failure with a fix the visitor can
 * apply, and a machine name in a timeline is not where you explain that.
 */
export const SDK_LOAD_FAILED = "sdkLoadFailed";
