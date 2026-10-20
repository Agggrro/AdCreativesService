"use client";

import { ChevronRight } from "lucide-react";
import type { ConfigField } from "@/lib/config-schema";
import { MediaUploadField } from "@/components/MediaUploadField";
import { HelpLabel } from "@/components/ui/Tooltip";

/**
 * A `kind: "scenario"` group (docs/design-system.md §6, "Scenario"): one row per
 * block, one column per media field, in the order the clips play — Duel's
 * vote → win → after for each side (ADR-0030).
 *
 * The block's other fields head the row, through the form's own field renderer;
 * its media fields are compact tiles. Column headers come from the first block's
 * media fields: numbered in play order, each the `HelpLabel` trigger for that
 * field's help — so a schema writes stage help that holds for every block.
 *
 * The same table draws a `kind: "options"` group (`ordered` false), Step
 * Builder's options per step (ADR-0031): the media are variants of one option,
 * not stages in play order, so the columns carry no number and no chevron.
 * There a row head is only the option's label and value, so its fields render
 * without their help, which would run a dozen lines down a 10rem column; the
 * schema explains them in the step's own full-width fields.
 */

type Block = { id: string; heads: ConfigField[]; stages: ConfigField[] };

function toBlocks(fields: ConfigField[]): Block[] {
  const blocks: Block[] = [];
  for (const field of fields) {
    const id = field.block ?? "";
    let block = blocks.find((b) => b.id === id);
    if (!block) {
      block = { id, heads: [], stages: [] };
      blocks.push(block);
    }
    (field.type === "image" ? block.stages : block.heads).push(field);
  }
  return blocks;
}

// Whole class strings, so the build sees every one it must generate. Four stages
// is the widest scheme the layout is drawn for.
const MAX_STAGES = 4;
const MOBILE_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};
const WIDE_COLS: Record<number, string> = {
  1: "sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]",
  2: "sm:grid-cols-[minmax(0,10rem)_repeat(2,minmax(0,1fr))]",
  3: "sm:grid-cols-[minmax(0,10rem)_repeat(3,minmax(0,1fr))]",
  4: "sm:grid-cols-[minmax(0,10rem)_repeat(4,minmax(0,1fr))]",
};
const HEAD_SPAN: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
};

export function ScenarioGrid({
  ordered = true,
  fields,
  values,
  onChange,
  requiredLabel,
  renderField,
}: {
  /** Stages in play order (scenario), or unordered variants (options). */
  ordered?: boolean;
  fields: ConfigField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  requiredLabel: string;
  /** The form's own field renderer, for the row heads — one implementation (§6). */
  renderField: (field: ConfigField) => React.ReactNode;
}) {
  const blocks = toBlocks(fields);
  const columns = blocks[0]?.stages ?? [];
  const widest = Math.max(1, ...blocks.map((b) => b.stages.length));
  if (widest > MAX_STAGES && process.env.NODE_ENV !== "production") {
    // Still rendered — every stage keeps its hidden input, so nothing saved is
    // dropped — but past four the columns stop lining up.
    console.warn(
      `${ordered ? "scenario" : "options"} group has ${widest} stages; the layout is drawn for ${MAX_STAGES}`,
    );
  }
  // An options table is at least two columns wide, so a step with one clip per
  // option gets a tile the width of its neighbours' rather than a bar across
  // the form; the spare cell is a filler.
  const n = Math.min(ordered ? widest : Math.max(widest, 2), MAX_STAGES);
  if (!ordered && process.env.NODE_ENV !== "production") {
    for (const b of blocks) {
      for (const f of b.heads) {
        // Dropped below, where it would run down a 10rem column (§6 "Options").
        if (f.help) console.warn(`options group: help on row-head field "${f.name}" is not shown`);
      }
    }
  }
  const stageName = (f: ConfigField, i: number) => (ordered ? `${i + 1} · ${f.label}` : f.label);
  // The header speaks for every row, so it says "required" only when every row
  // requires that column — an options group's C and D rows do not.
  const columnRequired = (i: number) =>
    blocks.every((b) => !b.stages[i] || b.stages[i].required);

  return (
    <div className={`grid gap-x-4 gap-y-3 ${MOBILE_COLS[n]} ${WIDE_COLS[n]}`}>
      {/* Header row: an empty corner over the row heads, then the stages. The
          required mark gets its own line: next to the help icon it outgrows a
          106px column in Russian. */}
      <span className="hidden sm:block" aria-hidden />
      {Array.from({ length: n }, (_, i) => {
        const f = columns[i];
        if (!f) return <span key={`empty-${i}`} aria-hidden />;
        return (
          <div key={f.name} className="flex min-w-0 flex-col gap-0.5">
            {f.help ? (
              <HelpLabel label={stageName(f, i)} help={f.help} />
            ) : (
              <span className="label-instr">{stageName(f, i)}</span>
            )}
            {f.required && columnRequired(i) && (
              <span className="label-instr text-fg-muted">{requiredLabel}</span>
            )}
          </div>
        );
      })}

      {blocks.map((block) => (
        <div key={block.id} className="contents">
          <div className={`flex min-w-0 flex-col gap-3 ${HEAD_SPAN[n]} sm:col-span-1`}>
            {block.heads.map((f) =>
              renderField({
                ...f,
                label: block.id ? `${block.id} · ${f.label}` : f.label,
                help: ordered ? f.help : undefined,
              }),
            )}
          </div>
          {block.stages.map((f, i) => (
            <div key={f.name} className="relative min-w-0">
              {ordered && i % n > 0 && (
                <ChevronRight
                  size={12}
                  aria-hidden
                  className="absolute top-14 -left-3.5 -translate-y-1/2 text-fg-muted"
                />
              )}
              <MediaUploadField
                field={f}
                variant="tile"
                tileLabel={`${block.id ? `${block.id} · ` : ""}${stageName(f, i)}${
                  f.required ? ` · ${requiredLabel}` : ""
                }`}
                value={values[f.name] ?? ""}
                onChange={(v) => onChange(f.name, v)}
              />
              {/* Options columns are unordered variants: below 640px the header
                  is rows away, and a column header cannot say which rows require
                  it. So each tile names its column, and its own requirement. */}
              {!ordered && (
                <span className="label-instr mt-1 block text-fg-muted">
                  {f.label}
                  {f.required ? ` · ${requiredLabel}` : ""}
                </span>
              )}
            </div>
          ))}
          {!ordered &&
            Array.from({ length: Math.max(0, n - block.stages.length) }, (_, k) => (
              <span key={`fill-${k}`} aria-hidden className="hidden sm:block" />
            ))}
        </div>
      ))}
    </div>
  );
}
