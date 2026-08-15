import { statusLabel, statusTone, type Dict } from "@/lib/i18n/dictionaries";
import { chipType } from "@/components/ui/Chip";

export type Tone = "live" | "info" | "warn" | "dead" | "idle";

const DOT: Record<Tone, string> = {
  live: "bg-live",
  info: "bg-info",
  warn: "bg-warn",
  dead: "bg-dead",
  idle: "bg-idle",
};

/** Foreground for a state word or a tinted notice. */
export const TEXT: Record<Tone, string> = {
  live: "text-live-fg",
  info: "text-info-fg",
  warn: "text-warn-fg",
  dead: "text-dead-fg",
  idle: "text-idle-fg",
};

/** 3px state rail on the first cell of a table row (docs/design-system.md §6). */
export const RAIL: Record<Tone, string> = {
  live: "border-l-live",
  info: "border-l-info",
  warn: "border-l-warn",
  dead: "border-l-dead",
  idle: "border-l-idle",
};

/** Tint background, for the few places a state needs a fill rather than a rail. */
export const TINT: Record<Tone, string> = {
  live: "bg-live-bg",
  info: "bg-info-bg",
  warn: "bg-warn-bg",
  dead: "bg-dead-bg",
  // idle-fg on idle-bg measures 4.49:1 — under AA for small text, so this pair
  // is deliberately absent rather than quietly wrong (docs/design-system.md §3).
  idle: "bg-surface-sunken",
};

/**
 * State as dot + mono uppercase word — the one shape every status in the product
 * uses (docs/design-system.md §6). State is encoded in form as well as colour,
 * so it still reads for someone who cannot separate the two hues.
 *
 * This is the single implementation the badges below are built from; a fourth
 * hand-rolled copy is how the dot quietly ships at a different size.
 */
export function StateWord({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${chipType} ${TEXT[tone]}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${DOT[tone]}`} />
      {label}
    </span>
  );
}

/**
 * Whether a creative's tag is actually alive, from the entitlement the serving
 * gate uses — not from `creatives.status`, which has no update path and would
 * paint every row the same (docs/design-system.md §6, ADR-0008).
 */
export function ServingBadge({
  serving,
  label,
  qualifier,
}: {
  serving: boolean;
  label: string;
  qualifier?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <StateWord tone={serving ? "live" : "dead"} label={label} />
      {qualifier && (
        <span className="text-xs leading-4 text-fg-muted">{qualifier}</span>
      )}
    </span>
  );
}

/** A subscription/creative status word, resolved through the dictionary. */
export function StateBadge({ status, dict }: { status: string; dict: Dict }) {
  return (
    <StateWord tone={statusTone(status)} label={statusLabel(dict, status)} />
  );
}
