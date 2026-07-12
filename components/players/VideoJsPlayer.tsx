"use client";

import "video.js/dist/video-js.css";
import "videojs-ima/dist/videojs.ima.css";

import { useEffect, useRef } from "react";
import type Player from "video.js/dist/types/player";
import type { PreviewPlayerProps } from "./types";
import { loadImaSdk } from "./load-ima-sdk";

// video.js has official types; videojs-ima/videojs-contrib-ads (imported for
// their side effect of registering a plugin) do not, so the plugin surface we
// actually call is described here rather than left as `any` (confirmed by
// reading node_modules/videojs-ima/dist/videojs.ima.js directly, since the
// package ships no types/docs for this). `player.ima(options)` returns
// nothing — it creates the ad objects asynchronously, internally deferred to
// the player's own 'ready' lifecycle — and the plugin's default
// `requestMode: 'onLoad'` already calls requestAds() itself once that's done,
// so no manual requestAds() call is needed (and calling one immediately after
// player.ima(options) races ahead of that setup and throws).
interface PlayerWithIma extends Player {
  ima: (options: { adTagUrl: string }) => void;
}

/**
 * Video.js + the official googleads/videojs-ima plugin — the most widely used
 * open-source HTML5 player, wrapping the same IMA engine as the ImaPlayer tab
 * but with Video.js's own control chrome. Requests the same previewTagUrl.
 * Click-through isn't wired up here: unlike the raw IMA SDK (ImaPlayer.tsx),
 * this plugin doesn't expose a click event through the public video.js event
 * API to listen for.
 */
// Safety net: if no ad-state event fires within this window (ad request stuck
// or silently dropped — e.g. the well-documented CORS/mixed-content class of
// issue with IMA ad-tag requests), stop showing an indefinite spinner.
const AD_EVENT_TIMEOUT_MS = 10_000;

export function VideoJsPlayer({ mint, onStatus }: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<PlayerWithIma | null>(null);

  useEffect(() => {
    let cancelled = false;
    let sawAdEvent = false;

    onStatus("Loading Video.js…");

    const watchdog = setTimeout(() => {
      if (!cancelled && !sawAdEvent) {
        onStatus("Ad request timed out.");
      }
    }, AD_EVENT_TIMEOUT_MS);

    const reportAdEvent = (status: string) => {
      sawAdEvent = true;
      clearTimeout(watchdog);
      onStatus(status);
    };

    Promise.all([
      import("video.js"),
      import("videojs-contrib-ads"),
      import("videojs-ima"),
      loadImaSdk(),
    ])
      .then(([{ default: videojs }]) => {
        if (cancelled || !videoRef.current) return;

        google.ima.settings.setVpaidMode(google.ima.ImaSdkSettings.VpaidMode.INSECURE);

        const player = videojs(videoRef.current, {
          controls: true,
          fluid: true,
          muted: true,
        }) as unknown as PlayerWithIma;
        playerRef.current = player;

        // videojs-contrib-ads' ad-state-machine events (plugin-agnostic).
        player.on("adstart", () => reportAdEvent("Playing"));
        player.on("adend", () => reportAdEvent("Complete"));
        player.on("adtimeout", () => reportAdEvent("Ad request timed out."));
        player.on("vjsadserror", () => reportAdEvent("Ad error."));

        player.ima({ adTagUrl: mint.previewTagUrl });

        // contrib-ads only starts the ad break once BOTH 'adsready' (which
        // videojs-ima triggers itself once the ad response is loaded) AND
        // 'play' have fired — with no real content video, nothing ever calls
        // play() on its own, so the ad would otherwise sit fully loaded but
        // never actually start. Muted so this isn't blocked by autoplay policy.
        const playResult = player.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(() => {
            /* autoplay blocked; readyforpreroll will still fire once the
               user interacts with the player's own play control */
          });
        }
      })
      .catch(() => {
        clearTimeout(watchdog);
        if (!cancelled) onStatus("Could not load Video.js.");
      });

    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      try {
        playerRef.current?.dispose();
      } catch {
        /* noop */
      }
      playerRef.current = null;
    };
    // Runs once per mount; PreviewPanel remounts this component (new key) for
    // every Launch/Restart rather than re-running this effect in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 [&_.video-js]:h-full [&_.video-js]:w-full">
      <video ref={videoRef} className="video-js vjs-default-skin h-full w-full" playsInline />
    </div>
  );
}
