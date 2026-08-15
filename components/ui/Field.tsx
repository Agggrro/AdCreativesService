import { TEXT, TINT } from "@/components/ui/State";

/**
 * Instrument form control: 32px high, 3px radius, mono 13px — inputs hold URLs,
 * macros, and timecodes, where every character matters (docs/design-system.md §4).
 * No `outline-none`: the focus ring is the one thing a control may never lose.
 */
export const inputClass =
  "w-full min-h-8 rounded-ctl border border-line bg-surface px-2.5 py-1.5 font-mono text-[13px] text-fg placeholder:text-fg-muted";

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
      {help && <span className="text-xs text-fg-muted">{help}</span>}
    </label>
  );
}

/** Hairline panel — the default container. Depth is a line, never a shadow. */
export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-ctl border border-hairline bg-surface ${className ?? ""}`}
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
  children,
}: {
  tone: "info" | "warn" | "dead";
  live?: boolean;
  children: React.ReactNode;
}) {
  const styles = `${TINT[tone]} ${TEXT[tone]}`;
  return (
    <p
      role={live ? "alert" : undefined}
      className={`rounded-ctl px-3 py-2 text-[13px] leading-5 ${styles}`}
    >
      {children}
    </p>
  );
}
