"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { vastTagUrl } from "@/lib/site";
import { LOCALE_TAG } from "@/lib/i18n/dictionaries";
import { CopyButton } from "@/components/CopyButton";
import { MoreMenu } from "@/components/workspace/MoreMenu";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";
import { RAIL, ServingBadge, StateWord } from "@/components/ui/State";
import {
  CELL,
  FIT,
  HEAD,
  NUM_HEAD,
  railCell,
  ROW,
  TableFrame,
  TableHead,
} from "@/components/ui/Table";

export interface CreativeRow {
  id: string;
  label: string;
  format: string;
  impressions: number;
  clicks: number;
  serving: boolean;
}

type Filter = "all" | "serving" | "stopped";

/**
 * The Creatives list (docs/design-system.md §6, "Creatives list"; ADR-0038): the
 * numbers a returning owner opens the product for — impressions, clicks, CTR and
 * whether the tag serves — a search by name and a filter by state, and per row the
 * three things done from here: copy the tag, edit, and *More* (the validator,
 * duplicate, delete).
 *
 * Search and filter are client-side over the rows the page already has: an
 * account's creatives are dozens, not thousands, and a round trip per keystroke
 * would be the slower way to the same list. The count is the number shown, not
 * the number owned, so it is also the answer to "did my filter match anything".
 *
 * Every column but the name is sized to its content (`FIT`, from ui/Table), and
 * the name takes what is left and wraps. `TableFrame` is `overflow-x-auto`, which
 * clips like `overflow-hidden` does: the focus rings on edge-adjacent buttons
 * survive only because every cell's padding (12px+) exceeds the ring's 4px — do
 * not trim it (§2). Below the width the content needs, the table scrolls inside
 * that frame (§5). *More* is portalled for the same reason: its panel would be
 * clipped by the frame.
 */
export function CreativesList({
  rows,
  statsAvailable,
  newCreative,
}: {
  rows: CreativeRow[];
  /** False when the overview aggregate failed: show em dashes, not zeros (§6). */
  statsAvailable: boolean;
  /** The sheet's trigger, from the page — it needs the templates the page reads. */
  newCreative: React.ReactNode;
}) {
  const { dict, locale } = useLocale();
  const number = new Intl.NumberFormat(LOCALE_TAG[locale]);
  const percent = new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: "percent",
    maximumFractionDigits: 2,
  });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || r.label.toLowerCase().includes(q)) &&
        (filter === "all" || (filter === "serving") === r.serving),
    );
  }, [rows, query, filter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex items-baseline gap-3">
          <h1 className="type-h2">{dict.dashboard.creatives}</h1>
          <span className="data-instr type-caption text-fg-muted">{shown.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative block w-full sm:w-[280px]">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={dict.dashboard.search}
              aria-label={dict.dashboard.search}
              className="min-h-11 w-full rounded-ctl border border-line bg-surface py-1.5 pr-2.5 pl-9 type-data text-fg placeholder:text-fg-muted"
            />
          </label>
          {/* The filter is a reading of the serving state; with the aggregate down
              there is nothing to filter by (§6). */}
          {statsAvailable && (
            <Segmented
              label={dict.dashboard.filter}
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: dict.dashboard.filterAll },
                { value: "serving", label: dict.dashboard.serving },
                { value: "stopped", label: dict.dashboard.notServing },
              ]}
            />
          )}
          {/* Below `sm` the one primary is a full-width strip at the foot of the
              screen, where a thumb is, rather than a button lost in a wrapped
              toolbar; the list below keeps room for it. */}
          <div className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-20 max-sm:border-t max-sm:border-hairline max-sm:bg-ground max-sm:p-4 max-sm:[&>button]:w-full">
            {newCreative}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-panel border border-hairline bg-surface p-6 type-small text-fg-muted">
          {dict.dashboard.noMatches}
        </p>
      ) : (
        <>
          {/* A phone gets rows, not a table that scrolls sideways: the name, the
              state, the three readings in mono, and the one action done from a
              list. Everything else is a tap on the name, into the workspace. */}
          <ul className="flex flex-col rounded-panel border border-hairline bg-surface max-sm:mb-20 sm:hidden">
            {shown.map((r) => {
              const tag = vastTagUrl(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex items-center justify-between gap-3 border-b border-l-[3px] border-b-hairline py-2 pr-2 pl-[13px] first:rounded-tl-panel last:rounded-bl-panel last:border-b-0 ${
                    statsAvailable ? RAIL[r.serving ? "live" : "dead"] : "border-l-transparent"
                  }`}
                >
                  <Link
                    href={`/dashboard/creatives/${r.id}`}
                    className="flex min-w-0 flex-col gap-0.5 rounded-ctl py-1"
                  >
                    <span className="truncate type-small font-medium">{r.label}</span>
                    {statsAvailable && (
                      <StateWord
                        tone={r.serving ? "live" : "dead"}
                        label={r.serving ? dict.dashboard.serving : dict.dashboard.notServing}
                      />
                    )}
                    <span className="data-instr type-caption text-fg-muted">
                      {statsAvailable
                        ? `${number.format(r.impressions)} · ${number.format(r.clicks)} · ${
                            r.impressions > 0 ? percent.format(r.clicks / r.impressions) : "—"
                          }`
                        : "—"}
                    </span>
                  </Link>
                  <CopyButton value={tag} size="md" className="shrink-0 border-0" variant="secondary" />
                </li>
              );
            })}
          </ul>

        <TableFrame className="max-sm:hidden">
          <table className="w-full border-collapse type-small">
            <TableHead>
              <th className={HEAD}>{dict.dashboard.creativeName}</th>
              <th className={`${HEAD} w-px`}>{dict.dashboard.format}</th>
              {/* Impressions, clicks and CTR. Viewability exists for VPAID and for
                  a VAST video creative from 4.0, and this list mixes formats — a
                  column that is structurally N/A for some rows would print a
                  ragged em dash with nowhere to put the qualifier §6 requires. It
                  lives on the creative's Stats, in its own tile. */}
              <th className={`${NUM_HEAD} w-px`}>{dict.dashboard.impressions}</th>
              <th className={`${NUM_HEAD} w-px`}>{dict.dashboard.clicks}</th>
              <th className={`${NUM_HEAD} w-px`}>{dict.dashboard.ctr}</th>
              <th className={`${HEAD} w-px`}>{dict.dashboard.status}</th>
              <th className={`${HEAD} w-px`} />
            </TableHead>
            <tbody>
              {shown.map((r) => {
                const tag = vastTagUrl(r.id);
                return (
                  <tr key={r.id} className={ROW}>
                    <td
                      className={railCell(
                        statsAvailable ? (r.serving ? "live" : "dead") : null,
                        "min-w-40",
                      )}
                    >
                      <Link
                        href={`/dashboard/creatives/${r.id}`}
                        // A name with no spaces must wrap, not push the table wide.
                        className="type-small font-medium underline-offset-4 hover:underline [overflow-wrap:anywhere]"
                      >
                        {r.label}
                      </Link>
                    </td>
                    <td className={`${CELL} ${FIT}`}>
                      <Chip>{r.format}</Chip>
                    </td>
                    {/* A zero is a real reading; the em dash appears only when the
                        aggregate itself is unavailable (§6). */}
                    <td className={`${CELL} ${FIT} data-instr text-right`}>
                      {statsAvailable ? number.format(r.impressions) : "—"}
                    </td>
                    <td className={`${CELL} ${FIT} data-instr text-right`}>
                      {statsAvailable ? number.format(r.clicks) : "—"}
                    </td>
                    <td className={`${CELL} ${FIT} data-instr text-right`}>
                      {/* Not `0%` with nothing delivered: that would claim nobody
                          clicked. No denominator is not measurable yet. */}
                      {statsAvailable && r.impressions > 0
                        ? percent.format(r.clicks / r.impressions)
                        : "—"}
                    </td>
                    <td className={`${CELL} ${FIT}`}>
                      {statsAvailable ? (
                        <ServingBadge
                          serving={r.serving}
                          label={r.serving ? dict.dashboard.serving : dict.dashboard.notServing}
                        />
                      ) : (
                        <span className="chip-instr text-fg-muted">—</span>
                      )}
                    </td>
                    <td className={`${CELL} ${FIT}`}>
                      {/* Copy tag, Edit and More keep visible words: an icon-only
                          version read as indistinguishable specks (§11). The full
                          tag is a hover away on the copy button and in full on the
                          creative's own page — a truncated "https://…/v?creative_id="
                          would show only the part every row shares. */}
                      <div className="flex items-center justify-end gap-2">
                        <div title={tag} className="inline-flex">
                          <CopyButton value={tag} size="sm" />
                        </div>
                        <Link
                          href={`/dashboard/creatives/${r.id}/edit`}
                          className={buttonClass("secondary", "sm")}
                        >
                          {dict.dashboard.edit}
                        </Link>
                        <MoreMenu portal creativeId={r.id} creativeName={r.label} tag={tag} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableFrame>
        </>
      )}
    </div>
  );
}
