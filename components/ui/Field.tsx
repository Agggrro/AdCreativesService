import { TEXT, TINT } from "@/components/ui/State";

/**
 * Midnight form control: 44px high (§6). 32px is the dense-table exception, not the default, mono 13px — inputs hold URLs,
 * macros, and timecodes, where every character matters (docs/design-system.md §4).
 * No `outline-none`: the focus ring is the one thing a control may never lose.
 */
export const inputClass =
  "w-full min-h-11 rounded-ctl border border-line bg-surface px-2.5 py-1.5 type-data text-fg placeholder:text-fg-muted";

export function Field({
  label,
  name,
  type = "text",
  required = true,
  minLength,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  help?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-instr">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className={inputClass}
      />
      {help && <span className="type-caption text-fg-muted">{help}</span>}
    </label>
  );
}

/**
 * Hairline panel — the default container. Depth is elevation plus a line, never a
 * shadow (docs/design-system.md §2).
 *
 * **No `overflow-hidden`.** It used to have one, and it made this primitive
 * unusable for anything containing a focusable child: §2's focus ring is drawn at
 * 2px offset, so a clipping parent erases it. Four call sites had already refused
 * `Panel` and hand-rolled the same box with a comment explaining why — `Table`,
 * `ValidatorReport`, `OutcomeMatrix` and the creatives list. Four workarounds is
 * the signal that the primitive was wrong, not the call sites.
 *
 * The cost is that a child with its own background no longer gets clipped to the
 * rounded corner: a filled panel header rounds its own top corners.
 */
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-panel border border-hairline bg-surface ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/**
 * Inline notice: cold semantics only — an alarm is never warm.
 *
 * Tint and foreground come from `ui/State.tsx` rather than being written out
 * here, so a notice and a state word can never disagree about what a tone
 * looks like.
 *
 * `live` marks a notice that appears *in place*, without a navigation, so a
 * screen reader has nothing else to announce it — set it whenever the notice is
 * raised by client-side validation. Server-rendered notices leave it off: the
 * navigation already moves focus, and `role="alert"` would double up.
 */
export function Notice({
  tone,
  live,
  detail,
  children,
}: {
  tone: "info" | "warn" | "dead";
  live?: boolean;
  /**
   * A machine value the notice is about — an address to allow, an id to quote.
   * Mono on its own line, because it is a value to copy rather than a word in
   * the sentence (docs/design-system.md §4). Part of the component so the two
   * surfaces that show one cannot drift into two different treatments.
   */
  detail?: string;
  children: React.ReactNode;
}) {
  const styles = `${TINT[tone]} ${TEXT[tone]}`;
  return (
    <p
      role={live ? "alert" : undefined}
      className={`rounded-panel px-3 py-2 type-small ${styles}`}
    >
      {children}
      {detail && (
        <span className="data-instr mt-1 block type-caption break-all">{detail}</span>
      )}
    </p>
  );
}
