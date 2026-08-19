"use client";

import { useCallback, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass, Notice } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { HelpLabel } from "@/components/ui/Tooltip";
import {
  DegradedNotice,
  Recommendations,
  ReferenceSections,
  VerdictStrip,
} from "@/components/tools/ValidatorReport";
import { ValidatorTimeline } from "@/components/tools/ValidatorTimeline";
import {
  SDK_LOAD_FAILED,
  ValidatorStage,
  type ResolvedAd,
} from "@/components/validator/ValidatorStage";
import { IMA_SDK_SRC } from "@/components/players/load-ima-sdk";
import type { PlayerEvent } from "@/components/players/types";
// Per-module import: the @/lib/vast-inspect barrel reaches node:dns via the
// fetcher and cannot be bundled for the browser. model.ts is pure.
import type { InspectReport, PixelMode } from "@/lib/vast-inspect/model";

type InputMode = "url" | "xml";

/** Mirrors MAX_PASTED_BYTES on the route, so the user is told before the round trip. */
const MAX_PASTED_BYTES = 256 * 1024;

/**
 * Content clip the ad break interrupts.
 *
 * Served from our own origin rather than a third party's bucket: the validator
 * page should not make a request to anyone else's infrastructure to do its job,
 * and a clip we control cannot disappear from under us.
 *
 * The element that plays it uses `preload="metadata"`, not `auto`. The clip is
 * the *background* a preroll interrupts — IMA pauses it for the whole ad break —
 * so a run only ever plays a few seconds of it.
 */
const INSTREAM_CONTENT_SRC = "/tools/instream-content.mp4";

/**
 * The VAST validator (ADR-0013).
 *
 * One verb. Pressing it mounts the player and fires the inspection at the same
 * time; the player waits for the document and starts the moment it lands. The
 * two used to be separate buttons, which exposed an implementation detail — that
 * analysis and playback are different mechanisms — as if it were a workflow.
 *
 * The order matters and is not cosmetic: the stage must mount inside the click,
 * because `AdDisplayContainer.initialize()` needs user activation and the
 * inspection can take tens of seconds on a long wrapper chain. See the note at
 * the top of ValidatorStage.
 *
 * Nothing is persisted anywhere: the report exists in this component's state and
 * disappears with the page. That is a product decision, not an omission — the
 * tool would otherwise be storing other people's ad tags.
 */
export function VastValidator({ initialTag = "" }: { initialTag?: string }) {
  const { dict } = useLocale();
  const t = dict.tools.validator;

  const [mode, setMode] = useState<InputMode>("url");
  // Seeded from the server, not read from window in an effect: the page already
  // has the query string, so passing it down avoids both a cascading render and
  // a hydration mismatch on a controlled input.
  const [urlValue, setUrlValue] = useState(initialTag);
  const [xmlValue, setXmlValue] = useState("");
  const [pixelMode, setPixelMode] = useState<PixelMode>("dryRun");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<InspectReport | null>(null);

  // `runToken` remounts the stage, which is how a clean re-run works — the same
  // mechanism PreviewPanel uses. 0 means no run has been started.
  const [runToken, setRunToken] = useState(0);
  // The stage refuses to run a stranger's creative on our own origin, and says
  // so here rather than rendering an unexplained empty well.
  const [sandboxMissing, setSandboxMissing] = useState(false);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [resolvedAd, setResolvedAd] = useState<ResolvedAd | null>(null);

  const appendEvent = useCallback((event: PlayerEvent) => {
    setEvents((current) => [...current, event]);
  }, []);

  // The one stage failure with a fix the visitor can apply, so it gets said in
  // prose instead of only as a machine name in the timeline. Read off the event
  // stream rather than tracked separately: the timeline is already the record
  // of what happened, and a second source for the same fact could disagree.
  const sdkBlocked = events.some((event) => event.name === SDK_LOAD_FAILED);

  const value = mode === "url" ? urlValue : xmlValue;

  const validate = useCallback((): string | null => {
    if (mode === "url") {
      if (!urlValue.trim()) return t.errEmptyUrl;
      try {
        const parsed = new URL(urlValue.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return t.errBadUrl;
      } catch {
        return t.errBadUrl;
      }
      return null;
    }
    if (!xmlValue.trim()) return t.errEmptyXml;
    if (new Blob([xmlValue]).size > MAX_PASTED_BYTES) return t.errTooLarge;
    return null;
  }, [mode, urlValue, xmlValue, t]);

  async function run() {
    const problem = validate();
    if (problem) {
      setError(problem);
      setReport(null);
      setRunToken(0);
      return;
    }

    setRunning(true);
    setError(null);
    setReport(null);
    setEvents([]);
    setResolvedAd(null);
    // Synchronous, before the await: this is what keeps the SDK's
    // `initialize()` inside the user gesture that started the run.
    setRunToken((token) => token + 1);

    try {
      const response = await fetch("/api/tools/vast/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, value, pixelMode }),
      });
      const data = (await response.json()) as InspectReport | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : t.errRequest);
        // Nothing will ever be handed to the player, so take the stage down
        // rather than leaving a black rectangle waiting on a document.
        setRunToken(0);
        return;
      }
      setReport(data);
      if (mode === "url") {
        const next = new URL(window.location.href);
        next.searchParams.set("tag", urlValue.trim());
        window.history.replaceState(null, "", next.toString());
      }
    } catch {
      setError(t.errRequest);
      setRunToken(0);
    } finally {
      setRunning(false);
    }
  }

  const playback = report?.playback ?? null;
  const started = runToken > 0;
  const unplayable =
    report !== null && !report.playback.adsResponse && !report.playback.adTagUrl;

  // The delivery standard the tag actually declares — the well's strip states
  // what the request proved, so an em dash is the honest reading when the tag
  // declares no interactive framework at all rather than inventing "VAST".
  const standardLabel =
    report?.interactive.filter((hit) => hit.present).map((hit) => hit.standard).join(" + ") || "—";

  const inputLabel = mode === "url" ? t.inputLabelUrl : t.inputLabelXml;

  return (
    <div className="flex flex-col gap-4">
      {/* Player left, controls right — the instrument layout (§6 "Free tools").
          `grid-cols-1` is not redundant with the default: a bare `grid` gives one
          `auto` track, which sizes to its widest item — and the timeline table is
          wider than a phone. `grid-cols-*` is `minmax(0, 1fr)`, which caps the
          track at the container and lets the table scroll inside its own box. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          {/* The one dark surface on the page (§7). Clipping lives on the inner
              screen rectangle, not here — same shape as PreviewPanel, so a focus
              ring inside the well is never cut off (§3). */}
          <div className="rounded-ctl bg-well p-3">
            {/* Serving well, not demo well: a real ad request happened, so the
                strip states the fixed facts of that request (§7). Both values
                come from the report, so nothing is fabricated — which is what §7
                forbids on a well that made no request. */}
            <div className="flex items-center justify-between gap-3 pb-3">
              <span className="data-instr text-[11px] uppercase tracking-[0.09em] text-well-fg">
                {t.standard} · {standardLabel}
              </span>
              {report?.chain[0]?.elapsedMs ? (
                <span className="inline-flex items-center gap-1.5 text-well-live">
                  <span className="size-1.5 rounded-full bg-well-live" />
                  <span className="data-instr text-[11px] uppercase tracking-[0.09em]">
                    {t.responded} · {report.chain[0].elapsedMs} {t.ms}
                  </span>
                </span>
              ) : null}
            </div>

            {started ? (
              <ValidatorStage
                key={runToken}
                runToken={runToken}
                playback={playback}
                contentSrc={INSTREAM_CONTENT_SRC}
                onEvent={appendEvent}
                onAdResolved={setResolvedAd}
                onUnavailable={() => setSandboxMissing(true)}
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-ctl bg-well-screen px-6">
                {/* Human prose, so sans at the caption role — the well's mono is
                    for machine readouts, not for sentences (§4, §7). */}
                <p className="max-w-[52ch] text-center text-xs leading-4 text-well-fg">
                  {t.wellIdle}
                </p>
              </div>
            )}
          </div>

          {sandboxMissing && <Notice tone="dead">{t.sandboxUnavailable}</Notice>}

          {unplayable && <Notice tone="warn">{t.playerUnavailable}</Notice>}

          {/* Under the well, because it explains the black rectangle above it.
              `info`, not `dead`: the tag is not at fault and neither is the
              report — the condition is this browser, and the notice names the
              address to allow (§3, §7). */}
          {sdkBlocked && (
            <Notice tone="info" live detail={IMA_SDK_SRC}>
              {t.sdkBlocked}
            </Notice>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <span className="label-instr">{t.inputMode}</span>
          <Segmented
            label={t.inputMode}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError(null);
            }}
            options={[
              { value: "url", label: t.modeUrl },
              { value: "xml", label: t.modeXml },
            ]}
          />
          </div>

          <div className="flex flex-col gap-2">
            {/* Not a <label> wrapper: the legend is itself the tooltip trigger
                (§6), and a button inside a <label> would toggle the field on
                click. The input is associated by id instead. */}
            <span id="validator-input-label">
              <HelpLabel label={inputLabel} help={t.inputHelp} />
            </span>
            {mode === "url" ? (
              <input
                aria-labelledby="validator-input-label"
                type="url"
                inputMode="url"
                spellCheck={false}
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder={t.placeholderUrl}
                className={inputClass}
              />
            ) : (
              <textarea
                aria-labelledby="validator-input-label"
                rows={6}
                spellCheck={false}
                value={xmlValue}
                onChange={(event) => setXmlValue(event.target.value)}
                placeholder={t.placeholderXml}
                className={`${inputClass} resize-y whitespace-pre`}
              />
            )}
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-2">
              <HelpLabel label={t.pixels} help={t.pixelsHelp} />
              <Segmented
                label={t.pixels}
                value={pixelMode}
                onChange={setPixelMode}
                options={[
                  { value: "dryRun", label: t.pixelsDry },
                  { value: "live", label: t.pixelsLive },
                ]}
              />
            </div>

            {/* The one primary on the page — the whole accent budget (§3). */}
            <Button variant="primary" onClick={run} disabled={running}>
              {running ? `${t.running}…` : t.run}
            </Button>
          </div>

          {error && (
            <p role="alert" className="flex items-center gap-2 text-[13px] leading-5 text-dead-fg">
              <AlertCircle aria-hidden className="size-4 shrink-0" />
              {error}
            </p>
          )}

          {report && (
            <>
              <DegradedNotice report={report} />
              <VerdictStrip report={report} />
            </>
          )}
        </section>
      </div>

      {/* Full width and stacked, not a second two-column row. The timeline is a
          four-column table carrying URLs: in half the page it could not fit its
          own tracker column and grew a horizontal scrollbar, which is the one
          thing a readout must not need (§5 — wide content scrolls in its own
          box, but a box this shape should not be narrow in the first place). */}
      {started && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold leading-[22px]">{t.sectionTimeline}</h2>
          <ValidatorTimeline events={events} trackers={report?.trackers ?? []} />
        </section>
      )}

      {report && <Recommendations findings={report.findings} />}

      {report && <ReferenceSections report={report} resolvedAd={resolvedAd} />}
    </div>
  );
}

/** Kept so the settings strip and the report share one button treatment. */
export { buttonClass };
