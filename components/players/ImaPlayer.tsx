"use client";

import { useEffect, useRef } from "react";
import type { PreviewPlayerProps } from "./types";
import { subscribeToCreativeTelemetry, toPlayerEvent } from "./telemetry";
import { IMA_SDK_SRC, loadImaSdk } from "./load-ima-sdk";
import { useDict } from "@/components/i18n/LocaleProvider";

/**
 * Google IMA SDK — the industry-standard VAST/VPAID SDK, requesting the exact
 * same previewTagUrl the Sandbox tab and Video.js tab use. vpaidMode is set to
 * INSECURE because our units draw directly into the DOM slot rather than
 * running sandboxed (ADR-0003: access control, not code hiding).
 */
export function ImaPlayer({
  mint,
  onStatus,
  onClickThrough,
  onEvent,
}: PreviewPlayerProps) {
  const dict = useDict();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The effect below runs once per mount by design, so `onEvent` is read
  // through a ref rather than captured — see ValidatorStage for the same shape.
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    let cancelled = false;
    let adsLoader: google.ima.AdsLoader | undefined;
    let adsManager: google.ima.AdsManager | undefined;

    // IMA runs the VPAID unit inside its own iframe on imasdk.googleapis.com —
    // a genuinely cross-origin document, where nothing about the creative can
    // be read from this side at all. This channel is the only thing that
    // crosses it: the unit posts to the origin it was served from, which is
    // ours, and the browser delivers it here (ADR-0019).
    const unsubscribe = subscribeToCreativeTelemetry((record) => {
      if (cancelled) return;
      onEventRef.current?.(toPlayerEvent(record));
    });

    const clickThroughUrl =
      typeof mint.sandbox.adParameters.clickThroughUrl === "string"
        ? mint.sandbox.adParameters.clickThroughUrl
        : "(click-through)";

    onStatus(dict.preview.loadingIma);

    // IMA issues its ad request from a bridge iframe on imasdk.googleapis.com —
    // a *public* address space. When the tag lives on localhost (any local dev
    // server) that request is public→loopback, which Chrome's Private Network
    // Access refuses: first for want of a secure context, then, over https, for
    // want of a permission the third-party bridge cannot ask for. No response
    // header fixes it, because the restriction is on the requesting context.
    //
    // So on loopback only, fetch the VAST ourselves — same-origin with the page,
    // so PNA never applies — and hand IMA the document via `adsResponse`. IMA
    // parses exactly the same XML it would have fetched; only who performs the
    // GET differs. A deployed tag is a public address, so production keeps the
    // full adTagUrl path and its fidelity to what a real DSP does.
    const tagUrl = new URL(mint.previewTagUrl);
    const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(tagUrl.hostname);

    /**
     * Everything that happens once the SDK is on the page. Split out from the
     * load so its failures are reported as its own: a throw in here used to
     * land in the loader's `.catch()` and announce that the SDK had not
     * loaded, which points every diagnosis at the wrong half of the problem.
     */
    const run = async () => {
      const container = containerRef.current;
      const video = videoRef.current;
      if (!container || !video) return;

      let adsResponse: string | null = null;
      if (isLoopback) {
        try {
          adsResponse = await (await fetch(mint.previewTagUrl)).text();
        } catch {
          onStatus(dict.preview.tagFetchFailed);
          return;
        }
        if (cancelled) return;
      }

      // VPAID-only: our units draw directly into the DOM slot rather than
      // running sandboxed (ADR-0003). Scoped to the VPAID format specifically —
      // under investigation for whether this setting also perturbs IMA's SIMID
      // handshake, which never fires SIMID:Player:init for this ad despite
      // sending it ongoing SIMID:Media:* notifications.
      if (mint.sandbox.format === "vpaid") {
        google.ima.settings.setVpaidMode(google.ima.ImaSdkSettings.VpaidMode.INSECURE);
      }

      // IMA renders its own UI strings and error messages; matching the page
      // keeps a Russian reader from meeting an English "Skip ad" button inside
      // an otherwise Russian panel. Same call, same reason, as ValidatorStage.
      google.ima.settings.setLocale(document.documentElement.lang || "en");

      const adDisplayContainer = new google.ima.AdDisplayContainer(container, video);
      adDisplayContainer.initialize();

      adsLoader = new google.ima.AdsLoader(adDisplayContainer);

      const reportAdError = (event: google.ima.AdErrorEvent) => {
        const err = event.getError?.();
        onStatus(
          err
            ? `${dict.preview.adError}: ${err.getMessage()} · IMA ${err.getErrorCode()}`
            : `${dict.preview.adError}.`,
        );
      };

      adsLoader.addEventListener(
        google.ima.AdErrorEvent.Type.AD_ERROR,
        (event) => reportAdError(event as google.ima.AdErrorEvent),
        false,
      );

      adsLoader.addEventListener(
        google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        (event) => {
          if (cancelled || !video) return;
          adsManager = (event as google.ima.AdsManagerLoadedEvent).getAdsManager(video);

          adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (e) =>
            reportAdError(e as google.ima.AdErrorEvent),
          );
          adsManager.addEventListener(google.ima.AdEvent.Type.STARTED, () =>
            onStatus(dict.preview.playing),
          );
          adsManager.addEventListener(google.ima.AdEvent.Type.CLICK, () =>
            onClickThrough(clickThroughUrl),
          );
          adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, () =>
            onStatus(dict.preview.complete),
          );

          try {
            adsManager.init(
              container.clientWidth || 640,
              container.clientHeight || 360,
              google.ima.ViewMode.NORMAL,
            );
            adsManager.start();
          } catch {
            onStatus(dict.preview.imaStartFailed);
          }
        },
        false,
      );

      const adsRequest = new google.ima.AdsRequest();
      if (adsResponse !== null) {
        adsRequest.adsResponse = adsResponse;
      } else {
        adsRequest.adTagUrl = mint.previewTagUrl;
      }
      adsRequest.linearAdSlotWidth = container.clientWidth || 640;
      adsRequest.linearAdSlotHeight = container.clientHeight || 360;
      adsRequest.nonLinearAdSlotWidth = container.clientWidth || 640;
      adsRequest.nonLinearAdSlotHeight = Math.floor(
        (container.clientHeight || 360) / 3,
      );

      adsLoader.requestAds(adsRequest);
    };

    void (async () => {
      try {
        await loadImaSdk();
      } catch {
        // Only a genuine load failure reaches here, so the message can name a
        // cause instead of hedging: the SDK is a third-party script from an
        // ad-serving domain, and the thing that stops it is almost always a
        // blocker on this browser rather than anything the app did.
        //
        // `info`, not `dead`: nothing about the account, the tag or the
        // creative is failing, and red is the vocabulary a buyer reads as "my
        // ad is dead" (docs/design-system.md §3). The condition is on this
        // browser and the notice says what to do about it.
        if (!cancelled) onStatus(dict.preview.imaSdkBlocked, "info", IMA_SDK_SRC);
        return;
      }
      if (cancelled) return;
      try {
        await run();
      } catch (cause) {
        if (!cancelled) {
          onStatus(
            cause instanceof Error
              ? `${dict.preview.imaRunFailed} ${cause.message}`
              : dict.preview.imaRunFailed,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
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
