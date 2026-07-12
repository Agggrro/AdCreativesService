"use client";

import { useEffect, useRef } from "react";
import type { PreviewPlayerProps } from "./types";

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
export function SandboxPlayer({ mint, onStatus, onClickThrough }: PreviewPlayerProps) {
  const slotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    slot.innerHTML = "";
    onStatus("Loading interactive unit…");

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.style.display = "none";
    slot.appendChild(video);

    let ad: Vpaid | null = null;
    const script = document.createElement("script");
    script.src = mint.sandbox.scriptUrl;
    script.onload = () => {
      const factory = (window as unknown as { getVPAIDAd?: () => Vpaid }).getVPAIDAd;
      if (typeof factory !== "function") {
        onStatus("Could not load the interactive unit.");
        return;
      }
      try {
        ad = factory();
        ad.subscribe((...a) => {
          onClickThrough(String(a[0] || "(click-through)"));
        }, "AdClickThru");
        ad.subscribe(() => onStatus("Playing"), "AdStarted");
        ad.subscribe(() => onStatus("Complete"), "AdVideoComplete");
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
        onStatus("The interactive unit failed to start.");
      }
    };
    script.onerror = () => onStatus("Could not load the interactive unit.");
    document.body.appendChild(script);

    return () => {
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
