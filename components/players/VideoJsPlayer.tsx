"use client";

import "video.js/dist/video-js.css";
import "videojs-ima/dist/videojs.ima.css";

import { useEffect, useRef } from "react";
import type Player from "video.js/dist/types/player";
import type { PreviewPlayerProps } from "./types";
import { loadImaSdk } from "./load-ima-sdk";

// video.js has official types; videojs-ima/videojs-contrib-ads (imported for
// their side effect of registering a plugin) do not, so the plugin surface we
// actually call is described here rather than left as `any`.
interface ImaPlugin {
  requestAds: () => void;
}
interface PlayerWithIma extends Player {
  ima: (options: { adTagUrl: string }) => ImaPlugin;
}

/**
 * Video.js + the official googleads/videojs-ima plugin — the most widely used
 * open-source HTML5 player, wrapping the same IMA engine as the ImaPlayer tab
 * but with Video.js's own control chrome. Requests the same previewTagUrl.
 */
export function VideoJsPlayer({ mint, onStatus, onClickThrough }: PreviewPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<PlayerWithIma | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clickThroughUrl =
      typeof mint.sandbox.adParameters.clickThroughUrl === "string"
        ? mint.sandbox.adParameters.clickThroughUrl
        : "(click-through)";

    onStatus("Loading Video.js…");

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
        }) as unknown as PlayerWithIma;
        playerRef.current = player;

        player.on("ads-ad-started", () => onStatus("Playing"));
        player.on("ads-click", () => onClickThrough(clickThroughUrl));
        player.on("ads-allpods-completed", () => onStatus("Complete"));
        player.on("adserror", () => onStatus("Ad error."));

        const ima = player.ima({ adTagUrl: mint.previewTagUrl });
        ima.requestAds();
      })
      .catch(() => {
        if (!cancelled) onStatus("Could not load Video.js.");
      });

    return () => {
      cancelled = true;
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
