"use client";

import { useEffect, useRef } from "react";
import {
  subscribeToCreativeTelemetry,
  type CreativeTelemetryRecord,
} from "@/components/players/telemetry";

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
  /**
   * The unit's own run id, set in the base's constructor and stamped on every
   * telemetry record. Read here to tell this run's records from a previous
   * one's — see the filter below. It survives the build because
   * `runtime/build.mjs` passes `mangle: true` rather than a `mangle.properties`
   * config, and terser does not rename properties unless asked to.
   */
  _runId?: string;
};

/**
 * The lifecycle a conformant unit must complete. `AdVideoStart` is deliberately
 * absent: the base fires it beside `AdStarted`, so requiring both would report
 * one fault twice.
 */
const REQUIRED_EVENTS = [
  "AdLoaded",
  "AdStarted",
  "AdImpression",
  "AdVideoFirstQuartile",
  "AdVideoMidpoint",
  "AdVideoThirdQuartile",
  "AdVideoComplete",
] as const;

/**
 * Without these two the ad never ran at all, which is a different severity from
 * a run that started and then fell short (docs/design-system.md §3).
 */
const FATAL_IF_MISSING = ["AdStarted", "AdImpression"];

/** Give up waiting for the lifecycle. Generous: a base video has to load first. */
const TIMEOUT_MS = 12_000;

export interface HarnessVerdict {
  tone: "live" | "warn" | "dead";
  /** Required lifecycle events that never arrived. */
  missing: string[];
  /** ADR-0009's mandatory close control, found in the slot. */
  closeControl: boolean;
  /** Whether the render module reported `tpl:mount` — proof it actually ran. */
  templateReported: boolean;
  elapsedMs: number;
}

/**
 * One template, mounted and run once, with its telemetry collected and a verdict
 * produced. A sibling of `VpaidPreview` rather than a fork of it: that component
 * exists to *show* a mechanic to a visitor and reports nothing, while this one
 * exists to *check* one and reports everything. They share no contract beyond
 * both being VPAID hosts.
 *
 * Exactly one of these is mounted at a time, and that is a correctness
 * requirement rather than a layout choice — a VPAID unit publishes itself as the
 * global `window.getVPAIDAd`, so a second live host silently takes over the
 * first one's factory (docs/design-system.md §9).
 */
export function HarnessStage({
  unitKey,
  config,
  width,
  height,
  onRecord,
  onVerdict,
}: {
  unitKey: string;
  config: Record<string, unknown>;
  width: number;
  height: number;
  onRecord: (record: CreativeTelemetryRecord) => void;
  onVerdict: (verdict: HarnessVerdict) => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);

  // The effect runs once per mount — the runner remounts this component with a
  // new key for every run — so both callbacks are read through refs rather than
  // captured, the shape ValidatorStage uses for the same reason.
  const onRecordRef = useRef(onRecord);
  const onVerdictRef = useRef(onVerdict);
  useEffect(() => {
    onRecordRef.current = onRecord;
    onVerdictRef.current = onVerdict;
  });

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    slot.innerHTML = "";

    const startedAt = performance.now();
    const seen = new Set<string>();
    let settled = false;
    // React StrictMode runs this effect twice in development (mount, clean up,
    // mount). Removing a <script> element does not cancel a fetch already in
    // flight, so the first mount's unit still loads and calls `getVPAIDAd` —
    // and since that factory is a global, two live units then drew into the
    // same slot and reported two of every event. Observed, not theorised: the
    // first sweep rendered every creative twice.
    let cancelled = false;

    const settle = () => {
      // `cancelled` as well as `settled`: a verdict from a torn-down mount would
      // advance the sweep on behalf of a run that no longer exists.
      if (settled || cancelled) return;
      settled = true;
      const missing = REQUIRED_EVENTS.filter((name) => !seen.has(name));
      const closeControl = !!slot.querySelector('button[aria-label="Close"]');
      const templateReported = seen.has("tpl:mount");
      const fatal = FATAL_IF_MISSING.some((name) => !seen.has(name));
      onVerdictRef.current({
        tone: fatal
          ? "dead"
          : missing.length || !closeControl || !templateReported
            ? "warn"
            : "live",
        missing,
        closeControl,
        templateReported,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
    };

    const timer = setTimeout(settle, TIMEOUT_MS);

    // Set once the unit exists, so records can be attributed to this run.
    // `postMessage` delivery is asynchronous, so the previous template's
    // teardown `AdStopped` lands *after* this stage has mounted and subscribed
    // — observed during a sweep, where it appeared at the top of the next
    // template's timeline with an `at` from the previous run's clock. A
    // timeline whose whole value is being an accurate record cannot carry
    // another run's events.
    let ownRunId: string | null = null;
    let unitExists = false;

    const unsubscribe = subscribeToCreativeTelemetry((record) => {
      // Two conditions, and the pair degrades safely. Nothing of ours can have
      // been emitted before the unit was constructed, so anything arriving
      // before that is another run's. After that, attribute by run id — but
      // only when there is one to compare: were `_runId` ever to go missing,
      // dropping every record would make the harness silently report each
      // template as never having run, which is far worse than letting the odd
      // stray through.
      if (!unitExists) return;
      if (ownRunId !== null && record.runId !== ownRunId) return;
      seen.add(record.name);
      onRecordRef.current(record);
      // Settle as soon as the lifecycle is complete rather than waiting out the
      // timeout — a five-template sweep would otherwise take a minute of
      // nothing happening.
      if (REQUIRED_EVENTS.every((name) => seen.has(name))) settle();
    });

    // Mirrors VpaidPreview: the videoSlot is what a real player would show for a
    // base video, so it is only visible when the creative actually has one.
    const hasVideo = typeof config.videoUrl === "string" && !!config.videoUrl;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.style.cssText = hasVideo
      ? "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:var(--color-well-screen);"
      : "display:none;";
    slot.appendChild(video);

    let ad: Vpaid | null = null;
    const script = document.createElement("script");
    // The dev route, which reads `runtime/dist/` off disk — not
    // `/api/preview-unit`, which serves the *published* unit from the runtime
    // manifest and would show an edit only after a push to the production CDN.
    // Cache-busted on top of the route's `no-store`, since a <script> src is
    // exactly the kind of thing a browser likes to reuse within a page session.
    script.src = `/api/dev/unit/${encodeURIComponent(unitKey)}?t=${Date.now()}`;
    script.onload = () => {
      if (cancelled) return;
      const factory = (window as unknown as { getVPAIDAd?: () => Vpaid }).getVPAIDAd;
      if (typeof factory !== "function") {
        settle();
        return;
      }
      try {
        ad = factory();
        // Both set before initAd, which is what makes the unit emit its first
        // record.
        ownRunId = ad._runId ?? null;
        unitExists = true;
        ad.initAd(
          width,
          height,
          "normal",
          600,
          { AdParameters: JSON.stringify(config) },
          { slot, videoSlot: video },
        );
        ad.startAd();
      } catch {
        settle();
      }
    };
    script.onerror = () => {
      if (!cancelled) settle();
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
      try {
        ad?.stopAd?.();
      } catch {
        /* noop */
      }
      script.remove();
      slot.innerHTML = "";
    };
    // One run per mount; the runner remounts with a new key to run again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={slotRef}
      className="relative overflow-hidden rounded-ctl bg-well-screen"
      style={{ width, height }}
    />
  );
}
