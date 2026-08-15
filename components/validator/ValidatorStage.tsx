"use client";

import { useEffect, useRef } from "react";
import { loadImaSdk } from "@/components/players/load-ima-sdk";
import type { PlayerEvent } from "@/components/players/types";
import type { Placement, Playback } from "@/lib/vast-inspect/model";

/**
 * The validator's player.
 *
 * A sibling of ImaPlayer rather than a fork of it. ImaPlayer keeps its
 * `PreviewMint` contract, which is exactly right for the configurator and
 * exactly wrong here: the validator plays a stranger's tag, needs raw XML as an
 * input, and cares about every lifecycle event rather than a status line. The
 * two share what genuinely is shared — `loadImaSdk()`.
 *
 * Google IMA is the backend because it is the reference implementation of the
 * market: a tag that fails here fails nearly everywhere, it is the only player
 * we host that reports numeric error codes, and it exposes both `adsResponse`
 * (which is how pasted XML gets played at all) and the full AdEvent set the
 * timeline is built from.
 */

export type VpaidMode = "enabled" | "insecure" | "disabled";

interface ValidatorStageProps {
  playback: Playback;
  placement: Placement;
  vpaidMode: VpaidMode;
  /** Content clip for instream. Absent means the ad plays with no content around it. */
  contentSrc?: string;
  onEvent: (event: PlayerEvent) => void;
  /** Metadata IMA resolved, for the parser-versus-player cross-check. */
  onAdResolved: (ad: ResolvedAd) => void;
  /** Bumping this remounts the component, which is how a re-run starts clean. */
  runToken: number;
}

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
 * Which AdEvent types the timeline records, and how each one reads.
 *
 * Left out on purpose: AD_PROGRESS, which fires several times a second and
 * would bury every other row. Its information is already in the quartiles.
 */
const TRACKED: ReadonlyArray<{
  key: keyof typeof google.ima.AdEvent.Type;
  name: string;
  tone: PlayerEvent["tone"];
}> = [
  { key: "LOADED", name: "loaded", tone: "info" },
  { key: "AD_CAN_PLAY", name: "canPlay", tone: "info" },
  { key: "CONTENT_PAUSE_REQUESTED", name: "contentPauseRequested", tone: "info" },
  { key: "IMPRESSION", name: "impression", tone: "live" },
  { key: "STARTED", name: "start", tone: "live" },
  { key: "FIRST_QUARTILE", name: "firstQuartile", tone: "live" },
  { key: "MIDPOINT", name: "midpoint", tone: "live" },
  { key: "THIRD_QUARTILE", name: "thirdQuartile", tone: "live" },
  { key: "COMPLETE", name: "complete", tone: "live" },
  { key: "ALL_ADS_COMPLETED", name: "allAdsCompleted", tone: "live" },
  { key: "CONTENT_RESUME_REQUESTED", name: "contentResumeRequested", tone: "info" },
  { key: "CLICK", name: "click", tone: "info" },
  { key: "VIDEO_CLICKED", name: "videoClicked", tone: "info" },
  { key: "VIDEO_ICON_CLICKED", name: "iconClicked", tone: "info" },
  { key: "INTERACTION", name: "interaction", tone: "info" },
  { key: "PAUSED", name: "paused", tone: "info" },
  { key: "RESUMED", name: "resumed", tone: "info" },
  { key: "SKIPPED", name: "skipped", tone: "warn" },
  { key: "SKIPPABLE_STATE_CHANGED", name: "skippableStateChanged", tone: "info" },
  { key: "USER_CLOSE", name: "userClose", tone: "warn" },
  { key: "VOLUME_CHANGED", name: "volumeChanged", tone: "info" },
  { key: "VOLUME_MUTED", name: "volumeMuted", tone: "info" },
  { key: "AD_BUFFERING", name: "buffering", tone: "warn" },
  { key: "DURATION_CHANGE", name: "durationChange", tone: "info" },
  { key: "LINEAR_CHANGED", name: "linearChanged", tone: "info" },
  { key: "VIEWABLE_IMPRESSION", name: "viewableImpression", tone: "live" },
  { key: "AD_METADATA", name: "adMetadata", tone: "info" },
] as const;

const VPAID_MODE_VALUES: Record<VpaidMode, () => number> = {
  enabled: () => google.ima.ImaSdkSettings.VpaidMode.ENABLED,
  insecure: () => google.ima.ImaSdkSettings.VpaidMode.INSECURE,
  disabled: () => google.ima.ImaSdkSettings.VpaidMode.DISABLED,
};

export function ValidatorStage({
  playback,
  placement,
  vpaidMode,
  contentSrc,
  onEvent,
  onAdResolved,
  runToken,
}: ValidatorStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Held in refs so the effect below can stay a mount-once effect: it tears the
  // whole SDK down on cleanup, and re-running it because a callback identity
  // changed would restart the ad mid-play. Assigned in an effect rather than
  // during render — a ref written while rendering is not a stable value.
  const onEventRef = useRef(onEvent);
  const onAdResolvedRef = useRef(onAdResolved);
  useEffect(() => {
    onEventRef.current = onEvent;
    onAdResolvedRef.current = onAdResolved;
  });

  useEffect(() => {
    let cancelled = false;
    let adsLoader: google.ima.AdsLoader | undefined;
    let adsManager: google.ima.AdsManager | undefined;
    let observer: IntersectionObserver | undefined;
    const startedAt = performance.now();

    const emit = (
      name: string,
      tone: PlayerEvent["tone"],
      detail?: string,
      source: PlayerEvent["source"] = "player",
    ) => {
      onEventRef.current({
        at: Math.round(performance.now() - startedAt),
        source,
        name,
        detail,
        tone,
      });
    };

    loadImaSdk()
      .then(() => {
        // Nothing is emitted before this point on purpose. React StrictMode
        // mounts an effect twice in development, and an emit in the effect body
        // would append two identical opening rows to a timeline whose whole
        // value is being an accurate record. Past the `cancelled` check only the
        // surviving mount speaks.
        if (cancelled) return;
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        emit("sdkReady", "info", undefined, "validator");

        google.ima.settings.setVpaidMode(VPAID_MODE_VALUES[vpaidMode]());
        // IMA renders its own UI strings; matching the page keeps a Russian
        // reader from meeting an English "Skip ad" button mid-report.
        google.ima.settings.setLocale(document.documentElement.lang || "en");

        const displayContainer = new google.ima.AdDisplayContainer(container, video);
        // Must happen inside the user gesture that started the run, which is why
        // the whole stage mounts on click rather than on page load.
        displayContainer.initialize();

        adsLoader = new google.ima.AdsLoader(displayContainer);

        const reportError = (event: google.ima.AdErrorEvent) => {
          const error = event.getError?.();
          if (!error) {
            emit("adError", "dead");
            return;
          }
          // Both codes are worth having: getErrorCode() is IMA's own, while
          // getVastErrorCode() is the IAB number the report already speaks in.
          const vast = error.getVastErrorCode?.();
          const detail = [
            error.getMessage(),
            `IMA ${error.getErrorCode()}`,
            vast ? `VAST ${vast}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          emit("adError", "dead", detail);
        };

        adsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (event) => {
          reportError(event as google.ima.AdErrorEvent);
        }, false);

        adsLoader.addEventListener(
          google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (event) => {
            if (cancelled) return;
            const settings = new google.ima.AdsRenderingSettings();
            settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
            adsManager = (event as google.ima.AdsManagerLoadedEvent).getAdsManager(
              video,
              settings,
            );

            adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (e) => {
              reportError(e as google.ima.AdErrorEvent);
            });

            // IMA's own non-fatal diagnostics. Nothing else on the market
            // surfaces these, and they are frequently the only clue when a tag
            // "works" but silently drops a creative.
            adsManager.addEventListener(google.ima.AdEvent.Type.LOG, (e) => {
              const data = (e as google.ima.AdEvent).getAdData?.();
              const message =
                data && typeof data === "object" && "adError" in data
                  ? String((data as { adError?: unknown }).adError)
                  : JSON.stringify(data ?? {});
              emit("log", "warn", message);
            });

            for (const { key, name, tone } of TRACKED) {
              const type = google.ima.AdEvent.Type[key];
              if (!type) continue;
              adsManager.addEventListener(type, (e) => {
                const adEvent = e as google.ima.AdEvent;
                if (name === "loaded") {
                  const ad = adEvent.getAd?.();
                  if (ad) {
                    onAdResolvedRef.current({
                      adId: ad.getAdId(),
                      adSystem: ad.getAdSystem(),
                      title: ad.getTitle(),
                      duration: ad.getDuration(),
                      width: ad.getVastMediaWidth() || ad.getWidth(),
                      height: ad.getVastMediaHeight() || ad.getHeight(),
                      contentType: ad.getContentType(),
                      apiFramework: ad.getApiFramework(),
                      universalAdIdRegistry: ad.getUniversalAdIdRegistry(),
                      universalAdIdValue: ad.getUniversalAdIdValue(),
                      wrapperAdSystems: ad.getWrapperAdSystems() ?? [],
                      skipTimeOffset: ad.getSkipTimeOffset(),
                      linear: ad.isLinear(),
                      mediaUrl: ad.getMediaUrl(),
                    });
                  }
                }
                emit(name, tone);
              });
            }

            try {
              adsManager.init(
                container.clientWidth || 640,
                container.clientHeight || 360,
                google.ima.ViewMode.NORMAL,
              );
              if (placement === "outstream") {
                // Outstream starts on visibility, muted, the way a real in-page
                // renderer does — starting it off-screen would make the
                // viewability events in the timeline meaningless.
                //
                // Announced in the timeline rather than left implicit: an ad
                // that is deliberately waiting and an ad that has silently
                // failed look identical in an empty player, and telling those
                // two apart is the entire job of this tool.
                adsManager.setVolume(0);
                emit("waitingForViewability", "info", undefined, "validator");
                observer = new IntersectionObserver(
                  (entries) => {
                    if (entries.some((entry) => entry.intersectionRatio >= 0.5)) {
                      observer?.disconnect();
                      emit("inView", "info", undefined, "validator");
                      adsManager?.start();
                    }
                  },
                  { threshold: [0, 0.5] },
                );
                observer.observe(container);
              } else {
                adsManager.start();
              }
            } catch (cause) {
              emit("startFailed", "dead", cause instanceof Error ? cause.message : undefined);
            }
          },
          false,
        );

        const request = new google.ima.AdsRequest();
        if (playback.adsResponse !== undefined) {
          request.adsResponse = playback.adsResponse;
          emit("adsResponse", "info", undefined, "validator");
        } else if (playback.adTagUrl !== undefined) {
          request.adTagUrl = playback.adTagUrl;
          emit("adTagUrl", "info", undefined, "validator");
        } else {
          emit("noPlayableDocument", "dead", undefined, "validator");
          return;
        }
        request.linearAdSlotWidth = container.clientWidth || 640;
        request.linearAdSlotHeight = container.clientHeight || 360;
        request.nonLinearAdSlotWidth = container.clientWidth || 640;
        request.nonLinearAdSlotHeight = Math.floor((container.clientHeight || 360) / 3);
        request.setAdWillAutoPlay(true);
        request.setAdWillPlayMuted(placement === "outstream");

        adsLoader.requestAds(request);
      })
      .catch(() => {
        if (!cancelled) emit("sdkLoadFailed", "dead", undefined, "validator");
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
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
    // Mount-once: a re-run remounts via `runToken` rather than re-running this
    // effect in place, matching how PreviewPanel restarts its players.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-ctl bg-well-screen">
      <div ref={containerRef} className="absolute inset-0" />
      <video
        ref={videoRef}
        // Instream plays a content clip that IMA pauses for the break, which is
        // what makes CONTENT_PAUSE_REQUESTED/RESUME_REQUESTED real rather than
        // theoretical. Outstream has no content, so the element stays hidden and
        // exists only because IMA requires one.
        className={placement === "instream" && contentSrc ? "size-full object-contain" : "hidden"}
        src={placement === "instream" ? contentSrc : undefined}
        muted
        playsInline
        // Not `auto`: IMA pauses the content for the whole ad break, so a run
        // plays only a few seconds of it. Preloading the file in full would
        // spend the visitor's bandwidth on video nobody watches.
        preload="metadata"
      />
    </div>
  );
}
