"use client";

import { chipType } from "@/components/ui/Chip";

/**
 * The segmented control (docs/design-system.md §6).
 *
 * The same shape had been hand-copied into the language switcher, the landing
 * hero's template switcher and the preview panel's player tabs; all three now
 * use this. "One implementation per repeated element" is the rule that keeps the
 * next copy from quietly shipping at weight 400 or 24px high — which is exactly
 * what had already happened, the three copies having drifted to three different
 * paddings for want of a shared line-height.
 *
 * The configurator's format picker (`ConfiguratorForm.tsx`) is deliberately NOT
 * migrated: it wraps an `sr-only` radio group so the browser enforces
 * single-selection inside a form and the value posts natively. That is a
 * genuinely different control wearing the same clothes, and folding it in would
 * mean this component growing a form mode it has no other caller for.
 *
 * Three details are load-bearing rather than cosmetic:
 *
 * The type comes from `chipType`, not from hand-written utilities, so the role
 * is defined in one place — including `leading-4`, whose absence is what made
 * the old copies need different padding to look alike.
 *
 * The wrapper must not clip overflow. The focus ring is drawn 2px outside the
 * element, so an `overflow-hidden` wrapper makes keyboard focus invisible —
 * which is why the corners are rounded on the first and last segment instead of
 * on the container.
 *
 * The current segment is marked with `bg-fill`, never the accent. A segmented
 * control is a choice among peers, not a task action, and the accent means
 * action (§3).
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group — required, since the strip has no visible label. */
  label: string;
  /** Stretch segments to fill the available width. */
  fill?: boolean;
  /**
   * Allow segments onto a second line. For strips whose labels are content —
   * the landing hero's template names — where a fixed row would either overflow
   * or force truncation.
   */
  wrap?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  fill = false,
  wrap = false,
  className = "",
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex rounded-ctl border border-line bg-surface ${fill ? "w-full" : ""} ${
        wrap ? "flex-wrap" : ""
      } ${className}`}
    >
      {options.map((option) => {
        const current = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={current}
            disabled={option.disabled}
            className={`${chipType} border-r border-hairline px-2.5 py-1.5 transition-colors first:rounded-l-ctl last:rounded-r-ctl last:border-r-0 ${
              fill ? "flex-1" : ""
            } ${
              // `current` is checked before `disabled`, not after. A disabled
              // strip still has a current segment, and dropping `bg-fill` from
              // it leaves the choice shown in neither colour nor form while
              // `aria-pressed` below still says which one it is — visual and
              // accessible state disagreeing about the same fact (§9, "state
              // encoded in form as well as colour").
              current
                ? `bg-fill text-fg${option.disabled ? " cursor-not-allowed" : ""}`
                : option.disabled
                  ? "cursor-not-allowed text-fg-disabled"
                  : "text-fg-secondary hover:bg-fill"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
