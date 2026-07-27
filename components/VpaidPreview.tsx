"use client";

import { useEffect, useRef, useState } from "react";
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
 * Counts live hosts on the page. A VPAID unit publishes itself as the global
 * `window.getVPAIDAd`, so a second host silently takes over the first one's
 * factory — the failure looks like "the wrong mechanic rendered", which is very
 * hard to read backwards. One well per page is a design rule for this reason
 * (docs/design-system.md §7); this is the runtime tripwire behind it.
 */
let mountedHosts = 0;

/**
 * Minimal in-browser VPAID host: loads a built unit and runs it in a slot so the
 * interactive mechanic can be tried by hand with sample config.
 */
export function VpaidPreview({
  templateKey,
  config,
  caption,
}: {
  templateKey: string;
  config: Record<string, unknown>;
  /** The well's one caption slot; the click-through readout replaces it (§7). */
  caption: string;
}) {
  const dict = useDict();
  const slotRef = useRef<HTMLDivElement>(null);
  const [clicked, setClicked] = useState<string | null>(null);

  // Depend on the config's *content*, not its object identity: a parent
  // re-render (a locale switch, a client-side navigation) would otherwise
  // restart the unit in the middle of someone's interaction.
  const configKey = JSON.stringify(config);

  useEffect(() => {
    mountedHosts += 1;
    if (process.env.NODE_ENV !== "production" && mountedHosts > 1) {
      console.warn(
        `VpaidPreview: ${mountedHosts} hosts mounted at once. VPAID units share the window.getVPAIDAd global, so only the last one loaded will render.`,
      );
    }
    return () => {
      mountedHosts -= 1;
    };
  }, []);

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
    // `configKey` is the content hash of `config`. Depending on the object
    // itself would restart the unit on every parent render, mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, configKey]);

  return (
    <div className="mx-auto w-full max-w-[664px] rounded-ctl bg-well p-3">
      <div
        ref={slotRef}
        className="relative w-full overflow-hidden rounded-ctl bg-well-screen"
        style={{ aspectRatio: "16 / 9" }}
      />
      {/* One caption slot: the placeholder disclosure until a click-through
          fires, the readout after (docs/design-system.md §7). */}
      <p className="pt-3 text-center text-xs leading-4 text-well-fg">
        {clicked ? (
          <>
            <span className="text-well-live">{dict.preview.clickThrough}</span> →{" "}
            <span className="data-instr break-all">{clicked}</span>
          </>
        ) : (
          caption
        )}
      </p>
    </div>
  );
}
