"use client";

import { ChevronDown } from "lucide-react";
import type { ConfigField } from "@/lib/config-schema";
import { useDict } from "@/components/i18n/LocaleProvider";
import { RAIL, StateWord } from "@/components/ui/State";

/** One collapsible row: an answer path and the fields that configure its exit. */
export interface OutcomeBlock {
  id: string;
  fields: ConfigField[];
}

/**
 * `A → A → B`. The path is machine text, not copy — it is the same string in
 * both locales, so it needs no dictionary entry (docs/design-system.md §10).
 *
 * A block whose fields declare no `block` falls back to the first field's name,
 * which is still machine text. Blocks come from the database, and the contract
 * for a schema this code did not anticipate is to degrade *visibly* — a row
 * labelled only by its state word has no accessible name at all.
 */
export function formatPath(block: OutcomeBlock): string {
  if (!block.id) return block.fields[0]?.name ?? "—";
  return block.id.split("").join(" → ");
}

/** Partition a matrix group's fields into blocks, preserving schema order. */
export function toOutcomeBlocks(fields: ConfigField[]): OutcomeBlock[] {
  const blocks: OutcomeBlock[] = [];
  const byId = new Map<string, OutcomeBlock>();
  for (const field of fields) {
    const id = field.block ?? "";
    let block = byId.get(id);
    if (!block) {
      block = { id, fields: [] };
      byId.set(id, block);
      blocks.push(block);
    }
    block.fields.push(field);
  }
  return blocks;
}

/** A block is complete when every field it requires actually has a value. */
export function isBlockComplete(
  block: OutcomeBlock,
  values: Record<string, string>,
): boolean {
  return block.fields.every(
    (f) => !f.required || (values[f.name] ?? "").trim() !== "",
  );
}

/**
 * The `kind: "matrix"` group renderer (ADR-0011): one row per answer path, with
 * the open row's fields inline beneath it.
 *
 * Why a list rather than the 24 stacked inputs a flat schema would produce: at
 * three steps there are eight exits, and a form that renders all of them at once
 * stops being scannable long before it stops being correct. This is the table
 * shape the design system already mandates for lists (§6) — a 3px semantic rail,
 * a state word, 44px rows — carrying a real state (configured / empty) rather
 * than a decorative one.
 *
 * Closed rows keep their values in `type="hidden"` inputs, so `FormData` is
 * complete no matter which row is open. Hidden inputs are barred from
 * constraint validation, so this cannot produce the "invalid form control is not
 * focusable" submit-does-nothing failure that `display:none` on a `required`
 * field causes — `ConfiguratorForm`'s own guard is what enforces completeness.
 *
 * Accent budget: zero. The open row is marked with `bg-surface-2`, which
 * merges it into the panel it opens, leaving the page's single warm element the
 * submit button (§3).
 *
 * Under Instrument this row could not use the sunken surface: `idle-fg` on `fill`
 * measured 4.49:1, just under the threshold for the 11px state word, and "open and
 * still empty" is the row a user looks at most. Rebuilding the ramp for dark
 * closed that gap — `idle` on `surface-2` now measures 6.54:1 — so the workaround
 * is gone and `bg-surface-2` is simply the right surface.
 */
export function OutcomeMatrix({
  blocks,
  values,
  openId,
  onToggle,
  renderField,
}: {
  blocks: OutcomeBlock[];
  values: Record<string, string>;
  openId: string | null;
  onToggle: (id: string) => void;
  renderField: (field: ConfigField) => React.ReactNode;
}) {
  const dict = useDict();
  const done = blocks.filter((b) => isBlockComplete(b, values)).length;

  return (
    <div className="flex flex-col gap-2">
      {/*
        This is `Panel`'s class string, and it may as well be a `Panel` now —
        `Panel` stopped setting `overflow-hidden`, which was the whole reason
        this was hand-rolled: a focus ring drawn 2px outside a row button was
        being clipped away by it (§2). Left inline only because the rows round
        their own first/last corners, which a generic container has no business
        knowing about.
      */}
      <div className="rounded-panel border border-hairline bg-surface">
        {blocks.map((block, i) => {
          const complete = isBlockComplete(block, values);
          const open = openId === block.id;
          const panelId = `outcome-${block.id || i}`;
          return (
            <div
              key={block.id}
              className={i > 0 ? "border-t border-hairline" : undefined}
            >
              <button
                type="button"
                onClick={() => onToggle(block.id)}
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                className={`flex min-h-11 w-full items-center gap-3 border-l-[3px] py-2 pr-4 pl-[13px] text-left transition-colors duration-150 first:rounded-t-ctl last:rounded-b-ctl ${
                  RAIL[complete ? "live" : "idle"]
                } ${open ? "bg-surface-2" : "hover:bg-surface-2"}`}
              >
                <span className="data-instr flex-1 type-small text-fg">
                  {formatPath(block)}
                </span>
                <StateWord
                  tone={complete ? "live" : "idle"}
                  label={
                    complete
                      ? dict.configurator.outcomes.complete
                      : dict.configurator.outcomes.empty
                  }
                />
                <ChevronDown
                  size={14}
                  aria-hidden
                  className={`shrink-0 text-fg-muted transition-transform duration-150 ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>

              {open ? (
                <div
                  id={panelId}
                  className="flex flex-col gap-4 border-t border-hairline bg-surface-2 px-4 py-4 last:rounded-b-ctl"
                >
                  {block.fields.map((field) => renderField(field))}
                </div>
              ) : (
                // Values for closed rows still have to reach the server action.
                // `type="hidden"` is exempt from React's controlled-input
                // warning, so no onChange is needed — and must not be added,
                // since `values` upstream is the only writer.
                block.fields.map((field) => (
                  <input
                    key={field.name}
                    type="hidden"
                    name={field.name}
                    value={values[field.name] ?? ""}
                    readOnly
                  />
                ))
              )}
            </div>
          );
        })}
      </div>

      {/*
        The only progress signal in the matrix. Announced politely, because a
        screen-reader user filling the last field of a row otherwise gets no
        confirmation that the set is now complete.
      */}
      <p className="label-instr" aria-live="polite">
        {dict.configurator.outcomes.filled} {done} / {blocks.length}
      </p>
    </div>
  );
}
