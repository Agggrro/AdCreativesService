import { LOCALE_TAG, type Dict, type Locale } from "@/lib/i18n/dictionaries";
import { UNKNOWN_ERROR_CODE } from "@/lib/vast/error-codes";
import { lookupIabError } from "@/lib/vast-inspect/errors-iab";
import { Notice, Panel } from "@/components/ui/Field";
import { MacroText } from "@/components/ui/MacroText";
import { CELL, HEAD, NUM_HEAD, ROW, TableFrame, TableHead } from "@/components/ui/Table";
import type { Database } from "@/types/database.types";

/**
 * A creative's VAST errors (ADR-0033): what players reported through the
 * `<Error>` beacon, per error code, all-time — the same window as the delivery
 * strip above it.
 *
 * Server-only rendering of the rows `get_creative_errors()` already summed.
 */

type ErrorRow = Database["public"]["Functions"]["get_creative_errors"]["Returns"][number];

/**
 * What a code means, in the reader's language — or why we cannot say. The
 * names come from the validator's IAB table, the one copy of it, so the two
 * surfaces cannot disagree about a code.
 */
function describe(dict: Dict, locale: Locale, code: number): string {
  if (code === UNKNOWN_ERROR_CODE) return dict.vastErrors.noCode;
  return lookupIabError(code)?.label[locale] ?? dict.vastErrors.unknownCode;
}

/** Below the format's precision, a share is "under 0.1%", never a false `0 %`. */
const SHARE_FLOOR = 0.001;

export function VastErrorReport({
  dict,
  locale,
  rows,
  available,
}: {
  dict: Dict;
  locale: Locale;
  /** Most frequent first, as the function orders them. */
  rows: ErrorRow[];
  /** False when the read failed: an em dash and a notice, never a zero (§6). */
  available: boolean;
}) {
  const e = dict.vastErrors;
  const number = new Intl.NumberFormat(LOCALE_TAG[locale]);
  const percent = new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const share = (count: number) =>
    count / total < SHARE_FLOOR
      ? `<${percent.format(SHARE_FLOOR)}`
      : percent.format(count / total);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="label-instr">{e.heading}</h2>
      {!available && <Notice tone="dead">{e.unavailable}</Notice>}
      {/*
        The total stands alone, like the viewability tile, rather than closing
        the delivery strip: that strip is the sequence impression → click, and
        an error is not a step in it. Neutral, not `dead`: errors are a count
        of what players reported, not a state of the creative, and every
        creative served at scale has some.
      */}
      <Panel className="flex max-w-xs flex-col gap-2 p-4">
        <span className="label-instr">{e.total}</span>
        <span className="type-metric">{available ? number.format(total) : "—"}</span>
        <span className="type-caption text-fg-muted">
          <MacroText text={e.totalHint} />
        </span>
      </Panel>

      {available &&
        (rows.length === 0 ? (
          <p className="type-small text-fg-muted">{e.none}</p>
        ) : (
          // 44px, no rail: a handful of summary rows, not a stream (§6), and
          // a code has no state to encode — a rail on every row would be the
          // decorative kind §6 forbids.
          <TableFrame>
            <table className="w-full min-w-[480px] border-collapse type-small">
              <TableHead>
                <th className={`${HEAD} w-px`}>{e.code}</th>
                <th className={HEAD}>{e.description}</th>
                <th className={`${NUM_HEAD} w-px`}>{e.count}</th>
                {/* The denominator is named in the header (§6): a bare
                    percentage here would be read as a share of impressions. */}
                <th className={`${NUM_HEAD} w-px`}>{e.share}</th>
              </TableHead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code} className={ROW}>
                    <td className={`${CELL} data-instr whitespace-nowrap`}>{row.code}</td>
                    <td className={CELL}>
                      <MacroText text={describe(dict, locale, row.code)} />
                    </td>
                    <td className={`${CELL} data-instr whitespace-nowrap text-right`}>
                      {number.format(row.count)}
                    </td>
                    <td className={`${CELL} data-instr whitespace-nowrap text-right`}>
                      {share(row.count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        ))}
    </section>
  );
}
