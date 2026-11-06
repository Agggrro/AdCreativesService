"use client";

import { useState, type ReactNode } from "react";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";

/**
 * A panel of table rows with a heading and, when there are more rows than fit, a
 * *Show all* in its corner (docs/design-system.md §6, "Expandable panel"; ADR-0038).
 * A creative's Stats puts two of them side by side — errors by code, conversions
 * by exit — and shows the first few rows of each, so the screen is a reading and
 * not a scroll; the rest is one click away, in place, and the button says it is
 * open.
 *
 * The rows are server-rendered `<tr>`s passed in; this owns only which of them
 * show. The panel is not `overflow-hidden` (the button's ring would be clipped,
 * §2); the table scrolls inside a frame of its own below the heading (§5).
 */
export function ExpandablePanel({
  heading,
  head,
  rows,
  limit = 3,
  minWidth = "min-w-[420px]",
}: {
  heading: string;
  /** The `<TableHead>`. */
  head: ReactNode;
  /** One `<tr>` per row, in order. */
  rows: ReactNode[];
  limit?: number;
  /** The width the columns need before the table scrolls instead of squeezing. */
  minWidth?: string;
}) {
  const dict = useDict();
  const [all, setAll] = useState(false);
  const more = rows.length > limit;
  const shown = all ? rows : rows.slice(0, limit);

  return (
    <section className="min-w-0 rounded-panel border border-hairline bg-surface">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-hairline py-1.5 pr-3 pl-4">
        <h2 className="label-instr">{heading}</h2>
        {more && (
          <button
            type="button"
            // No `aria-expanded`: the label changes with the state, and both together
            // read as "Show less, expanded".
            onClick={() => setAll((a) => !a)}
            className={buttonClass("secondary", "sm")}
          >
            {all ? dict.dashboard.showLess : dict.dashboard.showAll}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className={`w-full ${minWidth} border-collapse type-small`}>
          {head}
          <tbody>{shown}</tbody>
        </table>
      </div>
    </section>
  );
}
