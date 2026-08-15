"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Button, buttonClass } from "@/components/ui/Button";
import { inputClass, Notice } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { ValidatorReport } from "@/components/tools/ValidatorReport";
import { ParserVsPlayer, ValidatorTimeline } from "@/components/tools/ValidatorTimeline";
import { ValidatorStage, type ResolvedAd, type VpaidMode } from "@/components/validator/ValidatorStage";
import type { PlayerEvent } from "@/components/players/types";
// Per-module imports: the @/lib/vast-inspect barrel reaches node:dns via the
// fetcher and cannot be bundled for the browser. These two modules are pure.
import type { InspectReport, PixelMode, Placement } from "@/lib/vast-inspect/model";
import { renderReportText } from "@/lib/vast-inspect/render-text";

type InputMode = "url" | "xml";

/** Mirrors MAX_PASTED_BYTES on the route, so the user is told before the round trip. */
const MAX_PASTED_BYTES = 256 * 1024;

/**
 * Content clip for the instream placement.
 *
 * Served from our own origin rather than a third party's bucket: the validator
 * page should not make a request to anyone else's infrastructure to do its job,
 * and a clip we control cannot disappear from under us.
 *
 * The element that plays it uses `preload="metadata"`, not `auto`. The clip is
 * the *background* an instream preroll interrupts — IMA pauses it for the whole
 * ad break — so a run only ever plays a few seconds of it. Preloading the entire
 * file would spend the visitor's bandwidth on video nobody watches.
 */
const INSTREAM_CONTENT_SRC = "/tools/instream-content.mp4";

/**
 * The VAST validator (ADR-0013).
 *
 * Holds the run settings, calls the inspection endpoint, and renders the
 * report. Playback is a separate concern layered on top of `report.playback`.
 *
 * Nothing is persisted anywhere: the report exists in this component's state
 * and leaves only if the user copies or downloads it. That is a product
 * decision, not an omission — the tool would otherwise be storing other
 * people's ad tags.
 */
export function VastValidator({ initialTag = "" }: { initialTag?: string }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;

  const [mode, setMode] = useState<InputMode>("url");
  // Seeded from the server, not read from window in an effect: the page already
  // has the query string, so passing it down avoids both a cascading render and
  // a hydration mismatch on a controlled input.
  const [urlValue, setUrlValue] = useState(initialTag);
  const [xmlValue, setXmlValue] = useState("");
  const [placement, setPlacement] = useState<Placement>("instream");
  const [pixelMode, setPixelMode] = useState<PixelMode>("dryRun");
  const [vpaidMode, setVpaidMode] = useState<VpaidMode>("insecure");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<InspectReport | null>(null);
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Playback is separate state from the report: a report can be read without
  // ever starting the player, and re-running the player must not re-run the
  // analysis. `runToken` remounts the stage, which is how a clean restart works
  // — the same mechanism PreviewPanel uses.
  const [runToken, setRunToken] = useState(0);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [resolvedAd, setResolvedAd] = useState<ResolvedAd | null>(null);

  /**
   * Which pixel mode the current report was built for.
   *
   * The document handed to the player is baked into the report at check time —
   * dry-run neutralizes it, live does not — so moving the toggle afterwards
   * cannot change what plays. Without this the control silently lied: a user who
   * checked in live mode, then switched to "do not fire" and pressed play, still
   * fired real pixels at a third party while the help text under the control
   * promised the opposite. Comparing against this makes the staleness visible
   * and blocks playback until the check is re-run.
   */
  const [pixelModeAtCheck, setPixelModeAtCheck] = useState<PixelMode | null>(null);
  const playbackStale = report !== null && pixelModeAtCheck !== pixelMode;

  const appendEvent = useCallback((event: PlayerEvent) => {
    setEvents((current) => [...current, event]);
  }, []);

  function startPlayback() {
    setEvents([]);
    setResolvedAd(null);
    setRunToken((token) => token + 1);
  }

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
      return;
    }

    setRunning(true);
    setError(null);
    setReport(null);
    setEvents([]);
    setResolvedAd(null);
    setRunToken(0);

    try {
      const response = await fetch("/api/tools/vast/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, value, pixelMode }),
      });
      const data = (await response.json()) as InspectReport | { error: string };
      if (!response.ok || "error" in data) {
        setError("error" in data ? data.error : t.errRequest);
        return;
      }
      setReport(data);
      setPixelModeAtCheck(pixelMode);
      if (mode === "url") {
        const next = new URL(window.location.href);
        next.searchParams.set("tag", urlValue.trim());
        window.history.replaceState(null, "", next.toString());
      }
      // The report is long; without this the page stays at the form and the
      // result looks like nothing happened.
      requestAnimationFrame(() =>
        reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch {
      setError(t.errRequest);
    } finally {
      setRunning(false);
    }
  }

  function reportText(): string {
    return report ? renderReportText(report, locale) : "";
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportText());
      setCopied(true);
      // Label swap rather than a toast — the CopyButton precedent (§8).
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t.errRequest);
    }
  }

  function download(contents: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const playback = report?.playback;
  const playable = Boolean(playback?.adsResponse || playback?.adTagUrl);

  // The delivery standard the tag actually declares — the well's strip states
  // what the request proved, so an em dash is the honest reading when the tag
  // declares no interactive framework at all rather than inventing "VAST".
  const standardLabel =
    report?.interactive.filter((hit) => hit.present).map((hit) => hit.standard).join(" + ") || "—";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Segmented
            label={t.settings}
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

          <label className="flex flex-col gap-2">
            <span className="label-instr">
              {mode === "url" ? t.inputLabelUrl : t.inputLabelXml}
            </span>
            {mode === "url" ? (
              <input
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
                rows={10}
                spellCheck={false}
                value={xmlValue}
                onChange={(event) => setXmlValue(event.target.value)}
                placeholder={t.placeholderXml}
                className={`${inputClass} resize-y whitespace-pre`}
              />
            )}
          </label>
        </div>

        {/* Every control carries its help text (§6 Inputs). "Insecure" is the
            least self-explanatory and most consequential choice here, so it is
            the last one that should ship without an explanation. */}
        <div className="grid items-start gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="label-instr">{t.placement}</span>
            <Segmented
              fill
              label={t.placement}
              value={placement}
              onChange={setPlacement}
              options={[
                { value: "instream", label: t.placementInstream },
                { value: "outstream", label: t.placementOutstream },
              ]}
            />
            <span className="text-xs leading-4 text-fg-muted">{t.placementHint}</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label-instr">{t.pixels}</span>
            <Segmented
              fill
              label={t.pixels}
              value={pixelMode}
              onChange={setPixelMode}
              options={[
                { value: "dryRun", label: t.pixelsDry },
                { value: "live", label: t.pixelsLive },
              ]}
            />
            <span className="text-xs leading-4 text-fg-muted">
              {pixelMode === "dryRun" ? t.pixelsHintDry : t.pixelsHintLive}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label-instr">{t.vpaidMode}</span>
            <Segmented
              fill
              label={t.vpaidMode}
              value={vpaidMode}
              onChange={setVpaidMode}
              options={[
                { value: "enabled", label: t.vpaidEnabled },
                { value: "insecure", label: t.vpaidInsecure },
                { value: "disabled", label: t.vpaidDisabled },
              ]}
            />
            <span className="text-xs leading-4 text-fg-muted">{t.vpaidHint}</span>
          </div>
        </div>

        {/* The one primary on the page — the whole accent budget (§3). */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={run} disabled={running}>
            {running ? `${t.running}…` : t.run}
          </Button>
          {report && (
            <>
              <Button variant="secondary" onClick={copyReport}>
                {copied ? t.copiedReport : t.copyReport}
              </Button>
              <Button
                variant="secondary"
                onClick={() => download(reportText(), `vast-report-${stamp}.txt`, "text/plain")}
              >
                {t.downloadReport}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  download(
                    JSON.stringify(report, null, 2),
                    `vast-report-${stamp}.json`,
                    "application/json",
                  )
                }
              >
                {t.downloadJson}
              </Button>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 text-[13px] leading-5 text-dead-fg">
            <AlertCircle aria-hidden className="size-4 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {report && (
        <div ref={reportRef} className="flex flex-col gap-6">
          <Notice tone={report.playback.mode === "dryRun" ? "info" : "warn"}>
            {report.playback.mode === "dryRun" ? t.dryRunNotice : t.liveNotice}
          </Notice>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold leading-[22px]">{t.sectionPlayer}</h2>
              {playable && !playbackStale && (
                <Button variant="secondary" onClick={startPlayback}>
                  {runToken === 0 ? t.startPlayback : t.restartPlayback}
                </Button>
              )}
            </div>

            {/* The analysis above is still valid — only the document prepared
                for the player is stale — so the report stays on screen and just
                the play control goes away. */}
            {playbackStale && <Notice tone="warn">{t.pixelModeChanged}</Notice>}

            {/* The one dark surface on the page (§7). Clipping lives on the
                inner screen rectangle, not here — same shape as PreviewPanel,
                so a focus ring inside the well is never cut off (§3). */}
            <div className="rounded-ctl bg-well p-3">
              {/* Serving well, not demo well: a real ad request happened, so the
                  strip states the fixed facts of that request (§7). Both values
                  come from the report — the standard the tag actually declared
                  and the measured first-hop time — so nothing is fabricated,
                  which is what §7 forbids on a well that made no request. */}
              <div className="flex items-center justify-between gap-3 pb-3">
                <span className="data-instr text-[11px] uppercase tracking-[0.09em] text-well-fg">
                  {t.standard} · {standardLabel}
                </span>
                {report.chain[0]?.elapsedMs ? (
                  <span className="inline-flex items-center gap-1.5 text-well-live">
                    <span className="size-1.5 rounded-full bg-well-live" />
                    <span className="data-instr text-[11px] uppercase tracking-[0.09em]">
                      {t.responded} · {report.chain[0].elapsedMs} {t.ms}
                    </span>
                  </span>
                ) : null}
              </div>

              {playable && runToken > 0 ? (
                <ValidatorStage
                  key={runToken}
                  runToken={runToken}
                  playback={report.playback}
                  placement={placement}
                  vpaidMode={vpaidMode}
                  contentSrc={INSTREAM_CONTENT_SRC}
                  onEvent={appendEvent}
                  onAdResolved={setResolvedAd}
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-ctl bg-well-screen px-6">
                  {/* Human prose, so sans at the caption role — the well's mono
                      is for machine readouts, not for sentences (§4, §7). */}
                  <p className="max-w-[52ch] text-center text-xs leading-4 text-well-fg">
                    {playable ? t.startPlayback : t.playerUnavailable}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3 border-t border-hairline pt-6">
            <h2 className="text-[15px] font-semibold leading-[22px]">{t.sectionTimeline}</h2>
            <ValidatorTimeline events={events} />
            {resolvedAd && <ParserVsPlayer facts={report.facts} resolved={resolvedAd} />}
          </section>

          <ValidatorReport report={report} />

          <p className="max-w-[66ch] border-t border-hairline pt-6 text-xs leading-4 text-fg-muted">
            {t.shareHint}
          </p>
        </div>
      )}
    </div>
  );
}

/** Kept so the settings strip and the report share one button treatment. */
export { buttonClass };
