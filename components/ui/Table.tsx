import { RAIL, type Tone } from "@/components/ui/State";

/**
 * The data-table row treatment (docs/design-system.md §6).
 *
 * These four class strings had been hand-copied into every list in the product
 * — the creatives table, the subscriptions table, and then three more times by
 * the validator — which is precisely the drift §6's "one implementation per
 * repeated element" exists to stop. `ui/Button.tsx`, `ui/Chip.tsx` and
 * `ui/State.tsx` are the pattern; this is the fourth.
 *
 * Deliberately class helpers rather than components. §6 notes that some lists
 * take the treatment without the element — the configurator's outcome matrix is
 * a disclosure list, and so is the validator's findings list — so a `<Table>`
 * component would be unusable in exactly the cases most at risk of drifting.
 */

/** 44px row at the 13/20 body size. */
export const CELL = "px-4 py-3 align-middle";

/** Header cell: the mono uppercase label role. */
export const HEAD = "label-instr whitespace-nowrap px-4 py-2 text-left";

/** Right-aligned header, for numeric columns. */
export const NUM_HEAD = `${HEAD} text-right`;

/** Row separator — `fill`, lighter than the panel's `hairline` edge. */
export const ROW = "border-b border-fill last:border-b-0";

/**
 * First cell of a row, carrying the 3px state rail.
 *
 * `padding-left` drops to 13px so rail plus padding still sum to the 16px cell
 * inset; the right padding stays at 16px, since there is no rail on that side.
 *
 * Pass `null` for a row that carries no real state: a rail on every row teaches
 * the reader that the rail means nothing (§6). The same applies when a value is
 * unmeasurable rather than absent — there is nothing to encode either way.
 */
export function railCell(tone: Tone | null, extra = ""): string {
  return `${CELL} border-l-[3px] pl-[13px] ${tone ? RAIL[tone] : "border-l-transparent"} ${extra}`;
}

/**
 * A row of a disclosure list that takes the table treatment without being a
 * table — the outcome-matrix precedent (§6: "take the treatment, not the
 * element"). Rounds its own first/last edge, because the container must not be
 * `overflow-hidden` or the 2px-offset focus ring is clipped away (§3).
 */
export function railRow(tone: Tone | null): string {
  return `border-b border-fill last:border-b-0 border-l-[3px] ${
    tone ? RAIL[tone] : "border-l-transparent"
  } first:rounded-t-ctl last:rounded-b-ctl`;
}

/**
 * Scroll frame for a table.
 *
 * Wide content scrolls inside its own box; the page body never scrolls sideways
 * (§5). Not `Panel`, which sets `overflow-hidden` and would clip focus rings.
 */
export function TableFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-ctl border border-hairline bg-surface ${className}`}>
      {children}
    </div>
  );
}

/** Table head band — hairline rule beneath, sunken surface behind. */
export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-hairline bg-surface-sunken">{children}</tr>
    </thead>
  );
}
