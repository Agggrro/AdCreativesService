"use client";

import { useEffect, useId, useRef } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatAnswerPath,
  isClickField,
  type ConfigField,
} from "@/lib/config-schema";
import { groupLabel } from "@/lib/i18n/dictionaries";
import { MediaUploadField } from "@/components/MediaUploadField";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import { MacroText } from "@/components/ui/MacroText";
import { Segmented } from "@/components/ui/Segmented";
import { RAIL } from "@/components/ui/State";
import { HelpLabel } from "@/components/ui/Tooltip";
import {
  HEX_RE,
  isColorField,
  type FieldRun,
  type Section,
} from "@/components/configurator/model";

/**
 * What the workspace's inspector draws for one section of a template's schema
 * (docs/design-system.md §6, "Workspace"; ADR-0038): the section's fields as a
 * single 340px column — a label, a 44px control, nothing else.
 *
 * Every control posts under the field's own `name`, exactly as the long form did,
 * so the Server Action behind it is untouched. What a section does not show still
 * has to reach it: the workspace writes a hidden input for every active field of
 * the other sections, and `OutcomeDrill` does the same for the paths it is not
 * editing.
 */

type Values = Record<string, string>;

/* ------------------------------------------------------------------ field */

/** A required field is marked with `*` and nothing else (§10, "Text earns its place"). */
function labelOf(field: ConfigField, prefix?: string) {
  return `${prefix ? `${prefix} · ` : ""}${field.label}${field.required ? " *" : ""}`;
}

function LabelRow({
  field,
  id,
  text,
  macros,
  trailing,
}: {
  field: ConfigField;
  id: string;
  text: string;
  macros: boolean;
  trailing?: React.ReactNode;
}) {
  const dict = useDict();
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      {field.help ? (
        <HelpLabel label={text} help={field.help} />
      ) : (
        <label htmlFor={id} className="label-instr">
          {text}
        </label>
      )}
      {trailing}
      {macros && (
        <HelpLabel
          label={dict.workspace.macros}
          help={<MacroText text={dict.configurator.clickMacroHint} />}
          className="type-caption text-fg-secondary"
        />
      )}
    </div>
  );
}

/**
 * The widest row of labels a segmented control may carry, in characters. The
 * inspector's 299px hold about 28 characters of chip type with each segment's
 * padding; a row past it wraps every button onto two lines.
 */
const SEGMENTED_MAX_CHARS = 26;

/**
 * A required select of at most three short options is a segmented control; anything
 * longer stays a select. "Short" is the row, not each label — "Built-in chime", "My
 * sound file" and "No sound" are each short and do not fit together. An optional
 * select stays a select: a segmented control has no empty choice to clear it with.
 */
function isSegmentedSelect(field: ConfigField) {
  const options = field.options ?? [];
  return (
    field.type === "select" &&
    field.required === true &&
    options.length > 0 &&
    options.length <= 3 &&
    options.every((o) => o.label.length <= 14) &&
    options.reduce((n, o) => n + o.label.length, 0) <= SEGMENTED_MAX_CHARS
  );
}

export function InspectorField({
  field,
  value,
  onChange,
  bare = false,
  labelPrefix,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
  /** No visible label — the field sits in a row that names it (an option's label). */
  bare?: boolean;
  labelPrefix?: string;
}) {
  const id = useId();
  const text = labelOf(field, labelPrefix);
  const aria = `${labelPrefix ? `${labelPrefix} · ` : ""}${field.label}`;
  const macros = isClickField(field);

  const common = {
    id,
    name: field.name,
    required: field.required,
    "aria-label": aria,
  } as const;

  let control: React.ReactNode;
  if (field.type === "textarea") {
    control = (
      <textarea
        {...common}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={field.rows ?? 3}
        maxLength={field.maxLength}
        // Source, when the field holds a document: the text a person wrote is
        // not the text a browser should tidy.
        spellCheck={field.rows !== undefined && field.rows >= 8 ? false : undefined}
        // Vertical only: a sideways drag would push a tall source field past the
        // inspector column and scroll the page sideways (§5).
        className={`${inputClass} resize-y`}
      />
    );
  } else if (field.type === "select" && isSegmentedSelect(field)) {
    control = (
      <>
        <input type="hidden" name={field.name} value={value} />
        <Segmented
          className="self-start"
          label={aria}
          value={value}
          onChange={onChange}
          options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
        />
      </>
    );
  } else if (field.type === "select") {
    control = (
      <select
        {...common}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {!field.required && <option value="">—</option>}
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (field.type === "range") {
    control = (
      <input
        {...common}
        type="range"
        min={field.min ?? 0}
        max={field.max ?? 100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block h-11 w-full accent-fg-secondary"
      />
    );
  } else if (field.type === "image") {
    control = (
      <MediaUploadField field={field} value={value} onChange={onChange} variant="row" />
    );
  } else if (isColorField(field)) {
    control = (
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-11 shrink-0 rounded-ctl border border-line"
          // The viewer's own colour is data, not a design token: a swatch of what
          // they typed, and nothing when it is not a colour yet.
          style={HEX_RE.test(value.trim()) ? { backgroundColor: value.trim() } : undefined}
        />
        <input
          {...common}
          type="text"
          placeholder={field.placeholder ?? "#"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      </div>
    );
  } else {
    control = (
      <input
        {...common}
        type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
        min={field.type === "number" ? field.min : undefined}
        max={field.type === "number" ? field.max : undefined}
        maxLength={field.type === "text" ? field.maxLength : undefined}
        placeholder={field.placeholder ?? (bare ? field.label : undefined)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    );
  }

  if (bare) return <>{control}</>;

  return (
    <div className="flex flex-col gap-2">
      <LabelRow
        field={field}
        id={id}
        text={text}
        macros={macros}
        trailing={
          field.type === "range" ? (
            <span className="data-instr ml-auto type-small text-fg-secondary">
              {value || "0"}
            </span>
          ) : undefined
        }
      />
      {control}
    </div>
  );
}

/* ----------------------------------------------------------------- blocks */

type Block = { id: string; heads: ConfigField[]; stages: ConfigField[] };

/** A group's fields by `block`; a block's text fields head it and its media follow. */
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

/** The letter of an option or a side: mono in a small chip (§4, §6). */
function BlockChip({ id }: { id: string }) {
  return (
    <span className="chip-instr w-7 shrink-0 rounded-ctl bg-surface-2 py-1 text-center text-fg-secondary">
      {id}
    </span>
  );
}

function StageCaption({ field, text }: { field: ConfigField; text: string }) {
  return field.help ? (
    <HelpLabel label={text} help={field.help} />
  ) : (
    <span className="label-instr block truncate" title={text}>
      {text}
    </span>
  );
}

/**
 * A `kind: "options"` group: one row per option — its letter and label, then its
 * media (docs/design-system.md §6, "Options"). Step Builder's options per step
 * (ADR-0031): variants of one option, not stages in play order, so the media carry
 * their own name and no number.
 */
export function OptionRows({
  fields,
  values,
  onChange,
}: {
  fields: ConfigField[];
  values: Values;
  onChange: (name: string, v: string) => void;
}) {
  const blocks = toBlocks(fields);
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block) => {
        const [lead, ...rest] = block.heads;
        return (
          <div key={block.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <BlockChip id={block.id} />
              <div className="min-w-0 flex-1">
                {lead && (
                  <InspectorField
                    bare
                    field={lead}
                    labelPrefix={block.id}
                    value={values[lead.name] ?? ""}
                    onChange={(v) => onChange(lead.name, v)}
                  />
                )}
              </div>
            </div>
            {rest.map((f) => (
              <div key={f.name} className="pl-9">
                <InspectorField
                  bare
                  field={f}
                  labelPrefix={block.id}
                  value={values[f.name] ?? ""}
                  onChange={(v) => onChange(f.name, v)}
                />
              </div>
            ))}
            {block.stages.length > 0 && (
              <div
                className={`grid gap-3 pl-9 ${
                  block.stages.length > 1 ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                {block.stages.map((f) => (
                  <div key={f.name} className="flex min-w-0 flex-col gap-1">
                    <StageCaption field={f} text={f.label} />
                    <MediaUploadField
                      field={f}
                      // Two across in 299px is about 125px a cell: a thumbnail with
                      // its buttons beside it does not fit, one with them under it does.
                      variant={block.stages.length > 1 ? "stack" : "row"}
                      thumb="sm"
                      tileLabel={`${block.id} · ${f.label}${f.required ? " *" : ""}`}
                      value={values[f.name] ?? ""}
                      onChange={(v) => onChange(f.name, v)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A `kind: "scenario"` group: one block per side, a name and then the clips in the
 * order they play — Duel's vote, win, after (ADR-0030). Three media across a
 * 340px column leave no room beside a thumbnail, so each stage stacks its buttons
 * under it.
 */
export function ScenarioRows({
  fields,
  values,
  onChange,
}: {
  fields: ConfigField[];
  values: Values;
  onChange: (name: string, v: string) => void;
}) {
  const blocks = toBlocks(fields);
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block) => (
        <div key={block.id} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BlockChip id={block.id} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {block.heads.map((f) => (
                <InspectorField
                  key={f.name}
                  bare
                  field={f}
                  labelPrefix={block.id}
                  value={values[f.name] ?? ""}
                  onChange={(v) => onChange(f.name, v)}
                />
              ))}
            </div>
          </div>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, block.stages.length)}, minmax(0, 1fr))` }}
          >
            {block.stages.map((f, i) => (
              <div key={f.name} className="flex min-w-0 flex-col gap-1">
                {/* The order is the columns': numbering the captions as well would
                    wrap "1 · Vote *" and its help icon in a 100px column. */}
                <StageCaption field={f} text={`${f.label}${f.required ? " *" : ""}`} />
                <MediaUploadField
                  field={f}
                  variant="stack"
                  tileLabel={`${block.id} · ${i + 1} · ${f.label}${f.required ? " *" : ""}`}
                  value={values[f.name] ?? ""}
                  onChange={(v) => onChange(f.name, v)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- matrix */

/** `A → B → A` — an answer path is machine text (§10); a block with no id falls back to a field name. */
function pathLabel(block: { id: string; fields: ConfigField[] }): string {
  return block.id ? formatAnswerPath(block.id) : (block.fields[0]?.name ?? "—");
}

/**
 * A `kind: "matrix"` group as a drill-down (docs/design-system.md §6, "Outcome
 * matrix"; ADR-0011): the list of answer paths, each with the state it is in, and
 * one path's fields at a time with Previous and Next between them. Eight exits as
 * eight stacked cards stopped being scannable in 340px long before they stopped
 * being correct; a list and a card is the shape that holds.
 *
 * The paths not being edited keep their values in hidden inputs, so `FormData` is
 * whole whichever one is open.
 */
export function OutcomeDrill({
  fields,
  values,
  onChange,
  openId,
  onOpen,
}: {
  fields: ConfigField[];
  values: Values;
  onChange: (name: string, v: string) => void;
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const dict = useDict();
  const blocks = toBlocks(fields).map((b) => ({
    id: b.id,
    fields: [...b.heads, ...b.stages],
  }));
  const complete = (b: { fields: ConfigField[] }) =>
    b.fields.every((f) => !f.required || (values[f.name] ?? "").trim() !== "");
  const index = blocks.findIndex((b) => b.id === openId);
  const open = index >= 0 ? blocks[index] : null;

  // Opening a path swaps the list for a card, and *All paths* swaps it back, so the
  // button that was pressed unmounts and focus would fall to the page (§2). It lands
  // on the card's name when a card opens — read first, then Tab to its fields — and
  // on the row that was open when the list returns. Set by the clicks that mean it:
  // a path opened by the save guard is the guard's to focus.
  const focusNext = useRef<{ to: "card" } | { to: "row"; id: string } | null>(null);
  const cardRef = useRef<HTMLParagraphElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    if (next.to === "card") cardRef.current?.focus();
    else {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-path="${CSS.escape(next.id)}"]`)
        ?.focus();
    }
  });

  const hidden = (list: typeof blocks) =>
    list.flatMap((b) =>
      b.fields.map((f) => (
        <input key={f.name} type="hidden" name={f.name} value={values[f.name] ?? ""} readOnly />
      )),
    );

  if (open) {
    return (
      <div className="flex flex-col gap-4">
        {hidden(blocks.filter((b) => b !== open))}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              focusNext.current = { to: "row", id: open.id };
              onOpen(null);
            }}
            className={buttonClass("ghost", "sm", "-ml-2")}
          >
            <ChevronLeft size={14} aria-hidden />
            {dict.workspace.allPaths}
          </button>
          <span className="data-instr type-caption text-fg-muted">
            {index + 1} / {blocks.length}
          </span>
        </div>
        <p ref={cardRef} tabIndex={-1} className="data-instr type-small text-fg">
          {pathLabel(open)}
        </p>
        {open.fields.map((f) => (
          <InspectorField
            key={f.name}
            field={f}
            value={values[f.name] ?? ""}
            onChange={(v) => onChange(f.name, v)}
          />
        ))}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onOpen(blocks[(index + blocks.length - 1) % blocks.length].id)}
            className={buttonClass("secondary", "sm")}
          >
            {dict.workspace.previous}
          </button>
          <button
            type="button"
            onClick={() => onOpen(blocks[(index + 1) % blocks.length].id)}
            className={buttonClass("secondary", "sm")}
          >
            {dict.workspace.next}
          </button>
        </div>
      </div>
    );
  }

  const done = blocks.filter(complete).length;
  return (
    <div className="flex flex-col gap-3">
      {hidden(blocks)}
      <div ref={listRef} className="rounded-panel border border-hairline bg-surface">
        {blocks.map((b, i) => {
          const head = b.fields.find((f) => f.type === "text");
          const ready = complete(b);
          return (
            <button
              key={b.id}
              type="button"
              data-path={b.id}
              onClick={() => {
                focusNext.current = { to: "card" };
                onOpen(b.id);
              }}
              className={`focus-inset flex min-h-11 w-full items-center gap-3 border-l-[3px] py-2 pr-3 pl-[13px] text-left transition-colors duration-150 hover:bg-surface-2 first:rounded-t-ctl last:rounded-b-ctl ${
                RAIL[ready ? "live" : "idle"]
              } ${i > 0 ? "border-t border-t-hairline" : ""}`}
            >
              <span className="data-instr whitespace-nowrap type-small text-fg">
                {pathLabel(b)}
              </span>
              <span className="min-w-0 flex-1 truncate type-small text-fg-muted">
                {head ? (values[head.name] ?? "") : ""}
              </span>
              {/* The rail is colour; the check and the word are the rest of it (§11). */}
              {ready && <Check size={14} aria-hidden className="shrink-0 text-live" />}
              <span className="sr-only">
                {ready ? dict.workspace.sectionDone : dict.workspace.sectionTodo}
              </span>
              <ChevronRight size={14} aria-hidden className="shrink-0 text-fg-secondary" />
            </button>
          );
        })}
      </div>
      <p className="label-instr" aria-live="polite">
        {dict.configurator.outcomes.filled} {done} / {blocks.length}
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- section */

/**
 * One section of the schema, run by run. The section's own title is the
 * inspector's header, so the first run carries no heading; a run after it — a
 * step's options, a result's paths — is named, because it is a second thing.
 */
export function InspectorSection({
  section,
  values,
  onChange,
  openPath,
  onOpenPath,
  headings = false,
}: {
  section: Section;
  values: Values;
  onChange: (name: string, v: string) => void;
  openPath: string | null;
  onOpenPath: (id: string | null) => void;
  /** Name every run, the first included: the inspector shows several sections at once. */
  headings?: boolean;
}) {
  const dict = useDict();

  const renderRun = (run: FieldRun, i: number) => {
    const heading =
      run.group && (headings || i > 0) ? (
        <h3 className="label-instr">{groupLabel(dict, run.group)}</h3>
      ) : null;
    let body: React.ReactNode;
    if (run.kind === "options") {
      body = <OptionRows fields={run.fields} values={values} onChange={onChange} />;
    } else if (run.kind === "scenario") {
      body = <ScenarioRows fields={run.fields} values={values} onChange={onChange} />;
    } else if (run.kind === "matrix") {
      body = (
        <OutcomeDrill
          fields={run.fields}
          values={values}
          onChange={onChange}
          openId={openPath}
          onOpen={onOpenPath}
        />
      );
    } else {
      body = (
        <div className="flex flex-col gap-4">
          {run.fields.map((f) => (
            <InspectorField
              key={f.name}
              field={f}
              value={values[f.name] ?? ""}
              onChange={(v) => onChange(f.name, v)}
            />
          ))}
        </div>
      );
    }
    return (
      <div key={run.key} className="flex flex-col gap-3">
        {heading}
        {body}
      </div>
    );
  };

  return <div className="flex flex-col gap-6">{section.runs.map(renderRun)}</div>;
}
