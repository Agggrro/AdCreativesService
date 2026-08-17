"use client";

import "fluid-player/src/css/fluidplayer.css";
import "./fluid-preview.css";

import { useEffect, useRef } from "react";
import fluidPlayer from "fluid-player";
import type { PreviewPlayerProps } from "./types";

/**
 * Fluid Player — a free, MIT-licensed, actively maintained HTML5 player with
 * built-in VAST/VPAID support (`allowVPAID`), no separate ad plugin required.
 * Used purely as an outstream ad player: the wrapped <video> has no
 * <source>/content, the VAST tag is configured as a single preRoll, and
 * Launch Ad calling play() directly is what starts it — there is no
 * content-video timing/state-machine gate to fight (unlike video.js +
 * videojs-ima + videojs-contrib-ads, which this replaces; that combination
 * hit an unresolved upstream VPAID-rendering limitation even in its
 * dedicated outstream mode). This exact "no content, single preRoll" pattern
 * is the same one Prebid's own outstream renderer uses for Fluid Player
 * (prebid/prebid-outstream, src/players/fluid-player/FluidPlayerConfig.ts).
 *
 * The <video> element is created imperatively (not rendered via JSX) and the
 * outer slot div is otherwise empty in React's eyes — Fluid Player replaces/
 * restructures the DOM around whatever element it's given, which fights
 * React's reconciliation if React believes it owns that node (confirmed: a
 * parent re-render — e.g. from an onStatus call — silently wiped the player
 * out from under React when the <video> was rendered directly in JSX).
 *
 * Click-through isn't wired up here: fluid-player's event API doesn't expose
 * an ad-click event, and adClickable is left off so testing never navigates
 * the dashboard tab away to the advertiser's URL.
 */
export function FluidPlayer({ mint, onStatus }: PreviewPlayerProps) {
  const slotRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<ReturnType<typeof fluidPlayer> | null>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    let cancelled = false;
    slot.innerHTML = "";

    const video = document.createElement("video");
    video.className = "h-full w-full";
    video.muted = true;
    video.playsInline = true;
    slot.appendChild(video);

    onStatus("Loading ad…");

    const player = fluidPlayer(video, {
      layoutControls: {
        autoPlay: false,
        fillToContainer: true,
        posterImage: false,
        playButtonShowing: false,
        mute: true,
        // Chrome that has no job on an ad-only preview. What has an option is
        // turned off here; what does not is hidden in fluid-preview.css, which
        // explains the whole decision in one place.
        allowTheatre: false,
        miniPlayer: { enabled: false },
        // Our creatives are clickable by design, and a stray double-click
        // should not throw the dashboard into fullscreen.
        doubleclickFullscreen: false,
        // Off because it is both useless and harmful here. Useless: there is no
        // content to seek. Harmful: Fluid binds this on `document` in the
        // capture phase after the first click inside the player, and its
        // handler calls preventDefault() for space, Enter, m, f, the arrows and
        // every digit, with no exemption for form fields. Click the creative,
        // Tab into the configurator, and spaces and digits stop reaching the
        // input you are typing in.
        keyboardControl: false,
      },
      vastOptions: {
        adList: [{ roll: "preRoll", vastTag: mint.previewTagUrl }],
        allowVPAID: true,
        showPlayButton: false,
        adClickable: false,
        vastAdvanced: {
          vastLoadedCallback: () => {
            if (!cancelled) onStatus("Playing");
          },
          noVastVideoCallback: () => {
            if (!cancelled) onStatus("Ad error.");
          },
          vastVideoSkippedCallback: () => {
            if (!cancelled) onStatus("Complete");
          },
          vastVideoEndedCallback: () => {
            if (!cancelled) onStatus("Complete");
          },
        },
      },
    });
    playerRef.current = player;
    player.play();

    return () => {
      cancelled = true;
      try {
        player.destroy();
      } catch {
        /* noop */
      }
      playerRef.current = null;
      slot.innerHTML = "";
    };
    // Runs once per mount; PreviewPanel remounts this component (new key) for
    // every Launch/Restart rather than re-running this effect in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `fluid-preview` scopes the chrome overrides in fluid-preview.css. Fluid
  // builds its wrapper and control bar inside this slot, so an ancestor class
  // is enough and no vendor markup has to be reached into.
  return <div ref={slotRef} className="fluid-preview absolute inset-0" />;
}
