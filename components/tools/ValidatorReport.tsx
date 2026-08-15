"use client";

import { useLocale } from "@/components/i18n/LocaleProvider";
import { LOCALE_TAG } from "@/lib/i18n/dictionaries";
import { Chip, chipType } from "@/components/ui/Chip";
import { StateWord, type Tone } from "@/components/ui/State";
import { CELL, HEAD, NUM_HEAD, railCell, railRow, ROW, TableFrame, TableHead } from "@/components/ui/Table";
// Imported per-module rather than through @/lib/vast-inspect: the barrel reaches
// chain.ts → fetch-tag.ts, which imports node:dns and node:http. Pulling that
// into a client component would break the bundle. model.ts and errors-iab.ts
// are pure and safe here.
import type { Finding, Hop, InspectReport, Severity, TrackerHit } from "@/lib/vast-inspect/model";
import { describeIabError } from "@/lib/vast-inspect/errors-iab";

/** Severity → semantic tone. The whole reason --color-warn exists (§3). */
const SEVERITY_TONE: Record<Severity, Tone> = {
  error: "dead",
  warning: "warn",
  advisory: "info",
};

function formatBytes(bytes: number, tag: string): string {
  if (bytes < 1024) return `${bytes} B`;
  const value = bytes < 1024 * 1024 ? bytes / 1024 : bytes / (1024 * 1024);
  const unit = bytes < 1024 * 1024 ? "KB" : "MB";
  return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

/** A hairline-separated report section (§5: sections are separated by a rule). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-6">
      <h2 className="text-[15px] font-semibold leading-[22px]">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, qualifier }: { label: string; value: string; qualifier?: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <span className="label-instr">{label}</span>
      <span className="data-instr text-[22px] font-medium leading-7">{value}</span>
      {qualifier && <span className="text-xs leading-4 text-fg-muted">{qualifier}</span>}
    </div>
  );
}

/** An empty section body, so "nothing found" never looks like a failed render. */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-ctl border border-hairline bg-surface px-4 py-6">
      <p className="text-[13px] leading-5 text-fg-muted">{children}</p>
    </div>
  );
}

/* ---------- sections ---------- */

function Summary({ report }: { report: InspectReport }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const tag = LOCALE_TAG[locale];
  const number = new Intl.NumberFormat(tag);

  const verdictTone: Tone =
    report.verdict === "fail" ? "dead" : report.verdict === "warn" ? "warn" : "live";
  const verdictLabel =
    report.verdict === "fail" ? t.verdictFail : report.verdict === "warn" ? t.verdictWarn : t.verdictPass;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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

      <div className="grid grid-cols-2 gap-px rounded-ctl border border-hairline bg-hairline sm:grid-cols-4">
        <div className="bg-surface">
          <Metric
            label={t.version}
            value={report.declaredVersion ?? "—"}
            qualifier={report.declaredVersion ? undefined : t.versionUnknown}
          />
        </div>
        <div className="bg-surface">
          <Metric label={t.ads} value={number.format(report.adCount)} />
        </div>
        <div className="bg-surface">
          <Metric label={t.hops} value={number.format(report.chain.length)} />
        </div>
        <div className="bg-surface">
          <Metric label={t.downloaded} value={formatBytes(report.source.bytes, tag)} />
        </div>
      </div>
    </section>
  );
}

function Interactive({ report }: { report: InspectReport }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;

  return (
    <Section title={t.sectionInteractive}>
      <TableFrame>
        <table className="w-full min-w-[640px] border-collapse">
          <TableHead>
            <th className={HEAD}>{t.colKind}</th>
            <th className={HEAD}>{t.colFound}</th>
            <th className={HEAD}>{t.colWhere}</th>
          </TableHead>
          <tbody>
            {report.interactive.map((hit) => (
              <tr key={hit.standard} className={ROW}>
                {/* Present is a real state and rails `info` — it is a fact about
                    the tag, not a health verdict. Absent has no state, so no
                    rail: a rail on every row would mean nothing (§6). */}
                <td className={railCell(hit.present ? "info" : null)}>
                  <span className={chipType}>{hit.standard}</span>
                </td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <StateWord
                    tone={hit.present ? "live" : "idle"}
                    label={hit.present ? t.found : t.notFound}
                  />
                </td>
                <td className={CELL}>
                  <div className="flex flex-col gap-1">
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
    </Section>
  );
}

function Features({ report }: { report: InspectReport }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;

  return (
    <Section title={t.sectionFeatures}>
      <TableFrame>
        <table className="w-full min-w-[640px] border-collapse">
          <TableHead>
            <th className={HEAD}>{t.colFeature}</th>
            <th className={HEAD}>{t.colSince}</th>
            <th className={HEAD}>{t.colFound}</th>
          </TableHead>
          <tbody>
            {/* No rail anywhere in this table on purpose: "your tag has no
                Mezzanine" is an absence, not a state (docs/design-system.md §6). */}
            {report.features.map((feature) => (
              <tr key={feature.id} className={ROW}>
                <td className={CELL}>
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] leading-5">{feature.label[locale]}</span>
                    {feature.present && feature.detail && (
                      <code className="data-instr block max-w-[52ch] truncate text-[13px] text-fg-muted">
                        {feature.detail}
                      </code>
                    )}
                  </div>
                </td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <span className="flex items-baseline gap-2">
                    <span className="data-instr text-[13px] text-fg-secondary">{feature.since}</span>
                    {feature.deprecatedIn && (
                      <span className="text-xs leading-4 text-fg-muted">
                        {t.deprecatedIn} {feature.deprecatedIn}
                      </span>
                    )}
                    {feature.removedIn && (
                      <span className="text-xs leading-4 text-fg-muted">
                        {t.removedIn} {feature.removedIn}
                      </span>
                    )}
                  </span>
                </td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <div className="flex flex-col gap-1">
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
    </Section>
  );
}

/**
 * Findings take the data-table row treatment but not the `<table>` element.
 *
 * Each row expands to show the fix, and a disclosure inside a table cell is
 * both awkward markup and awkward for a screen reader. The outcome matrix set
 * this precedent: take the treatment, not the element (§6).
 */
function Findings({ findings }: { findings: Finding[] }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  const severityLabel: Record<Severity, string> = {
    error: t.severityError,
    warning: t.severityWarning,
    advisory: t.severityAdvisory,
  };

  if (findings.length === 0) {
    return (
      <Section title={t.sectionFindings}>
        <EmptyNote>{t.noFindings}</EmptyNote>
      </Section>
    );
  }

  return (
    <Section title={t.sectionFindings}>
      {/* Not `Panel`: it sets overflow-hidden, which clips the 2px-offset focus
          ring on each summary row (§3). Rounded ends instead. */}
      <div className="rounded-ctl border border-hairline bg-surface">
        {findings.map((finding, index) => (
          <details
            key={`${finding.ruleId}-${finding.hop}-${finding.path}-${index}`}
            className={railRow(SEVERITY_TONE[finding.severity])}
          >
            <summary className="flex cursor-pointer list-none flex-col gap-1 py-3 pl-[13px] pr-4 hover:bg-surface-sunken">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StateWord
                  tone={SEVERITY_TONE[finding.severity]}
                  label={severityLabel[finding.severity]}
                />
                <span className="text-[13px] leading-5">{finding.message[locale]}</span>
              </span>
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
                <span className="data-instr text-xs leading-4 text-fg-muted">{finding.ruleId}</span>
                <a
                  href={finding.spec.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-xs leading-4 text-fg-muted underline underline-offset-4 hover:text-fg-secondary"
                >
                  {finding.spec.doc} {finding.spec.section}
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
      </div>
    </Section>
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
    <Section title={t.sectionChain}>
      <TableFrame>
        <table className="w-full min-w-[720px] border-collapse">
          <TableHead>
            <th className={HEAD}>{t.colHop}</th>
            <th className={HEAD}>{t.colKind}</th>
            <th className={HEAD}>{t.colStatus}</th>
            <th className={NUM_HEAD}>{t.colTime}</th>
            <th className={NUM_HEAD}>{t.colSize}</th>
            <th className={HEAD}>{t.colUrl}</th>
          </TableHead>
          <tbody>
            {hops.map((hop) => (
              <tr key={hop.index} className={ROW}>
                <td className={railCell(toneOf(hop), "data-instr text-[13px]")}>#{hop.index}</td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <Chip>{hop.kind}</Chip>
                </td>
                <td className={`${CELL} data-instr whitespace-nowrap text-[13px]`}>
                  {hop.status !== undefined ? hop.status : "—"}
                </td>
                <td className={`${CELL} data-instr whitespace-nowrap text-right text-[13px]`}>
                  {hop.elapsedMs > 0 ? `${number.format(hop.elapsedMs)} ms` : "—"}
                </td>
                <td className={`${CELL} data-instr whitespace-nowrap text-right text-[13px]`}>
                  {hop.bytes > 0 ? formatBytes(hop.bytes, tag) : "—"}
                </td>
                <td className={CELL}>
                  <div className="flex flex-col gap-1">
                    <code className="data-instr block max-w-[46ch] truncate text-[13px] text-fg-secondary">
                      {hop.url}
                    </code>
                    {hop.adSystem && (
                      <span className="data-instr block text-xs leading-4 text-fg-muted">
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
    </Section>
  );
}

function Trackers({ trackers }: { trackers: TrackerHit[] }) {
  const { dict } = useLocale();
  const t = dict.tools.validator;

  if (trackers.length === 0) {
    return (
      <Section title={t.sectionTrackers}>
        <EmptyNote>{t.noTrackers}</EmptyNote>
      </Section>
    );
  }

  return (
    <Section title={t.sectionTrackers}>
      <TableFrame>
        {/* No rail: a tracker row carries no state of its own. Whether one is
            http, or duplicated, is already a finding above (§6). */}
        <table className="w-full min-w-[720px] border-collapse">
          <TableHead>
            <th className={HEAD}>{t.colHop}</th>
            <th className={HEAD}>{t.colEvent}</th>
            <th className={HEAD}>{t.colUrl}</th>
          </TableHead>
          <tbody>
            {trackers.map((tracker, index) => (
              <tr key={`${tracker.path}-${index}`} className={ROW}>
                <td className={`${CELL} data-instr whitespace-nowrap text-[13px]`}>
                  #{tracker.hop}
                </td>
                <td className={`${CELL} whitespace-nowrap`}>
                  <span className={chipType}>
                    {tracker.event ? `${tracker.kind}:${tracker.event}` : tracker.kind}
                  </span>
                </td>
                <td className={CELL}>
                  <code className="data-instr block max-w-[72ch] truncate text-[13px] text-fg-secondary">
                    {tracker.url}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </Section>
  );
}

function Recommendations({ report }: { report: InspectReport }) {
  const { locale, dict } = useLocale();
  const t = dict.tools.validator;
  if (report.recommendations.length === 0) return null;

  return (
    <Section title={t.sectionRecommendations}>
      <div className="rounded-ctl border border-hairline bg-surface">
        {report.recommendations.map((item) => (
          <div key={item.id} className={railRow(SEVERITY_TONE[item.severity])}>
            <div className="flex flex-col gap-1 py-4 pl-[13px] pr-4">
              <h3 className="text-[13px] font-medium leading-5">{item.title[locale]}</h3>
              <p className="max-w-[66ch] text-[13px] leading-5 text-fg-muted">
                {item.body[locale]}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ValidatorReport({ report }: { report: InspectReport }) {
  return (
    <div className="flex flex-col gap-6">
      <Summary report={report} />
      <Interactive report={report} />
      <Findings findings={report.findings} />
      <Features report={report} />
      <Chain hops={report.chain} />
      <Trackers trackers={report.trackers} />
      <Recommendations report={report} />
    </div>
  );
}
