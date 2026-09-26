import { Fragment } from "react";
import Link from "next/link";
import { LOCALE_TAG, type Dict, type Locale } from "@/lib/i18n/dictionaries";
import { asJsonObject } from "@/lib/json";
import { MacroText } from "@/components/ui/MacroText";
import { Notice } from "@/components/ui/Field";
import {
  CELL,
  CELL_TIGHT,
  HEAD,
  HEAD_TIGHT,
  NUM_HEAD,
  NUM_HEAD_TIGHT,
  ROW,
  TableFrame,
  TableHead,
} from "@/components/ui/Table";
import type { Database } from "@/types/database.types";

/**
 * A creative's conversion report (ADR-0023): clicks that went through `/r`,
 * and what the partner network posted back about them.
 *
 * Server-only rendering of rows `get_creative_conversions()` already
 * aggregated; the database does the counting, this does the reading.
 */

/** One row of get_creative_conversions(): a UTC day and an exit. */
type ConversionRow =
  Database["public"]["Functions"]["get_creative_conversions"]["Returns"][number];

/** An exit the creative is configured with, in schema order. */
export interface ExitLabel {
  field: string;
  /** Human copy, or machine text (an answer path) set in mono. */
  label: string;
  machine: boolean;
}

/**
 * The report window, passed to get_creative_conversions() as `p_days`. The
 * copy states it too — `conversions.heading` in lib/i18n/dictionaries.ts says
 * "30 days" in both locales — so change the two together.
 */
export const REPORT_DAYS = 30;

type Money = Record<string, number>;

interface Totals {
  clicks: number;
  approved: number;
  pending: number;
  rejected: number;
  revenue: Money;
}

function emptyTotals(): Totals {
  return { clicks: 0, approved: 0, pending: 0, rejected: 0, revenue: {} };
}

/** Fold one row in. `revenue` is jsonb, so it is read defensively. */
function addRow(into: Totals, row: ConversionRow): void {
  into.clicks += row.clicks;
  into.approved += row.approved;
  into.pending += row.pending;
  into.rejected += row.rejected;
  for (const [currency, amount] of Object.entries(asJsonObject(row.revenue))) {
    if (typeof amount === "number" && /^[A-Z]{3}$/.test(currency)) {
      into.revenue[currency] = (into.revenue[currency] ?? 0) + amount;
    }
  }
}

/** Conversions that count: everything the advertiser has not rejected. */
function converted(t: Totals): number {
  return t.approved + t.pending;
}

/** `YYYY-MM-DD` for each of the last `days` UTC days, newest first. */
function lastDays(days: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = 0; i < days; i++) {
    out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export function ConversionReport({
  dict,
  locale,
  rows,
  available,
  exits,
  exitsMissingMacro,
  editHref,
}: {
  dict: Dict;
  locale: Locale;
  rows: ConversionRow[];
  /** False when the report could not be read — every number becomes a dash. */
  available: boolean;
  exits: ExitLabel[];
  /**
   * Configured exits whose URL has no `{click_id}`. Empty unless the account
   * has set a postback up — otherwise the warning would sit on every creative
   * of an account that never meant to track conversions.
   */
  exitsMissingMacro: ExitLabel[];
  /** Where the missing macro is fixed; this page has no edit button of its own. */
  editHref: string;
}) {
  const c = dict.conversions;
  const tag = LOCALE_TAG[locale];
  const count = new Intl.NumberFormat(tag);
  const money = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const perClick = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  const percent = new Intl.NumberFormat(tag, {
    style: "percent",
    maximumFractionDigits: 2,
  });

  const total = emptyTotals();
  const byExit = new Map<string, Totals>();
  const byDay = new Map<string, Totals>();
  for (const row of rows) {
    addRow(total, row);
    if (!byExit.has(row.field)) byExit.set(row.field, emptyTotals());
    addRow(byExit.get(row.field)!, row);
    if (!byDay.has(row.day)) byDay.set(row.day, emptyTotals());
    addRow(byDay.get(row.day)!, row);
  }

  // Money as amount + ISO code, one line per currency: summing across
  // currencies would be a number in none of them. With nothing approved the
  // reading is a real zero, not a dash (§6).
  const moneyLines = (m: Money, format: Intl.NumberFormat, divisor = 1) => {
    const entries = Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return [format.format(0)];
    return entries.map(([currency, amount]) => `${format.format(amount / divisor)} ${currency}`);
  };

  // Configured exits first, in schema order; then any field that has data but
  // is no longer configured (an exit removed after it was clicked), under its
  // raw name — still machine text, and still a real number.
  const exitRows: ExitLabel[] = [
    ...exits,
    ...[...byExit.keys()]
      .filter((field) => !exits.some((e) => e.field === field))
      .map((field) => ({ field, label: field, machine: true })),
  ];

  const hasActivity = total.clicks > 0 || converted(total) + total.rejected > 0;
  const dash = "—";

  /** A count inside a caption is still a count: mono, tabular (§4). */
  const n = (value: number) => <span className="data-instr">{count.format(value)}</span>;

  const exitLabel = (exit: ExitLabel) =>
    exit.machine ? <code className="data-instr">{exit.label}</code> : exit.label;

  // The grid is six columns from `lg` so the strip reads as two rows: the three
  // counts on the first, the two ratios closing it on the second (§6). Five
  // equal columns were too narrow for money at 26px — a large RUB amount ran
  // out of its cell below ~1270px.
  const strip: {
    key: string;
    label: string;
    values: string[];
    hint: React.ReactNode;
    span: string;
  }[] = [
    {
      key: "clicks",
      label: c.clicks,
      values: [available ? count.format(total.clicks) : dash],
      hint: <MacroText text={c.clicksHint} />,
      span: "lg:col-span-2",
    },
    {
      key: "conversions",
      label: c.conversions,
      values: [available ? count.format(converted(total)) : dash],
      // The parts are named so they add up to the number above: rejected ones
      // are shown, and said not to count.
      hint: available ? (
        <>
          {n(total.approved)} {c.approved} · {n(total.pending)} {c.pending} ·{" "}
          {n(total.rejected)} {c.rejectedNotCounted}
        </>
      ) : null,
      span: "lg:col-span-2",
    },
    {
      key: "revenue",
      label: c.revenue,
      values: available ? moneyLines(total.revenue, money) : [dash],
      hint: c.revenueHint,
      span: "lg:col-span-2",
    },
    {
      // Ratios close the strip, and each names its denominator (§6). No clicks
      // means not measurable yet — a dash, never a claimed 0%.
      key: "cr",
      label: c.cr,
      values: [
        available && total.clicks > 0
          ? percent.format(converted(total) / total.clicks)
          : dash,
      ],
      hint: c.crOfClicks,
      span: "lg:col-span-3",
    },
    {
      key: "epc",
      label: c.epc,
      values:
        available && total.clicks > 0
          ? moneyLines(total.revenue, perClick, total.clicks)
          : [dash],
      hint: c.epcHint,
      // Spans the two-column row it would otherwise leave half-empty, since an
      // empty grid slot here shows as a block of hairline colour.
      span: "sm:col-span-2 lg:col-span-3",
    },
  ];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="label-instr">{c.heading}</h2>
          <Link
            href="/dashboard/creatives/postback"
            className="type-small text-fg-muted underline underline-offset-4 hover:text-fg"
          >
            {c.setUp}
          </Link>
        </div>

        {exitsMissingMacro.length > 0 && (
          <Notice tone="warn">
            <MacroText text={c.missingMacro} />{" "}
            <Link href={editHref} className="underline underline-offset-4">
              {dict.dashboard.edit}
            </Link>
            <span className="mt-1 block type-caption">
              {exitsMissingMacro.map((exit, i) => (
                <Fragment key={exit.field}>
                  {i > 0 && " · "}
                  {exitLabel(exit)}
                </Fragment>
              ))}
            </span>
          </Notice>
        )}
        {!available && <Notice tone="dead">{c.unavailable}</Notice>}

        {/*
          Hairline strip, the delivery strip's form (§6). A clipping parent is
          safe for the same reason it is there: every cell is a static readout
          with no focusable descendant.
        */}
        <div className="grid gap-px overflow-hidden rounded-panel border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-6">
          {strip.map((cell) => (
            <div key={cell.key} className={`flex flex-col gap-2 bg-surface p-4 ${cell.span}`}>
              <span className="label-instr">{cell.label}</span>
              <span className="flex flex-col">
                {cell.values.map((value) => (
                  <span key={value} className="type-metric">
                    {value}
                  </span>
                ))}
              </span>
              {cell.hint && (
                <span className="type-caption text-fg-muted">{cell.hint}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {available && hasActivity && exitRows.length > 1 && (
        <div className="flex flex-col gap-2">
          <h3 className="label-instr">{c.byExit}</h3>
          {/* One row per exit the creative has — a thing the user configured,
              so the full 44px (§6). No rail: an exit has no state. */}
          <TableFrame>
            <table className="w-full min-w-[560px] border-collapse type-small">
              <TableHead>
                <th className={HEAD}>{c.exit}</th>
                <th className={NUM_HEAD}>{c.clicks}</th>
                <th className={NUM_HEAD}>{c.conversions}</th>
                <th className={NUM_HEAD}>{c.crColumn}</th>
                <th className={NUM_HEAD}>{c.revenue}</th>
              </TableHead>
              <tbody>
                {exitRows.map((exit) => {
                  const t = byExit.get(exit.field) ?? emptyTotals();
                  return (
                    <tr key={exit.field} className={ROW}>
                      <td className={CELL}>{exitLabel(exit)}</td>
                      <td className={`${CELL} data-instr text-right`}>
                        {count.format(t.clicks)}
                      </td>
                      <td className={`${CELL} data-instr text-right`}>
                        {count.format(converted(t))}
                      </td>
                      <td className={`${CELL} data-instr text-right`}>
                        {t.clicks > 0 ? percent.format(converted(t) / t.clicks) : dash}
                      </td>
                      <td className={`${CELL} data-instr text-right whitespace-nowrap`}>
                        {moneyLines(t.revenue, money).join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableFrame>
        </div>
      )}

      {available && hasActivity && (
        <div className="flex flex-col gap-2">
          <h3 className="label-instr">{c.byDay}</h3>
          <p className="type-caption text-fg-muted">{c.byDayNote}</p>
          {/* Readout density (§6): system-emitted, scanned for its shape, no
              row actions. Every day of the window, zeros included — a gap in
              the series is information, and hiding it would redraw the curve. */}
          <TableFrame>
            <table className="w-full min-w-[560px] border-collapse">
              <TableHead>
                <th className={HEAD_TIGHT}>{c.day}</th>
                <th className={NUM_HEAD_TIGHT}>{c.clicks}</th>
                <th className={NUM_HEAD_TIGHT}>{c.conversions}</th>
                <th className={NUM_HEAD_TIGHT}>{c.approved}</th>
                <th className={NUM_HEAD_TIGHT}>{c.revenue}</th>
              </TableHead>
              <tbody>
                {lastDays(REPORT_DAYS).map((day) => {
                  const t = byDay.get(day) ?? emptyTotals();
                  return (
                    <tr key={day} className={ROW}>
                      <td className={`${CELL_TIGHT} data-instr whitespace-nowrap`}>
                        {day}
                      </td>
                      <td className={`${CELL_TIGHT} data-instr text-right`}>
                        {count.format(t.clicks)}
                      </td>
                      <td className={`${CELL_TIGHT} data-instr text-right`}>
                        {count.format(converted(t))}
                      </td>
                      <td className={`${CELL_TIGHT} data-instr text-right`}>
                        {count.format(t.approved)}
                      </td>
                      <td className={`${CELL_TIGHT} data-instr text-right whitespace-nowrap`}>
                        {moneyLines(t.revenue, money).join(" · ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableFrame>
        </div>
      )}
    </section>
  );
}
