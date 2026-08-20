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
  live: "text-live",
  info: "text-info",
  warn: "text-warn",
  dead: "text-dead",
  idle: "text-idle",
};

/** 3px state rail on the first cell of a table row (docs/design-system.md §6). */
export const RAIL: Record<Tone, string> = {
  live: "border-l-live",
  info: "border-l-info",
  warn: "border-l-warn",
  dead: "border-l-dead",
  idle: "border-l-idle",
};

/**
 * Tint background, for the few places a state needs a fill rather than a rail.
 *
 * Every tone reads on its own tint here — 6.5–7.8:1, measured. Under Instrument
 * `idle` was the one pair that could not be combined (4.49:1, under AA), and it
 * had to fall back to the plain sunken surface; rebuilding the ramp for dark
 * (docs/design-system.md §3) closed that gap, so the exception is gone.
 */
export const TINT: Record<Tone, string> = {
  live: "bg-live-bg",
  info: "bg-info-bg",
  warn: "bg-warn-bg",
  dead: "bg-dead-bg",
  idle: "bg-idle-bg",
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
        <span className="type-caption text-fg-muted">{qualifier}</span>
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
