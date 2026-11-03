import Link from "next/link";
import { vastTagUrl } from "@/lib/site";
import { LOCALE_TAG, type Dict, type Locale } from "@/lib/i18n/dictionaries";
import { CopyButton } from "@/components/CopyButton";
import { DeleteCreativeButton } from "@/components/DeleteCreativeButton";
import { DuplicateCreativeButton } from "@/components/DuplicateCreativeButton";
import { buttonClass } from "@/components/ui/Button";
import { ServingBadge } from "@/components/ui/State";
import { Chip } from "@/components/ui/Chip";
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

/**
 * Every column but the name is sized to its content (`FIT`, from ui/Table), and
 * the name takes what is left and wraps. Nothing here changes width with state:
 * the copy button stacks both of its labels in one cell.
 *
 * `TableFrame` is `overflow-x-auto`, which clips like `overflow-hidden` does:
 * the focus rings on edge-adjacent buttons survive only because every cell's
 * padding (12px+) exceeds the ring's 4px — do not trim it (§2). Below the
 * width the content needs, the table scrolls inside that frame (§5).
 */

export function CreativesTable({
  rows,
  statsAvailable,
  dict,
  locale,
}: {
  rows: CreativeRow[];
  /** False when the overview aggregate failed: show em dashes, not zeros (§6). */
  statsAvailable: boolean;
  dict: Dict;
  locale: Locale;
}) {
  const number = new Intl.NumberFormat(LOCALE_TAG[locale]);

  return (
    <TableFrame>
      <table className="w-full border-collapse type-small">
        <TableHead>
          <th className={HEAD}>{dict.dashboard.creativeName}</th>
          <th className={`${HEAD} w-px`}>{dict.dashboard.format}</th>
          {/* Impressions and clicks only. Viewability exists for VPAID and
              for a VAST video creative from 4.0, and this list mixes formats
              — a column that is structurally N/A for some rows would print a
              ragged em dash with nowhere to put the qualifier §6 requires. It
              lives on the detail page, in its own strip. */}
          <th className={`${NUM_HEAD} w-px`}>{dict.dashboard.impressions}</th>
          <th className={`${NUM_HEAD} w-px`}>{dict.dashboard.clicks}</th>
          <th className={`${HEAD} w-px`}>{dict.dashboard.status}</th>
          <th className={`${HEAD} w-px`}>{dict.dashboard.vastTag}</th>
          <th className={`${HEAD} w-px`} />
        </TableHead>
        <tbody>
          {rows.map((r) => {
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
                {/* A zero is a real reading; the em dash appears only
                    when the aggregate itself is unavailable (§6). */}
                <td className={`${CELL} ${FIT} data-instr text-right`}>
                  {statsAvailable ? number.format(r.impressions) : "—"}
                </td>
                <td className={`${CELL} ${FIT} data-instr text-right`}>
                  {statsAvailable ? number.format(r.clicks) : "—"}
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
                  {/* No truncated tag preview here: at any column width
                      that still leaves room for the rest of the row, a
                      truncated "https://…/v?creative_id=" shows only the part
                      every row shares and cuts off before the id that
                      actually tells rows apart. Full value is a hover away
                      on this wrapper, and in full on the creative's own
                      page (the row's name links there). */}
                  <div title={tag} className="inline-flex">
                    <CopyButton value={tag} size="sm" />
                  </div>
                </td>
                <td className={`${CELL} ${FIT}`}>
                  {/* Edit, Duplicate and Delete keep visible words: the
                      icon-only version this table once shipped with read as
                      indistinguishable specks (§11). With three actions the
                      words drop their icons instead — with them the actions
                      leave the name about 120px at the 1200px container. */}
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/dashboard/creatives/${r.id}/edit`}
                      className={buttonClass("secondary", "sm")}
                    >
                      {dict.dashboard.edit}
                    </Link>
                    <DuplicateCreativeButton creativeId={r.id} />
                    <DeleteCreativeButton creativeId={r.id} creativeName={r.label} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableFrame>
  );
}
