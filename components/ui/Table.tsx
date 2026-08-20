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

/** Row separator — `hairline`, the lighter inner rule that keeps a 30-row table from reading as a grid (§3). */
export const ROW = "border-b border-hairline last:border-b-0";

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
  return `border-b border-hairline last:border-b-0 border-l-[3px] ${
    tone ? RAIL[tone] : "border-l-transparent"
  } first:rounded-t-ctl last:rounded-b-ctl`;
}

/* ---------- readout density (docs/design-system.md §6) ---------- */

/**
 * 32px row, for machine readouts only.
 *
 * A readout is a table the system emits and the reader scans — the validator's
 * run timeline, feature matrix, wrapper chain and parser-versus-player table.
 * A list of things the user owns stays at 44px, always.
 *
 * The bar this density has to clear is legibility of the whole run, not fitting
 * more in: a sixty-row timeline at 44px is 2,640px of scrolling and the reader
 * loses the shape of it, which is the only thing a timeline is for. Ten
 * creatives at 32px would just be cramped, which is why the default does not
 * move.
 *
 * **No row in this density carries a row-level action.** A row you can act on is
 * not a readout and takes the full height — that constraint is what stops this
 * from becoming a general-purpose way to cram.
 *
 * The type is part of the cell rather than left to each call site. Without it the
 * cell inherits the 16px/24px body strut, and a 20px inline-block sitting on that
 * baseline pushes the line box to 40px — a 52px row wearing 32px padding. A cell
 * whose only content is a chip or another inline-block should wrap it in a
 * `flex` span, which has no line box at all.
 */
export const CELL_TIGHT = "px-3 py-1.5 align-middle type-small";

/** Header cell at the readout density. */
export const HEAD_TIGHT = "label-instr whitespace-nowrap px-3 py-1.5 text-left";

/** Right-aligned readout header, for numeric columns. */
export const NUM_HEAD_TIGHT = `${HEAD_TIGHT} text-right`;

/**
 * First cell of a readout row, carrying the 3px state rail.
 *
 * Left padding drops to 9px so rail plus padding still sum to the 12px cell
 * inset — the same arithmetic as `railCell`, one step down.
 */
export function railCellTight(tone: Tone | null, extra = ""): string {
  return `${CELL_TIGHT} border-l-[3px] pl-[9px] ${tone ? RAIL[tone] : "border-l-transparent"} ${extra}`;
}

/**
 * Scroll frame for a table.
 *
 * Wide content scrolls inside its own box; the page body never scrolls sideways
 * (§5). Separate from `Panel` because the scroll container is the point: a table
 * needs `overflow-x-auto` on the element that owns the border, not on a child.
 */
export function TableFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-panel border border-hairline bg-surface ${className}`}>
      {children}
    </div>
  );
}

/** Table head band — hairline rule beneath, sunken surface behind. */
export function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-hairline bg-surface-2">{children}</tr>
    </thead>
  );
}
