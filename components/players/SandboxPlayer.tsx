"use client";

import { useEffect, useRef } from "react";
import type { PreviewPlayerProps } from "./types";
import { subscribeToCreativeTelemetry, toPlayerEvent } from "./telemetry";
import { useDict } from "@/components/i18n/LocaleProvider";

type Vpaid = {
  subscribe: (cb: (...a: unknown[]) => void, event: string) => void;
  initAd: (
    w: number,
    h: number,
    viewMode: string,
    bitrate: number,
    creativeData: { AdParameters: string },
    env: { slot: HTMLElement; videoSlot: HTMLVideoElement },
  ) => void;
  startAd: () => void;
  stopAd?: () => void;
};

/**
 * Our own in-house VPAID host (forked from the original components/VpaidPreview.tsx,
 * kept separate since that one is a different trust surface — the public,
 * sample-config-only /preview page). Pointed at the real signed unit URL and
 * the config the user just typed, from the mint response — no sample data.
 * PreviewPanel only mounts this after "Launch Ad" is clicked and remounts it
 * (new key) on every Launch/Restart, so mounting here doubles as launching.
 */
export function SandboxPlayer({
  mint,
  onStatus,
  onClickThrough,
  onEvent,
}: PreviewPlayerProps) {
  const dict = useDict();
  const slotRef = useRef<HTMLDivElement>(null);

  // Same reason ValidatorStage keeps one: the effect below deliberately runs
  // once per mount, so reading `onEvent` from the closure would pin whichever
  // identity the first render happened to produce.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    slot.innerHTML = "";

    // This harness is a VPAID host: it loads the unit as a <script> and calls
    // getVPAIDAd(). A SIMID creative is an HTML document meant for a sandboxed
    // iframe over postMessage, so loading it here yields no factory and used to
    // surface as a misleading "could not load" error. Say what's actually true.
    if (mint.sandbox.format !== "vpaid") {
      onStatus(dict.preview.sandboxVpaidOnly);
      return;
    }

    // Below the format check so the early return above cannot leave a listener
    // behind, and above the <script> append so nothing is listening too late:
    // the unit loads into this very document, so AdLoaded is posted during the
    // same task that runs the script.
    const unsubscribe = subscribeToCreativeTelemetry((record) => {
      onEventRef.current?.(toPlayerEvent(record));
    });

    onStatus(dict.preview.loadingUnit);

    // The videoSlot is what a real player would show for the base video, so it
    // has to be visible whenever the creative actually has one — hiding it
    // unconditionally rendered every video-backed template (Shoppable Video) as
    // a blank well with only its overlay drawn. Image-only templates have no
    // videoUrl and draw straight into the slot, so theirs stays hidden.
    const hasVideo = typeof mint.sandbox.adParameters.videoUrl === "string";
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = hasVideo
      ? "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:var(--color-well-screen);"
      : "display:none;";
    slot.appendChild(video);

    let ad: Vpaid | null = null;
    const script = document.createElement("script");
    script.src = mint.sandbox.scriptUrl;
    script.onload = () => {
      const factory = (window as unknown as { getVPAIDAd?: () => Vpaid }).getVPAIDAd;
      if (typeof factory !== "function") {
        onStatus(dict.preview.unitLoadFailed);
        return;
      }
      try {
        ad = factory();
        ad.subscribe((...a) => {
          onClickThrough(String(a[0] || "(click-through)"));
        }, "AdClickThru");
        ad.subscribe(() => onStatus(dict.preview.playing), "AdStarted");
        ad.subscribe(() => onStatus(dict.preview.complete), "AdVideoComplete");
        ad.initAd(
          slot.clientWidth || 640,
          slot.clientHeight || 360,
          "normal",
          600,
          { AdParameters: JSON.stringify(mint.sandbox.adParameters) },
          { slot, videoSlot: video },
        );
        ad.startAd();
      } catch {
        onStatus(dict.preview.unitStartFailed);
      }
    };
    script.onerror = () => onStatus(dict.preview.unitLoadFailed);
    document.body.appendChild(script);

    return () => {
      unsubscribe();
      try {
        ad?.stopAd?.();
      } catch {
        /* noop */
      }
      script.remove();
      slot.innerHTML = "";
    };
    // Runs once per mount; PreviewPanel remounts this component (new key) for
    // every Launch/Restart rather than re-running this effect in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={slotRef} className="absolute inset-0" />;
}
