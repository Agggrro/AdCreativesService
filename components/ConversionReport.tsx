import { Fragment } from "react";
import Link from "next/link";
import { LOCALE_TAG, type Dict, type Locale } from "@/lib/i18n/dictionaries";
import { asJsonObject } from "@/lib/json";
import { MacroText } from "@/components/ui/MacroText";
import { Notice } from "@/components/ui/Field";
import { ExpandablePanel } from "@/components/stats/ExpandablePanel";
import { StatStrip, type StatTile } from "@/components/stats/StatStrip";
import {
  CELL,
  CELL_TIGHT,
  HEAD,
  HEAD_TIGHT,
  NUM_HEAD,
  NUM_HEAD_TIGHT,
  ROW,
  TableHead,
} from "@/components/ui/Table";
import type { Database } from "@/types/database.types";

/**
 * A creative's conversion report (ADR-0023): clicks that went through `/r`,
 * and what the partner network posted back about them — split by the goal the
 * network reported, when it reports one (ADR-0027).
 *
 * Server-only rendering of rows `get_creative_conversions()` and
 * `get_creative_conversion_goals()` already aggregated; the database does the
 * counting, this does the reading.
 *
 * It returns the report in parts rather than as one block, because a creative's
 * Stats places them apart (docs/design-system.md §6, "Stats"; ADR-0038): the strip
 * of totals on a row of its own, the by-exit table beside the errors, and the by-goal and by-day
 * tables behind a disclosure — read when needed, not scrolled past.
 */

/** One row of get_creative_conversions(): a UTC day and an exit. */
type ConversionRow =
  Database["public"]["Functions"]["get_creative_conversions"]["Returns"][number];

/** One row of get_creative_conversion_goals(): a goal, '' for none. */
type GoalRow =
  Database["public"]["Functions"]["get_creative_conversion_goals"]["Returns"][number];

/** What both readers count. A goal row has no clicks: a click has no goal. */
type Counted = Pick<ConversionRow, "approved" | "pending" | "rejected" | "revenue"> & {
  clicks?: number;
};

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
function addRow(into: Totals, row: Counted): void {
  into.clicks += row.clicks ?? 0;
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

/**
 * A disclosure panel for a table that is read on demand. Native `<details>`: it
 * needs no script, announces its state, and `summary` is already in the global
 * focus rule (§2). The panel is not `overflow-hidden` — the summary's ring would
 * be clipped; the table scrolls in a frame of its own below it (§5).
 */
function Disclosure({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-panel border border-hairline bg-surface">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-panel px-4 py-1.5 [&::-webkit-details-marker]:hidden">
        <h2 className="label-instr">{title}</h2>
        <span aria-hidden className="text-fg-secondary transition-transform duration-150 group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-hairline">
        {note && <p className="max-w-prose px-4 py-3 type-caption text-fg-muted">{note}</p>}
        <div className="overflow-x-auto">{children}</div>
      </div>
    </details>
  );
}

export function conversionParts({
  dict,
  locale,
  rows,
  goals,
  available,
  exits,
  exitsMissingMacro,
  editHref,
}: {
  dict: Dict;
  locale: Locale;
  rows: ConversionRow[];
  /** The same window's conversions per goal (ADR-0027). */
  goals: GoalRow[];
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

  // Goals as the network named them, in natural order (`2` before `10`), with
  // the conversions that came without one last. A fixed collation rather than
  // the interface's: Russian collation puts Cyrillic before Latin, and a mixed
  // set (`депозит`, `FTD`) should not reorder when the owner switches RU/EN.
  // The table appears once any conversion carries a goal — even a single one,
  // unlike the by-exit table: the owner configured every exit here and knows
  // them, but a goal's name is information nothing else on this page shows.
  const collator = new Intl.Collator("en", { numeric: true });
  const goalRows = [...goals]
    .sort(
      (a, b) =>
        Number(a.goal === "") - Number(b.goal === "") || collator.compare(a.goal, b.goal),
    )
    .map((row) => {
      const totals = emptyTotals();
      addRow(totals, row);
      return { goal: row.goal, totals };
    });
  const hasGoals = goalRows.some((row) => row.goal !== "");

  /** A count inside a caption is still a count: mono, tabular (§4). */
  const n = (value: number) => <span className="data-instr">{count.format(value)}</span>;

  const exitLabel = (exit: ExitLabel) =>
    exit.machine ? <code className="data-instr">{exit.label}</code> : exit.label;

  // Five readings, each naming only what the number alone would not say: what
  // the conversions add up from, which of them is paid. The ratios close the
  // strip and each names its denominator (§6) — no clicks means not measurable
  // yet, a dash, never a claimed 0%.
  const tiles: StatTile[] = [
    {
      key: "clicks",
      label: c.clicks,
      values: [available ? count.format(total.clicks) : dash],
    },
    {
      key: "conversions",
      label: c.conversions,
      values: [available ? count.format(converted(total)) : dash],
      // The parts are named so they add up to the number above: rejected ones
      // are shown, and said not to count.
      caption: available ? (
        <>
          {n(total.approved)} {c.approved} · {n(total.pending)} {c.pending} ·{" "}
          {n(total.rejected)} {c.rejectedNotCounted}
        </>
      ) : undefined,
    },
    {
      key: "revenue",
      label: c.revenue,
      values: available ? moneyLines(total.revenue, money) : [dash],
      caption: c.revenueHint,
    },
    {
      key: "cr",
      label: c.cr,
      values: [
        available && total.clicks > 0
          ? percent.format(converted(total) / total.clicks)
          : dash,
      ],
      caption: c.crOfClicks,
    },
    {
      key: "epc",
      label: c.epc,
      values:
        available && total.clicks > 0
          ? moneyLines(total.revenue, perClick, total.clicks)
          : [dash],
    },
  ];

  const strip = (
    <section className="flex min-w-0 flex-col gap-3">
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
      <StatStrip
        heading={
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="label-instr">{c.heading}</h2>
            <Link
              href="/dashboard/creatives/postback"
              className="type-small text-fg-muted underline underline-offset-4 hover:text-fg"
            >
              {c.setUp}
            </Link>
          </div>
        }
        tiles={tiles}
        className="sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,0.9fr)_minmax(0,1fr)]"
      />
    </section>
  );

  // One row per exit the creative has — a thing the user configured, so the
  // full 44px (§6). No rail: an exit has no state.
  const exitsPanel =
    available && hasActivity && exitRows.length > 1 ? (
      <ExpandablePanel
        heading={c.byExit}
        minWidth="min-w-[520px]"
        head={
          <TableHead>
            <th className={HEAD}>{c.exit}</th>
            <th className={NUM_HEAD}>{c.clicks}</th>
            <th className={NUM_HEAD}>{c.conversions}</th>
            <th className={NUM_HEAD}>{c.crColumn}</th>
            <th className={NUM_HEAD}>{c.revenue}</th>
          </TableHead>
        }
        rows={exitRows.map((exit) => {
          const t = byExit.get(exit.field) ?? emptyTotals();
          return (
            <tr key={exit.field} className={ROW}>
              <td className={CELL}>{exitLabel(exit)}</td>
              <td className={`${CELL} data-instr text-right`}>{count.format(t.clicks)}</td>
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
      />
    ) : null;

  // 44px, like the by-exit table: a handful of rows read against the network's
  // own report, not a stream (§6). No rail — a goal has no state. No clicks
  // column: every goal would repeat the same number, since a click has no goal.
  // Rejected has a column here, unlike in the tables beside it: a goal the
  // advertiser declined outright is a row of zeros, and without the count the
  // reader cannot tell why the row is there at all.
  const goalsPanel =
    available && hasGoals ? (
      <Disclosure title={c.byGoal} note={<MacroText text={c.byGoalNote} />}>
        <table className="w-full min-w-[640px] border-collapse type-small">
          <TableHead>
            <th className={HEAD}>{c.goal}</th>
            <th className={NUM_HEAD}>{c.conversions}</th>
            <th className={NUM_HEAD}>{c.approved}</th>
            <th className={NUM_HEAD}>{c.rejected}</th>
            {/* Not the by-exit table's "CR of clicks": there the denominator is the
                row's own clicks, here it is all of them, and the header is where
                the reader learns which. */}
            <th className={NUM_HEAD}>{c.crOfAllClicksColumn}</th>
            <th className={NUM_HEAD}>{c.revenue}</th>
          </TableHead>
          <tbody>
            {goalRows.map(({ goal, totals: t }) => (
              <tr key={goal} className={ROW}>
                <td className={CELL}>
                  {/* The network's label is machine text, the same in both
                      locales; the absence of one is our copy. */}
                  {goal ? <code className="data-instr">{goal}</code> : c.noGoal}
                </td>
                <td className={`${CELL} data-instr text-right`}>{count.format(converted(t))}</td>
                <td className={`${CELL} data-instr text-right`}>{count.format(t.approved)}</td>
                <td className={`${CELL} data-instr text-right`}>{count.format(t.rejected)}</td>
                <td className={`${CELL} data-instr text-right`}>
                  {total.clicks > 0 ? percent.format(converted(t) / total.clicks) : dash}
                </td>
                <td className={`${CELL} data-instr text-right whitespace-nowrap`}>
                  {moneyLines(t.revenue, money).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Disclosure>
    ) : null;

  // Readout density (§6): system-emitted, scanned for its shape, no row actions.
  // Every day of the window, zeros included — a gap in the series is
  // information, and hiding it would redraw the curve.
  const dayPanel =
    available && hasActivity ? (
      <Disclosure title={c.byDay} note={c.byDayNote}>
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
                  <td className={`${CELL_TIGHT} data-instr whitespace-nowrap`}>{day}</td>
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
      </Disclosure>
    ) : null;

  return { strip, exitsPanel, goalsPanel, dayPanel };
}
