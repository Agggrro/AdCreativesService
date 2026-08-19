"use client";

import { useEffect, useRef, useState } from "react";
import { loadImaSdk } from "@/components/players/load-ima-sdk";
import type { PlayerEvent } from "@/components/players/types";
import type { Playback } from "@/lib/vast-inspect/model";
import {
  isSandboxMessage,
  SANDBOX_CHANNEL,
  SDK_LOAD_FAILED,
  type ResolvedAd,
  type SandboxMessage,
} from "@/components/validator/sandbox-protocol";

/**
 * The validator's player, as it runs **inside the sandbox frame**.
 *
 * This is the code that executes a stranger's VPAID unit. It is on a different
 * origin from the app for exactly that reason (`getSandboxUrl`): IMA runs VPAID
 * in `INSECURE` mode, which puts third-party JavaScript in this document's own
 * origin, and the whole design is that this document's origin owns nothing —
 * no session, no `localStorage` of ours, no reachable API of ours.
 *
 * Google IMA is the backend because it is the reference implementation of the
 * market: a tag that fails here fails nearly everywhere, it is the only player
 * we host that reports numeric error codes, and it exposes both `adsResponse`
 * (which is how pasted XML gets played at all) and the full AdEvent set the
 * timeline is built from.
 *
 * ## Why the SDK is set up before there is anything to play
 *
 * `AdDisplayContainer.initialize()` wants the user gesture that started the run,
 * and the run starts with one click in the parent. The inspection that produces
 * the document can take tens of seconds on a long wrapper chain, so waiting for
 * it before setting up would put a network round trip in between. The frame
 * therefore initialises on the first `init` — which the parent sends
 * immediately, with `playback: null` — and requests ads on the second.
 *
 * Autoplay is delegated across the boundary by `allow="autoplay"` on the iframe
 * rather than inherited: transient activation does not cross into a cross-origin
 * frame on its own.
 */

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
  // Our own creatives never reach this one: ADR-0009 decided a close click is an
  // AdSkipped/AdStopped pair rather than a new lifecycle concept. Third-party
  // VPAID units do send it, which is why it stays tracked.
  { key: "USER_CLOSE", name: "userClose", tone: "warn" },
  { key: "VOLUME_CHANGED", name: "volumeChanged", tone: "info" },
  { key: "VOLUME_MUTED", name: "volumeMuted", tone: "info" },
  { key: "AD_BUFFERING", name: "buffering", tone: "warn" },
  { key: "DURATION_CHANGE", name: "durationChange", tone: "info" },
  { key: "LINEAR_CHANGED", name: "linearChanged", tone: "info" },
  { key: "VIEWABLE_IMPRESSION", name: "viewableImpression", tone: "live" },
  { key: "AD_METADATA", name: "adMetadata", tone: "info" },
] as const;

export function SandboxStage({ allowedParents }: { allowedParents: string[] }) {
  // Keyed by value, not by identity: the effect below owns the whole SDK
  // lifecycle, and re-running it because an array literal got a new identity
  // would restart the ad mid-play. The joined string *is* the value, so the
  // effect reads the list back out of it rather than closing over the prop.
  const allowKey = allowedParents.join(" ");
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  /** The parent's origin, learned from the first accepted message and never widened. */
  const peerRef = useRef<string | null>(null);
  const requestRef = useRef<((playback: Playback) => void) | null>(null);
  const pendingRef = useRef<Playback | null>(null);
  const startedRef = useRef(false);
  const loaderRef = useRef<google.ima.AdsLoader | null>(null);

  const [contentSrc, setContentSrc] = useState<string | undefined>();

  useEffect(() => {
    const allowed = allowKey ? allowKey.split(" ") : [];
    const startedAt = performance.now();
    let adsManager: google.ima.AdsManager | undefined;
    let adsLoader: google.ima.AdsLoader | undefined;
    let disposed = false;

    const post = (message: SandboxMessage) => {
      const peer = peerRef.current;
      if (!peer || !window.parent || window.parent === window) return;
      window.parent.postMessage(message, peer);
    };

    const emit = (
      name: string,
      tone: PlayerEvent["tone"],
      detail?: string,
      source: PlayerEvent["source"] = "player",
    ) => {
      post({
        channel: SANDBOX_CHANNEL,
        type: "event",
        event: { at: Math.round(performance.now() - startedAt), source, name, detail, tone },
      });
    };

    /**
     * Resume the content clip, and say so.
     *
     * The bug this exists for: `CONTENT_RESUME_REQUESTED` used to be logged and
     * nothing more, so after a creative closed itself the content sat paused
     * while the timeline cheerfully recorded that it had been asked to resume.
     * A creative that closes itself also pauses the video slot the player handed
     * it (`runtime/lib/vpaid-base.js`), which makes the missing handler a stall
     * rather than a cosmetic gap.
     *
     * The `validator`-sourced rows are the other half of that lesson. IMA's own
     * events say what the player *asked* for; these say what the page actually
     * did about it. A timeline that shows only the request is exactly what made
     * the original fault look like a mystery instead of a missing handler.
     */
    const playContent = () => {
      const video = videoRef.current;
      if (!video || !video.getAttribute("src")) return;
      void video.play().then(
        () => emit("contentPlaying", "live", undefined, "validator"),
        (cause) => {
          // A play() still in flight when pause() lands rejects with AbortError.
          // That is the ad break starting on schedule, not a failure.
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          emit(
            "contentBlocked",
            "warn",
            cause instanceof Error ? cause.message : undefined,
            "validator",
          );
        },
      );
    };

    const pauseContent = () => {
      const video = videoRef.current;
      if (!video || video.paused) return;
      video.pause();
      emit("contentPaused", "info", undefined, "validator");
    };

    const setUp = (locale: string) => {
      if (startedRef.current || disposed) return;
      const container = containerRef.current;
      const video = videoRef.current;
      if (!container || !video) return;
      startedRef.current = true;

      emit("sdkReady", "info", undefined, "validator");

      // Always INSECURE. Every production player that runs VPAID at all runs it
      // this way, so a stricter mode here would report a failure the tag will
      // never actually meet. What makes that acceptable is the origin this
      // document is on, not the mode.
      google.ima.settings.setVpaidMode(google.ima.ImaSdkSettings.VpaidMode.INSECURE);
      google.ima.settings.setLocale(locale || "en");

      const displayContainer = new google.ima.AdDisplayContainer(container, video);
      displayContainer.initialize();

      // The content clip starts now, so the break has something to interrupt and
      // something to return to.
      playContent();

      adsLoader = new google.ima.AdsLoader(displayContainer);
      loaderRef.current = adsLoader;

      const reportError = (event: google.ima.AdErrorEvent) => {
        const error = event.getError?.();
        if (!error) {
          emit("adError", "dead");
          return;
        }
        // Both codes are worth having: getErrorCode() is IMA's own, while
        // getVastErrorCode() is the IAB number the report already speaks in.
        const vast = error.getVastErrorCode?.();
        emit(
          "adError",
          "dead",
          [error.getMessage(), `IMA ${error.getErrorCode()}`, vast ? `VAST ${vast}` : null]
            .filter(Boolean)
            .join(" · "),
        );
        // An ad that failed still ended the break as far as the page is
        // concerned; leaving the content frozen behind an error is the same
        // stall in a different costume.
        playContent();
      };

      adsLoader.addEventListener(
        google.ima.AdErrorEvent.Type.AD_ERROR,
        (event) => reportError(event as google.ima.AdErrorEvent),
        false,
      );

      adsLoader.addEventListener(
        google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
        (event) => {
          if (disposed) return;
          const settings = new google.ima.AdsRenderingSettings();
          // Only applies to IMA's custom-playback mode (one video element for
          // both content and ad, typically iOS). On a desktop separate-element
          // setup it is a no-op, which is why the explicit pause/resume handlers
          // below are the actual mechanism rather than a belt on top of it.
          settings.restoreCustomPlaybackStateOnAdBreakComplete = true;
          adsManager = (event as google.ima.AdsManagerLoadedEvent).getAdsManager(video, settings);

          adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, (e) =>
            reportError(e as google.ima.AdErrorEvent),
          );

          // IMA's own non-fatal diagnostics. Nothing else on the market surfaces
          // these, and they are frequently the only clue when a tag "works" but
          // silently drops a creative.
          adsManager.addEventListener(google.ima.AdEvent.Type.LOG, (e) => {
            const data = (e as google.ima.AdEvent).getAdData?.();
            emit(
              "log",
              "warn",
              data && typeof data === "object" && "adError" in data
                ? String((data as { adError?: unknown }).adError)
                : JSON.stringify(data ?? {}),
            );
          });

          for (const { key, name, tone } of TRACKED) {
            const type = google.ima.AdEvent.Type[key];
            if (!type) continue;
            adsManager.addEventListener(type, (e) => {
              const adEvent = e as google.ima.AdEvent;
              if (name === "loaded") {
                const ad = adEvent.getAd?.();
                if (ad) {
                  const resolved: ResolvedAd = {
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
                  };
                  post({ channel: SANDBOX_CHANNEL, type: "resolved", ad: resolved });
                }
              }

              // The player's own row goes first, then ours: the timeline reads
              // "IMA asked / the page complied" in that order, which is the whole
              // point of recording both.
              emit(name, tone);

              // The content clip's half of the ad break. IMA asks; somebody has
              // to answer, and on a separate-element setup that somebody is the
              // host page — which, here, is this frame.
              if (name === "contentPauseRequested") pauseContent();
              if (name === "contentResumeRequested") playContent();
              // A break can end without a resume request — an error during the
              // break, or a manager that completes without one. The content
              // being stuck is the failure either way, so the last event of the
              // break re-checks it rather than assuming.
              if (name === "allAdsCompleted" && videoRef.current?.paused) playContent();
            });
          }

          try {
            adsManager.init(
              container.clientWidth || 640,
              container.clientHeight || 360,
              google.ima.ViewMode.NORMAL,
            );
            adsManager.start();
          } catch (cause) {
            emit("startFailed", "dead", cause instanceof Error ? cause.message : undefined);
          }
        },
        false,
      );

      /** Build and send the ad request. Called once, by whichever half is last. */
      const request = (ready: Playback) => {
        if (disposed || !adsLoader) return;
        const adsRequest = new google.ima.AdsRequest();
        if (ready.adsResponse !== undefined) {
          adsRequest.adsResponse = ready.adsResponse;
          emit("adsResponse", "info", undefined, "validator");
        } else if (ready.adTagUrl !== undefined) {
          adsRequest.adTagUrl = ready.adTagUrl;
          emit("adTagUrl", "info", undefined, "validator");
        } else {
          emit("noPlayableDocument", "dead", undefined, "validator");
          return;
        }
        adsRequest.linearAdSlotWidth = container.clientWidth || 640;
        adsRequest.linearAdSlotHeight = container.clientHeight || 360;
        adsRequest.nonLinearAdSlotWidth = container.clientWidth || 640;
        adsRequest.nonLinearAdSlotHeight = Math.floor((container.clientHeight || 360) / 3);
        adsRequest.setAdWillAutoPlay(true);
        adsRequest.setAdWillPlayMuted(false);
        adsLoader.requestAds(adsRequest);
      };

      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        request(pending);
      } else {
        requestRef.current = request;
      }
    };

    const onMessage = (event: MessageEvent) => {
      // Origin first, and against a list this document was rendered with — never
      // against something the message itself carries.
      if (!allowed.includes(event.origin)) return;
      // The parent window and nothing else. IMA runs its own frames in here.
      if (event.source !== window.parent) return;
      if (!isSandboxMessage(event.data) || event.data.type !== "init") return;

      peerRef.current = event.origin;
      const { playback, contentSrc: clip, locale } = event.data;
      if (clip) setContentSrc(clip);

      if (!startedRef.current) {
        loadImaSdk().then(
          () => {
            if (disposed) return;
            try {
              setUp(locale);
            } catch (cause) {
              emit(
                "stageFailed",
                "dead",
                cause instanceof Error ? cause.message : undefined,
                "validator",
              );
            }
          },
          (cause) => {
            if (disposed) return;
            emit(
              SDK_LOAD_FAILED,
              "dead",
              cause instanceof Error ? cause.message : undefined,
              "validator",
            );
          },
        );
      }

      if (playback) {
        const send = requestRef.current;
        if (send) {
          requestRef.current = null;
          send(playback);
        } else {
          pendingRef.current = playback;
        }
      }
    };

    window.addEventListener("message", onMessage);
    // Carries nothing, so `*` leaks nothing: the frame cannot know its parent's
    // origin until the parent tells it, and this is what prompts that.
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ channel: SANDBOX_CHANNEL, type: "ready" }, "*");
    }

    return () => {
      disposed = true;
      window.removeEventListener("message", onMessage);
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
      loaderRef.current = null;
    };
  }, [allowKey]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-well-screen">
      <div ref={containerRef} className="absolute inset-0" />
      <video
        ref={videoRef}
        // Started from the effect, not by `autoPlay`, so it begins in the same
        // step as the SDK setup — and so the frame plays nothing at all until
        // the parent has spoken.
        className={contentSrc ? "size-full object-contain" : "hidden"}
        src={contentSrc}
        muted
        playsInline
        preload="metadata"
        // Declared in our IMA types and never called before this: without it
        // IMA never learns the content ended, so a post-roll never fires.
        onEnded={() => {
          try {
            loaderRef.current?.contentComplete();
          } catch {
            /* noop */
          }
        }}
      />
    </div>
  );
}
