"use client";

import { useEffect, useRef } from "react";
import type { PreviewPlayerProps } from "./types";
import { loadImaSdk } from "./load-ima-sdk";

/**
 * Google IMA SDK — the industry-standard VAST/VPAID SDK, requesting the exact
 * same previewTagUrl the Sandbox tab and Video.js tab use. vpaidMode is set to
 * INSECURE because our units draw directly into the DOM slot rather than
 * running sandboxed (ADR-0003: access control, not code hiding).
 */
export function ImaPlayer({ mint, onStatus, onClickThrough }: PreviewPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let cancelled = false;
    let adsLoader: google.ima.AdsLoader | undefined;
    let adsManager: google.ima.AdsManager | undefined;

    const clickThroughUrl =
      typeof mint.sandbox.adParameters.clickThroughUrl === "string"
        ? mint.sandbox.adParameters.clickThroughUrl
        : "(click-through)";

    onStatus("Loading Google IMA SDK…");

    loadImaSdk()
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        google.ima.settings.setVpaidMode(google.ima.ImaSdkSettings.VpaidMode.INSECURE);

        const adDisplayContainer = new google.ima.AdDisplayContainer(container, video);
        adDisplayContainer.initialize();

        adsLoader = new google.ima.AdsLoader(adDisplayContainer);

        adsLoader.addEventListener(
          google.ima.AdErrorEvent.Type.AD_ERROR,
          (event) => {
            const err = (event as google.ima.AdErrorEvent).getError?.();
            onStatus(err ? `Ad error: ${err.getMessage()} (code ${err.getErrorCode()})` : "Ad error.");
          },
          false,
        );

        adsLoader.addEventListener(
          google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (event) => {
            if (cancelled || !video) return;
            adsManager = (event as google.ima.AdsManagerLoadedEvent).getAdsManager(video);

            adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (e) => {
              const err = (e as google.ima.AdErrorEvent).getError?.();
              onStatus(err ? `Ad error: ${err.getMessage()} (code ${err.getErrorCode()})` : "Ad error.");
            });
            adsManager.addEventListener(google.ima.AdEvent.Type.STARTED, () =>
              onStatus("Playing"),
            );
            adsManager.addEventListener(google.ima.AdEvent.Type.CLICK, () =>
              onClickThrough(clickThroughUrl),
            );
            adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, () =>
              onStatus("Complete"),
            );

            try {
              adsManager.init(
                container.clientWidth || 640,
                container.clientHeight || 360,
                google.ima.ViewMode.NORMAL,
              );
              adsManager.start();
            } catch {
              onStatus("The IMA SDK failed to start the ad.");
            }
          },
          false,
        );

        const adsRequest = new google.ima.AdsRequest();
        adsRequest.adTagUrl = mint.previewTagUrl;
        adsRequest.linearAdSlotWidth = container.clientWidth || 640;
        adsRequest.linearAdSlotHeight = container.clientHeight || 360;
        adsRequest.nonLinearAdSlotWidth = container.clientWidth || 640;
        adsRequest.nonLinearAdSlotHeight = Math.floor(
          (container.clientHeight || 360) / 3,
        );

        adsLoader.requestAds(adsRequest);
      })
      .catch(() => {
        if (!cancelled) onStatus("Could not load the Google IMA SDK.");
      });

    return () => {
      cancelled = true;
      try {
        adsManager?.destroy();
      } catch {
        /* noop */
      }
      try {
        adsLoader?.destroy();
      } catch {
        /* noop */
      }
    };
    // Runs once per mount; PreviewPanel remounts this component (new key) for
    // every Launch/Restart rather than re-running this effect in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <video ref={videoRef} className="hidden" muted playsInline />
    </div>
  );
}
