import type { Dict, Locale } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/i18n/format";
import { BetaAccessButton } from "@/components/BetaAccessButton";
import { StateWord, type Tone } from "@/components/ui/State";
import {
  CELL,
  FIT,
  HEAD,
  railCell,
  ROW,
  TableFrame,
  TableHead,
} from "@/components/ui/Table";

/** What a row carries, as `app/dashboard/admin/page.tsx` derives it. */
export interface AccountRow {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  /**
   * `beta`: a live manual closed-beta grant; `subscription`: a live row a
   * billing provider wrote (any plan), which the grant action does not touch;
   * `none`.
   */
  access: "beta" | "subscription" | "none";
}

const RAIL_TONE: Record<AccountRow["access"], Tone | null> = {
  beta: "live",
  subscription: "info",
  none: null,
};

/**
 * The admin's accounts list (ADR-0034, docs/design-system.md §6): a state-rail
 * table like every other list in the dashboard. The email is the wrapping
 * column and mono — an address is an identifier; everything else is sized to
 * its content. A row with no access carries no rail (§6).
 */
export function AccountsTable({
  rows,
  dict,
  locale,
}: {
  rows: AccountRow[];
  dict: Dict;
  locale: Locale;
}) {
  return (
    <TableFrame>
      <table className="w-full border-collapse type-small">
        <TableHead>
          <th className={HEAD}>{dict.admin.email}</th>
          <th className={`${HEAD} w-px`}>{dict.admin.registered}</th>
          <th className={`${HEAD} w-px`}>{dict.admin.lastSignIn}</th>
          <th className={`${HEAD} w-px`}>{dict.admin.access}</th>
          <th className={`${HEAD} w-px`} />
        </TableHead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={ROW}>
              {/* One line, and the frame scrolls (§5): the table has a scroll
                  box to lean on, so the address need not break the way it
                  does in the 390px account panel, which has none. */}
              <td className={railCell(RAIL_TONE[r.access], "whitespace-nowrap")}>
                <span className="data-instr">{r.email}</span>
              </td>
              <td className={`${CELL} ${FIT} data-instr text-fg-muted`}>
                {formatDate(locale, r.createdAt)}
              </td>
              <td className={`${CELL} ${FIT} data-instr text-fg-muted`}>
                {r.lastSignInAt ? formatDate(locale, r.lastSignInAt) : "—"}
              </td>
              <td className={`${CELL} ${FIT}`}>
                {r.access === "beta" && <StateWord tone="live" label={dict.admin.beta} />}
                {r.access === "subscription" && (
                  <StateWord tone="info" label={dict.admin.subscription} />
                )}
                {/* No access is an absence, not a state (§6): no rail, no
                    state word — the em dash the metrics rule uses for one. */}
                {r.access === "none" && <span className="data-instr text-fg-muted">—</span>}
              </td>
              <td className={`${CELL} ${FIT}`}>
                {/* An external subscription is not ours to revoke: the row
                    offers a grant beside it, which simply adds a manual one. */}
                <BetaAccessButton userId={r.id} email={r.email} granted={r.access === "beta"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
