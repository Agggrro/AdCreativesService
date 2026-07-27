/**
 * The `chip` type role (docs/design-system.md §4): mono 11/16 weight 500,
 * uppercase, 0.06em. Used for format/standard chips and anything else that sits
 * inside a box rather than above one.
 *
 * One definition, like Button — five hand-rolled copies is how the weight
 * quietly became 400 on every one of them.
 */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-ctl bg-fill px-1.5 py-0.5 font-mono text-[11px] font-medium leading-4 uppercase tracking-[0.06em] text-fg-secondary">
      {children}
    </span>
  );
}

/** The chip's type treatment without the box — for state words and segments. */
export const chipType =
  "font-mono text-[11px] font-medium leading-4 uppercase tracking-[0.06em]";
