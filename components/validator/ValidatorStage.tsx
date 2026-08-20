"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerEvent } from "@/components/players/types";
import type { Playback } from "@/lib/vast-inspect/model";
import { getSandboxUrl } from "@/lib/site";
import { useDict } from "@/components/i18n/LocaleProvider";
import {
  isSandboxMessage,
  SANDBOX_CHANNEL,
  type ResolvedAd,
} from "@/components/validator/sandbox-protocol";

export { SDK_LOAD_FAILED } from "@/components/validator/sandbox-protocol";
export type { ResolvedAd } from "@/components/validator/sandbox-protocol";

/**
 * The validator's player, as the app page sees it.
 *
 * There is no SDK here and no ad code here. This mounts an iframe on a
 * **different origin** and speaks to it, because the thing on the other side
 * executes a stranger's VPAID JavaScript with whatever privileges its document
 * has — and on the app origin those privileges are the visitor's session, our
 * API routes, and `localStorage`. `getSandboxUrl()` decides where that frame
 * lives; `app/c/player/page.tsx` is what it loads.
 *
 * **It fails closed.** With no cross-origin home configured, `sandboxOrigin` is
 * null and this renders a refusal rather than quietly running the creative in
 * the app's own page. A security control whose absence looks like success is
 * worse than not having it.
 *
 * The iframe carries `allow="autoplay"` deliberately: transient user activation
 * does not cross into a cross-origin frame, so the click that started the run
 * has to be delegated explicitly or the ad cannot start itself.
 */

interface ValidatorStageProps {
  /** `null` until the inspection returns; the frame sets IMA up and waits. */
  playback: Playback | null;
  /** Content clip the ad break interrupts. Resolved to an absolute URL before it crosses. */
  contentSrc?: string;
  onEvent: (event: PlayerEvent) => void;
  /** Metadata IMA resolved, for the parser-versus-player cross-check. */
  onAdResolved: (ad: ResolvedAd) => void;
  /** Bumping this remounts the component, which is how a re-run starts clean. */
  runToken: number;
  /** Raised when no isolated origin exists, so the page can say why nothing plays. */
  onUnavailable?: () => void;
}

export function ValidatorStage({
  playback,
  contentSrc,
  onEvent,
  onAdResolved,
  runToken,
  onUnavailable,
}: ValidatorStageProps) {
  // The frame’s accessible name is a user-visible string, so it comes from the
  // dictionary like every other one (§10).
  const dict = useDict();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const playbackRef = useRef(playback);

  // Held in refs so the effect below stays a mount-once effect: re-running it
  // because a callback identity changed would reload the frame mid-play.
  const onEventRef = useRef(onEvent);
  const onAdResolvedRef = useRef(onAdResolved);
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onEventRef.current = onEvent;
    onAdResolvedRef.current = onAdResolved;
    onUnavailableRef.current = onUnavailable;
    playbackRef.current = playback;
  });

  // Resolved on the client from the origin the page is actually on, not from the
  // env var: under `dev:https` those disagree, and the wrong one either disables
  // the sandbox or points it at a scheme the browser will not frame.
  // Read during render rather than from an effect: this component only ever
  // mounts after a click, so it is never server-rendered and there is no
  // hydration pass for the two answers to disagree across.
  const [sandboxOrigin] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getSandboxUrl(window.location.origin),
  );
  useEffect(() => {
    if (!sandboxOrigin) onUnavailableRef.current?.();
  }, [sandboxOrigin]);

  useEffect(() => {
    if (!sandboxOrigin) return;

    /** Everything the frame needs, sent whenever we have something new to say. */
    const send = () => {
      const frame = frameRef.current?.contentWindow;
      if (!frame || !readyRef.current) return;
      frame.postMessage(
        {
          channel: SANDBOX_CHANNEL,
          type: "init",
          playback: playbackRef.current,
          // Absolute: the frame is on another origin, so a root-relative path
          // there would resolve against the sandbox host, which does not serve it.
          contentSrc: contentSrc ? new URL(contentSrc, window.location.origin).href : undefined,
          locale: document.documentElement.lang || "en",
        },
        sandboxOrigin,
      );
    };

    const onMessage = (event: MessageEvent) => {
      // Origin, then window. Origin alone is not enough — the page hosts other
      // frames, and a timeline whose rows anyone can inject is not a record.
      if (event.origin !== sandboxOrigin) return;
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isSandboxMessage(event.data)) return;

      const message = event.data;
      if (message.type === "ready") {
        readyRef.current = true;
        send();
        return;
      }
      if (message.type === "event") {
        onEventRef.current(message.event);
        return;
      }
      if (message.type === "resolved") {
        onAdResolvedRef.current(message.ad);
      }
    };

    window.addEventListener("message", onMessage);
    // The frame may already have announced itself before this listener existed
    // — on a warm cache that race is real — so speak once unprompted too.
    send();
    return () => window.removeEventListener("message", onMessage);
    // `playback` is read through a ref; the effect below pushes it when it lands.
  }, [sandboxOrigin, contentSrc]);

  // The document half of the handshake: whenever the inspection lands, tell the
  // frame. Harmless before `ready` — `send()` is a no-op then, and the `ready`
  // handler sends the current value.
  useEffect(() => {
    const frame = frameRef.current?.contentWindow;
    if (!sandboxOrigin || !frame || !readyRef.current || !playback) return;
    frame.postMessage(
      {
        channel: SANDBOX_CHANNEL,
        type: "init",
        playback,
        contentSrc: contentSrc ? new URL(contentSrc, window.location.origin).href : undefined,
        locale: document.documentElement.lang || "en",
      },
      sandboxOrigin,
    );
  }, [playback, sandboxOrigin, contentSrc]);

  if (!sandboxOrigin) return null;

  return (
    <iframe
      ref={frameRef}
      // Cache-busted per run so a re-run gets a genuinely fresh document rather
      // than a frame holding a dead AdsManager — the remount `runToken` gives
      // this component is only worth having if the frame honours it too.
      src={`${sandboxOrigin}/c/player?r=${runToken}`}
      title={dict.tools.playerFrame}
      // Autoplay is delegated across the origin boundary; user activation is not
      // inherited by a cross-origin frame.
      allow="autoplay; fullscreen"
      className="aspect-video w-full rounded-ctl border-0 bg-well-screen"
    />
  );
}
