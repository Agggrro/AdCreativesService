"use client";

import { useEffect, useRef, useState } from "react";

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
 * Minimal in-browser VPAID host: loads a built unit and runs it in a slot so the
 * interactive mechanic can be tried by hand with sample config.
 */
export function VpaidPreview({
  templateKey,
  config,
}: {
  templateKey: string;
  config: Record<string, unknown>;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [clicked, setClicked] = useState<string | null>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    slot.innerHTML = "";
    setClicked(null);

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.style.display = "none";
    slot.appendChild(video);

    let ad: Vpaid | null = null;
    const script = document.createElement("script");
    script.src = `/api/preview-unit/${templateKey}?t=${Date.now()}`;
    script.onload = () => {
      const factory = (window as unknown as { getVPAIDAd?: () => Vpaid })
        .getVPAIDAd;
      if (typeof factory !== "function") return;
      try {
        ad = factory();
        ad.subscribe((...a) => {
          setClicked(String(a[0] || "(click-through)"));
        }, "AdClickThru");
        ad.initAd(
          slot.clientWidth || 640,
          360,
          "normal",
          600,
          { AdParameters: JSON.stringify(config) },
          { slot, videoSlot: video },
        );
        ad.startAd();
      } catch {
        /* ignore preview errors */
      }
    };
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
  }, [templateKey, config]);

  return (
    <div className="space-y-3">
      <div
        ref={slotRef}
        className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio: "16 / 9" }}
      />
      <p className="text-center text-sm text-gray-500">
        {clicked ? (
          <>
            Click-through fired → <code className="text-gray-700">{clicked}</code>
          </>
        ) : (
          "Interact with the ad above — the click-through URL shows here."
        )}
      </p>
    </div>
  );
}
