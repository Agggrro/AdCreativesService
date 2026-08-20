/**
 * The `chip` type role (docs/design-system.md §4): mono 11/16 weight 500,
 * uppercase, 0.07em. Used for format/standard chips and anything else that sits
 * inside a box rather than above one.
 *
 * One definition, like Button — five hand-rolled copies is how the weight
 * quietly became 400 on every one of them.
 */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="chip-instr rounded-ctl bg-surface-2 px-2 py-1 text-fg-secondary">
      {children}
    </span>
  );
}

/** The chip's type treatment without the box — for state words and segments. */
export const chipType = "chip-instr";
