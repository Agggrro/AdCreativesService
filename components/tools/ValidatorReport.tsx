"use client";

import { Fragment } from "react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { LOCALE_TAG, type Dict } from "@/lib/i18n/dictionaries";
import { Chip } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Field";
import { HelpLabel } from "@/components/ui/Tooltip";
import { RAIL, StateWord, type Tone } from "@/components/ui/State";
import {
  CELL_TIGHT,
  HEAD_TIGHT,
  NUM_HEAD_TIGHT,
  railCellTight,
  railRow,
  ROW,
  TableFrame,
  TableHead,
} from "@/components/ui/Table";
import { ParserVsPlayer } from "@/components/tools/ValidatorTimeline";
import type { ResolvedAd } from "@/components/validator/ValidatorStage";
// Imported per-module rather than through @/lib/vast-inspect: the barrel reaches
// chain.ts → fetch-tag.ts, which imports node:dns and node:http. Pulling that
// into a client component would break the bundle. model.ts and errors-iab.ts
// are pure and safe here.
import type { Finding, Hop, InspectReport, Severity } from "@/lib/vast-inspect/model";
import { describeIabError } from "@/lib/vast-inspect/errors-iab";

/** Severity → semantic tone. The whole reason --color-warn exists (§3). */
const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "dead",
  warning: "warn",
  advisory: "info",
};

/** Most severe first, which is also the order the reader needs them in. */
const SEVERITY_ORDER: Severity[] = ["error", "warning", "advisory"];

type ValidatorDict = Dict["tools"]["validator"];

/**
 * Byte size with a localized unit.
 *
 * The unit goes through the dictionary like any other interface word: an error
 * message reading "256 КБ" beside a table reading "256 KB" is one screen
 * speaking two languages (§8).
 */
function formatBytes(bytes: number, tag: string, t: ValidatorDict): string {
  if (bytes < 1024) return `${bytes} ${t.unitBytes}`;
  const value = bytes < 1024 * 1024 ? bytes / 1024 : bytes / (1024 * 1024);
  const unit = bytes < 1024 * 1024 ? t.unitKb : t.unitMb;
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

/** One `LABEL value` pair on the verdict strip. */
function Reading({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="label-instr">{label}</span>
      <span className="data-instr text-[13px] text-fg">{value}</span>
    </span>
  );
}

/** An empty section body, so "nothing found" never looks like a failed render. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-ctl border border-hairline bg-surface px-4 py-4">
      <p className="text-[13px] leading-5 text-fg-muted">{children}</p>
    </div>
  );
}

/* ---------- verdict ---------- */

/**
 * The whole outcome in two lines.
 *
 * This was four metric tiles at 22px, which spent roughly 180px of vertical
 * space on six numbers. A verdict is read at a glance or not at all; the tiles
 * made it something you scrolled to.
 */
export function VerdictStrip({ report }: { report: InspectReport }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const tag = LOCALE_TAG[locale];
  const number = new Intl.NumberFormat(tag);

  const verdictTone: Tone =
    report.verdict === "fail" ? "dead" : report.verdict === "warn" ? "warn" : "live";
  const verdictLabel =
    report.verdict === "fail"
      ? t.verdictFail
      : report.verdict === "warn"
        ? t.verdictWarn
        : t.verdictPass;

  return (
    <div className="flex flex-col gap-2 rounded-ctl border border-hairline bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <StateWord tone={verdictTone} label={verdictLabel} />
        {/* Label then count, not count then label: it is the only order that
            stays grammatical in Russian at every number, and it is the
            instrument-panel reading anyway. See lib/i18n/dictionaries.ts. */}
        <span className="data-instr text-[13px] text-fg-secondary">
          {t.countErrors} {number.format(report.counts.error)} ·{" "}
          {t.countWarnings} {number.format(report.counts.warning)} ·{" "}
          {t.countAdvisories} {number.format(report.counts.advisory)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-fill pt-2">
        <Reading label={t.version} value={report.declaredVersion ?? t.versionUnknown} />
        <Reading label={t.ads} value={number.format(report.adCount)} />
        <Reading label={t.hops} value={number.format(report.chain.length)} />
        <Reading label={t.downloaded} value={formatBytes(report.source.bytes, tag, t)} />
      </div>
    </div>
  );
}

/* ---------- recommendations ---------- */

/**
 * Every finding, grouped by severity, under one heading.
 *
 * There used to be two blocks here: a per-rule "Findings" list and a curated
 * "Recommendations" list under it that restated the same problems at a higher
 * altitude. Saying a thing twice at two altitudes teaches the reader to skim
 * both, and the curated text was already carried by each rule's own `hint`
 * (ADR-0020).
 *
 * Takes the data-table row treatment but not the `<table>` element: each row
 * expands to show the fix, and a disclosure inside a table cell is both awkward
 * markup and awkward for a screen reader. The outcome matrix set this precedent
 * (§6).
 *
 * These rows are deliberately **not** at the readout density, even though the
 * page around them is: a row you can act on takes the full 44px treatment, and
 * every row here opens.
 */
export function Recommendations({ findings }: { findings: Finding[] }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const severityLabel: Record<Severity, string> = {
    error: t.severityError,
    warning: t.severityWarning,
    advisory: t.severityAdvisory,
  };

  const heading = (
    <h2>
      <HelpLabel
        label={t.sectionRecommendations}
        help={t.recommendationsHelp}
        className="text-[15px] font-semibold leading-[22px]"
      />
    </h2>
  );

  if (findings.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        {heading}
        <EmptyNote>{t.noFindings}</EmptyNote>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {heading}
      {/* Not `Panel`: it sets overflow-hidden, which clips the 2px-offset focus
          ring on each summary row (§3). Rounded ends instead.

          Groups are fragments rather than wrapper elements so every band and row
          is a direct child of this container. Wrapping each group in a `<div>`
          made `railRow`'s `last:rounded-b-ctl` fire on the last row of *every*
          group, rounding rails in the middle of the panel. */}
      <div className="rounded-ctl border border-hairline bg-surface">
        {SEVERITY_ORDER.map((severity) => {
          const group = findings.filter((finding) => finding.severity === severity);
          if (group.length === 0) return null;
          const tone = SEVERITY_TONE[severity];

          return (
            <Fragment key={severity}>
              {/* The group band is what makes severity legible from the shape of
                  the page rather than only from a word on every row (§6). */}
              <div
                className={`flex items-center gap-2 border-b border-fill border-l-[3px] bg-surface-sunken py-2 pl-[13px] pr-4 ${RAIL[tone]}`}
              >
                <StateWord tone={tone} label={severityLabel[severity]} />
                <span className="data-instr text-[13px] text-fg-muted">{group.length}</span>
              </div>

              {group.map((finding, index) => (
                <details
                  key={`${finding.ruleId}-${finding.hop}-${finding.path}-${index}`}
                  className={railRow(tone)}
                >
                  <summary className="flex cursor-pointer list-none flex-col gap-0.5 py-3 pl-[13px] pr-4 hover:bg-surface-sunken">
                    <span className="text-[13px] leading-5">{finding.message[locale]}</span>
                    <code className="data-instr block max-w-full truncate text-[13px] text-fg-muted">
                      {finding.path}
                      {finding.line ? `:${finding.line}` : ""}
                      {finding.hop > 0 ? ` · ${t.colHop} ${finding.hop}` : ""}
                    </code>
                  </summary>

                  <div className="flex flex-col gap-2 pb-4 pl-[13px] pr-4">
                    {finding.offending && (
                      <div className="overflow-x-auto rounded-ctl bg-surface-sunken px-3 py-2">
                        <code className="data-instr whitespace-pre text-[13px] text-fg-secondary">
                          {finding.offending}
                        </code>
                      </div>
                    )}
                    <p className="max-w-[66ch] text-[13px] leading-5 text-fg-secondary">
                      {finding.hint[locale]}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="data-instr text-xs leading-4 text-fg-muted">
                        {finding.ruleId}
                      </span>
                      <a
                        href={finding.spec.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs leading-4 text-fg-muted underline underline-offset-4 hover:text-fg-secondary"
                      >
                        <span className="data-instr">
                          {finding.spec.doc} {finding.spec.section}
                        </span>
                      </a>
                      {finding.iabErrorCode !== undefined && (
                        <span className="data-instr text-xs leading-4 text-fg-muted">
                          {t.iabCode} {describeIabError(finding.iabErrorCode, locale)}
                        </span>
                      )}
                    </div>
                  </div>
                </details>
              ))}
            </Fragment>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- reference tables ---------- */

/**
 * A collapsed reference table.
 *
 * These four answer a follow-up question, not the question the visitor arrived
 * with — "is my tag broken" is answered above, in the verdict and the
 * recommendations. Expanded by default they turned the page into a document you
 * scroll rather than a panel you read.
 */
function Fold({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-fill last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium leading-5 hover:bg-surface-sunken">
        {/* Open/closed is encoded in form, not only in what is visible below it
            (§9): the marker turns. */}
        <span
          aria-hidden
          className="text-fg-muted transition-transform duration-[120ms] group-open:rotate-90"
        >
          ▸
        </span>
        {title}
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Interactive({ report }: { report: InspectReport }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;

  return (
    <TableFrame>
      <table className="w-full min-w-[480px] border-collapse">
        <TableHead>
          <th className={HEAD_TIGHT}>{t.colKind}</th>
          <th className={HEAD_TIGHT}>{t.colFound}</th>
          <th className={HEAD_TIGHT}>{t.colWhere}</th>
        </TableHead>
        <tbody>
          {report.interactive.map((hit) => (
            <tr key={hit.standard} className={ROW}>
              {/* Present is a real state and rails `info` — it is a fact about
                  the tag, not a health verdict. Absent has no state, so no
                  rail: a rail on every row would mean nothing (§6). */}
              <td className={railCellTight(hit.present ? "info" : null)}>
                <span className="flex items-center">
                  <Chip>{hit.standard}</Chip>
                </span>
              </td>
              <td className={`${CELL_TIGHT} whitespace-nowrap`}>
                <StateWord
                  tone={hit.present ? "live" : "idle"}
                  label={hit.present ? t.found : t.notFound}
                />
              </td>
              <td className={CELL_TIGHT}>
                <div className="flex flex-col gap-0.5">
                  {hit.resource && (
                    <code className="data-instr block max-w-[52ch] truncate text-[13px] text-fg-secondary">
                      {hit.resource}
                    </code>
                  )}
                  {hit.notes.map((note, index) => (
                    <p key={index} className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">
                      {note[locale]}
                    </p>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function Features({ report }: { report: InspectReport }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;

  return (
    <TableFrame>
      <table className="w-full min-w-[480px] border-collapse">
        <TableHead>
          <th className={HEAD_TIGHT}>{t.colFeature}</th>
          <th className={HEAD_TIGHT}>{t.colSince}</th>
          <th className={HEAD_TIGHT}>{t.colFound}</th>
        </TableHead>
        <tbody>
          {/* No rail anywhere in this table on purpose: "your tag has no
              Mezzanine" is an absence, not a state (docs/design-system.md §6). */}
          {report.features.map((feature) => (
            <tr key={feature.id} className={ROW}>
              <td className={CELL_TIGHT}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] leading-5">{feature.label[locale]}</span>
                  {feature.present && feature.detail && (
                    <code className="data-instr block max-w-[52ch] truncate text-[13px] text-fg-muted">
                      {feature.detail}
                    </code>
                  )}
                </div>
              </td>
              <td className={`${CELL_TIGHT} whitespace-nowrap`}>
                <span className="flex items-baseline gap-2">
                  <span className="data-instr text-[13px] text-fg-secondary">{feature.since}</span>
                  {/* A version number is machine text even inside a qualifier (§4). */}
                  {feature.deprecatedIn && (
                    <span className="text-xs leading-4 text-fg-muted">
                      {t.deprecatedIn} <span className="data-instr">{feature.deprecatedIn}</span>
                    </span>
                  )}
                  {feature.removedIn && (
                    <span className="text-xs leading-4 text-fg-muted">
                      {t.removedIn} <span className="data-instr">{feature.removedIn}</span>
                    </span>
                  )}
                </span>
              </td>
              <td className={`${CELL_TIGHT} whitespace-nowrap`}>
                <div className="flex flex-col gap-0.5">
                  <StateWord
                    tone={feature.present ? "live" : "idle"}
                    label={feature.present ? t.found : t.notFound}
                  />
                  {!feature.availableAtDeclaredVersion && (
                    <p className="text-xs leading-4 text-fg-muted">{t.unavailableAtVersion}</p>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function Chain({ hops }: { hops: Hop[] }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const tag = LOCALE_TAG[locale];
  const number = new Intl.NumberFormat(tag);

  /** HTTP outcome is a real state: it decides whether the chain continues. */
  function toneOf(hop: Hop): Tone | null {
    if (hop.kind === "error") return "dead";
    // Unknown status has nothing to encode — the rail goes transparent rather
    // than falling back to a neutral tone that would assert something (§6).
    if (hop.status === undefined) return null;
    if (hop.status >= 400) return "dead";
    if (hop.status >= 300) return "info";
    return "live";
  }

  return (
    <TableFrame>
      <table className="w-full min-w-[600px] border-collapse">
        <TableHead>
          <th className={HEAD_TIGHT}>{t.colHop}</th>
          <th className={HEAD_TIGHT}>{t.colKind}</th>
          <th className={HEAD_TIGHT}>{t.colStatus}</th>
          <th className={NUM_HEAD_TIGHT}>{t.colTime}</th>
          <th className={NUM_HEAD_TIGHT}>{t.colSize}</th>
          <th className={HEAD_TIGHT}>{t.colUrl}</th>
        </TableHead>
        <tbody>
          {hops.map((hop) => (
            <tr key={hop.index} className={ROW}>
              <td className={railCellTight(toneOf(hop), "data-instr whitespace-nowrap text-[13px]")}>
                #{hop.index}
              </td>
              <td className={`${CELL_TIGHT} whitespace-nowrap`}>
                <span className="flex items-center">
                  <Chip>{hop.kind}</Chip>
                </span>
              </td>
              <td className={`${CELL_TIGHT} data-instr whitespace-nowrap text-[13px]`}>
                {hop.status !== undefined ? hop.status : "—"}
              </td>
              <td className={`${CELL_TIGHT} data-instr whitespace-nowrap text-right text-[13px]`}>
                {hop.elapsedMs > 0 ? `${number.format(hop.elapsedMs)} ${t.ms}` : "—"}
              </td>
              <td className={`${CELL_TIGHT} data-instr whitespace-nowrap text-right text-[13px]`}>
                {hop.bytes > 0 ? formatBytes(hop.bytes, tag, t) : "—"}
              </td>
              <td className={CELL_TIGHT}>
                <div className="flex flex-col gap-0.5">
                  <code className="data-instr block max-w-[46ch] truncate text-[13px] text-fg-secondary">
                    {hop.url}
                  </code>
                  {hop.adSystem && (
                    <span className="data-instr block text-[13px] leading-5 text-fg-muted">
                      {hop.adSystem}
                    </span>
                  )}
                  {hop.error && (
                    <p className="max-w-[52ch] text-[13px] leading-5 text-dead-fg">
                      {hop.error[locale]}
                    </p>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

/** The four reference tables, collapsed, under both columns. */
export function ReferenceSections({
  report,
  resolvedAd,
}: {
  report: InspectReport;
  resolvedAd: ResolvedAd | null;
}) {
  const { dict } = useLocale();
  const t = dict.tools.validator;

  return (
    <section className="flex flex-col gap-2 border-t border-hairline pt-4">
      <h2 className="text-[15px] font-semibold leading-[22px]">{t.sectionReference}</h2>
      <div className="rounded-ctl border border-hairline bg-surface">
        <Fold title={t.sectionInteractive}>
          <Interactive report={report} />
        </Fold>
        <Fold title={t.sectionFeatures}>
          <Features report={report} />
        </Fold>
        <Fold title={t.sectionChain}>
          <Chain hops={report.chain} />
        </Fold>
        {resolvedAd && (
          <Fold title={t.sectionComparison}>
            <ParserVsPlayer facts={report.facts} resolved={resolvedAd} />
          </Fold>
        )}
      </div>
    </section>
  );
}

/**
 * Rules that threw while analysing.
 *
 * Shown rather than swallowed: for a validator, an unreported crash is the worst
 * outcome available — the check silently stops running, the report still looks
 * complete, and "no violation" becomes indistinguishable from "never examined".
 */
export function DegradedNotice({ report }: { report: InspectReport }) {
  const { dict } = useLocale();
  const t = dict.tools.validator;
  if (!report.degraded || report.degraded.length === 0) return null;

  return (
    <Notice tone="warn">
      {t.degradedNotice}{" "}
      <span className="data-instr">{[...new Set(report.degraded)].join(", ")}</span>
    </Notice>
  );
}

