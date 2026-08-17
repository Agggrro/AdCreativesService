"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { buttonClass } from "@/components/ui/Button";
import { StateWord } from "@/components/ui/State";
import { CELL, HEAD, NUM_HEAD, ROW, TableFrame, TableHead, railCell } from "@/components/ui/Table";
import { ValidatorTimeline } from "@/components/tools/ValidatorTimeline";
import { toPlayerEvent, type CreativeTelemetryRecord } from "@/components/players/telemetry";
import { HarnessStage, type HarnessVerdict } from "./HarnessStage";

export interface HarnessTemplate {
  id: string;
  name: string;
  unitKey: string;
  config: Record<string, unknown>;
}

/**
 * Slot sizes worth checking a creative against. Three 16:9 steps catch a layout
 * that only works at one scale (the usual bug: a size derived from `clientWidth`
 * at mount), and the 300×250 rectangle catches one that assumes 16:9 outright.
 */
const SIZES = [
  { value: "640x360", label: "640×360" },
  { value: "480x270", label: "480×270" },
  { value: "320x180", label: "320×180" },
  { value: "300x250", label: "300×250" },
] as const;

type SizeKey = (typeof SIZES)[number]["value"];

/**
 * Short enough that a five-template sweep finishes in about twenty seconds
 * rather than two minutes. The base reads this straight from AdParameters, so
 * the quartile timer honours it; a creative with a base video paces itself off
 * the video instead and simply takes longer.
 */
const HARNESS_DURATION_SECONDS = 4;

function parseSize(key: SizeKey): { width: number; height: number } {
  const [width, height] = key.split("x").map(Number);
  return { width, height };
}

/**
 * The creative harness: run one template, or sweep all of them, and read back
 * what the unit actually did.
 *
 * Templates run **one at a time**, and that is a correctness constraint rather
 * than a layout preference — VPAID units share the `window.getVPAIDAd` global,
 * so a grid of live units would render the last one loaded five times over
 * (docs/design-system.md §9). A sweep is therefore sequential: each template is
 * mounted, allowed to complete its lifecycle, judged, and unmounted before the
 * next one starts.
 */
export function HarnessRunner({
  templates,
  initialTemplateId,
  initialSize,
}: {
  templates: HarnessTemplate[];
  initialTemplateId?: string;
  initialSize?: SizeKey;
}) {
  const [manualId, setManualId] = useState(initialTemplateId ?? templates[0]?.id ?? "");
  const [sweepIndex, setSweepIndex] = useState<number | null>(null);
  const [size, setSize] = useState<SizeKey>(initialSize ?? "640x360");
  const [runToken, setRunToken] = useState(0);
  const [records, setRecords] = useState<CreativeTelemetryRecord[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, HarnessVerdict>>({});

  const sweeping = sweepIndex !== null;
  const currentId = sweeping ? templates[sweepIndex].id : manualId;
  const current = templates.find((t) => t.id === currentId);
  const { width, height } = parseSize(size);

  const startRun = (templateId: string) => {
    setManualId(templateId);
    setRecords([]);
    setRunToken((t) => t + 1);
  };

  const startSweep = () => {
    setVerdicts({});
    setRecords([]);
    setSweepIndex(0);
    setRunToken((t) => t + 1);
  };

  const handleVerdict = (verdict: HarnessVerdict) => {
    setVerdicts((prev) => ({ ...prev, [currentId]: verdict }));
    if (sweepIndex === null) return;
    const next = sweepIndex + 1;
    if (next < templates.length) {
      setSweepIndex(next);
      setRecords([]);
      setRunToken((t) => t + 1);
    } else {
      // Hand the manual selection the template the sweep ended on before
      // clearing it. `currentId` falls back to `manualId` the moment
      // `sweepIndex` is null, so leaving it pointing at whatever was selected
      // before the sweep changes the stage's key and silently starts a sixth
      // run — of a template whose verdict has already been recorded.
      setManualId(templates[sweepIndex].id);
      setSweepIndex(null);
    }
  };

  if (!current) {
    return (
      <p className="text-[15px] leading-6 text-fg-secondary">
        No template has a resolvable VPAID unit. Run{" "}
        <code className="data-instr text-[13px]">npm run db:seed</code>, then{" "}
        <code className="data-instr text-[13px]">npm run build:runtime</code>.
      </p>
    );
  }

  // The harness owns the pacing, so the duration is injected rather than left to
  // each template's own default.
  const config = { ...current.config, durationSeconds: HARNESS_DURATION_SECONDS };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <ControlGroup label="Template">
            <Segmented
              label="Template"
              wrap
              value={currentId}
              onChange={startRun}
              options={templates.map((t) => ({
                value: t.id,
                label: t.unitKey,
                disabled: sweeping,
              }))}
            />
          </ControlGroup>
          <ControlGroup label="Slot size">
            <Segmented
              label="Slot size"
              value={size}
              onChange={(next) => {
                setSize(next);
                startRun(currentId);
              }}
              options={SIZES.map((s) => ({ ...s, disabled: sweeping }))}
            />
          </ControlGroup>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => startRun(currentId)}
            disabled={sweeping}
            className={buttonClass("secondary")}
          >
            Restart
          </button>
          <button
            type="button"
            onClick={startSweep}
            disabled={sweeping}
            className={buttonClass("primary")}
          >
            {/* The counter is mono with tabular-nums, or the primary's width
                jitters as it advances (§4). */}
            {sweeping ? (
              <>
                Running{" "}
                <span className="data-instr">
                  {sweepIndex + 1} / {templates.length}
                </span>
              </>
            ) : (
              "Run all"
            )}
          </button>
        </div>
      </div>

      {/* The one dark surface (docs/design-system.md §7): a creative is judged
          against black. One well, one live unit.

          No instrument strip. §7 makes that conditional on an ad request having
          happened, and none does here — the unit is loaded straight off disk,
          with no tag, no mint and no latency, which is §7's demo well. The two
          things a strip would have said are already on screen anyway: the unit
          key is the current segment above, and the size is the well's own
          dimensions. */}
      <div className="w-fit rounded-ctl bg-well p-3">
        <HarnessStage
          key={`${currentId}-${runToken}`}
          unitKey={current.unitKey}
          config={config}
          width={width}
          height={height}
          onRecord={(record) => setRecords((prev) => [...prev, record])}
          onVerdict={handleVerdict}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold leading-[22px]">Lifecycle</h2>
        <VerdictTable templates={templates} verdicts={verdicts} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold leading-[22px]">Run timeline</h2>
        {/* The validator's timeline, not a second one: same `PlayerEvent` input,
            same rails, same head band. §6 — one implementation per repeated
            element. */}
        <ValidatorTimeline events={records.map(toPlayerEvent)} />
      </section>
    </div>
  );
}

/**
 * A label above a control. Deliberately not named `Field` — `ui/Field.tsx`
 * exports a different component under that name, and two `Field`s one import
 * apart is a trap for whoever edits this next.
 */
function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label-instr text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

/**
 * One row per template, railed on its verdict. Templates that have not run
 * carry no rail — a rail on every row teaches the reader it means nothing
 * (docs/design-system.md §6).
 */
function VerdictTable({
  templates,
  verdicts,
}: {
  templates: HarnessTemplate[];
  verdicts: Record<string, HarnessVerdict>;
}) {
  return (
    <TableFrame>
      <table className="w-full border-collapse text-[13px] leading-5">
        <TableHead>
          <th className={HEAD}>Template</th>
          <th className={HEAD}>Verdict</th>
          <th className={HEAD}>Missing</th>
          <th className={HEAD}>Close</th>
          <th className={NUM_HEAD}>ms</th>
        </TableHead>
        <tbody>
          {templates.map((template) => {
            const verdict = verdicts[template.id];
            return (
              <tr key={template.id} className={ROW}>
                <td className={railCell(verdict?.tone ?? null)}>
                  <span className="data-instr">{template.unitKey}</span>
                </td>
                <td className={CELL}>
                  {verdict ? (
                    <StateWord
                      tone={verdict.tone}
                      label={
                        verdict.tone === "live"
                          ? "pass"
                          : verdict.tone === "dead"
                            ? "never ran"
                            : "incomplete"
                      }
                    />
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className={CELL}>
                  {verdict ? (
                    // A run that missed nothing is a real reading, so it prints
                    // `0` — the em dash is reserved for a row that has not run
                    // and has nothing to measure (§6, zero versus dash).
                    <span className="data-instr text-fg-secondary">
                      {[
                        ...verdict.missing,
                        verdict.templateReported ? null : "tpl:mount",
                      ]
                        .filter(Boolean)
                        .join(" ") || "0"}
                    </span>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className={CELL}>
                  {verdict ? (
                    // `warn`, not `dead`, so one fault does not wear two
                    // severities: the rail grades a missing close control as
                    // warn (the ad ran, something mandatory is absent), and a
                    // red word beside a violet rail on the same row would make
                    // §3's three-step scale mean nothing.
                    <StateWord
                      tone={verdict.closeControl ? "live" : "warn"}
                      label={verdict.closeControl ? "yes" : "no"}
                    />
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className={`${CELL} data-instr text-right`}>
                  {verdict ? verdict.elapsedMs : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}

