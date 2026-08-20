"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  visibleFieldNames,
  type ConfigField,
  type ConfigGroup,
} from "@/lib/config-schema";
import { groupLabel } from "@/lib/i18n/dictionaries";
import { MediaUploadField } from "@/components/MediaUploadField";
import { PreviewPanel } from "@/components/PreviewPanel";
import { FieldSection } from "@/components/configurator/FieldSection";
import {
  OutcomeMatrix,
  isBlockComplete,
  toOutcomeBlocks,
} from "@/components/configurator/OutcomeMatrix";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { inputClass, Notice } from "@/components/ui/Field";

type ConfiguratorTemplate = {
  id: string;
  name: string;
  supported_standards: string[];
};

/** A run of consecutive fields sharing a `group`; ungrouped fields form their own run. */
type FieldRun = { key: string; group?: string; fields: ConfigField[] };

function toRuns(fields: ConfigField[]): FieldRun[] {
  const runs: FieldRun[] = [];
  for (const field of fields) {
    const last = runs[runs.length - 1];
    if (last && field.group !== undefined && last.group === field.group) {
      last.fields.push(field);
    } else {
      runs.push({
        key: `${field.group ?? ""}#${runs.length}`,
        group: field.group,
        fields: [field],
      });
    }
  }
  return runs;
}

function defaultValues(fields: ConfigField[]): Record<string, string> {
  const init: Record<string, string> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      init[field.name] = String(field.default);
    } else if (field.type === "select" && field.required && field.options?.length) {
      // Matches what an uncontrolled <select> would show by default.
      init[field.name] = field.options[0].value;
    } else {
      init[field.name] = "";
    }
  }
  return init;
}

/**
 * Client wrapper around the schema-driven configurator form. Lifts field
 * values into state (previously uncontrolled DOM inputs) so the live preview
 * panel can see exactly what's currently typed, while the Server Action
 * keeps working unchanged (same `name` attributes, same `<form action=...>`
 * — FormData parsing on the server is untouched). Shared by the "create"
 * (`/dashboard/creatives/new`) and "edit" (`/dashboard/creatives/[id]/edit`)
 * pages — same schema-driven fields, a different action and starting values.
 */
export function ConfiguratorForm({
  template,
  fields,
  groups = [],
  action,
  submitLabel,
  cancelHref = "/dashboard",
  creativeId,
  initialName = "",
  initialFormat,
  initialFieldValues,
}: {
  template: ConfiguratorTemplate;
  fields: ConfigField[];
  /** Group presentation from the schema; an unlisted group renders as a section. */
  groups?: ConfigGroup[];
  action: (formData: FormData) => void;
  submitLabel: string;
  cancelHref?: string;
  /** Present only in edit mode; renders the hidden `creative_id` the update action needs. */
  creativeId?: string;
  initialName?: string;
  initialFormat?: string;
  /** Present only in edit mode; overrides the schema-default starting values. */
  initialFieldValues?: Record<string, string>;
}) {
  const dict = useDict();
  const [format, setFormat] = useState(
    initialFormat ?? template.supported_standards[0] ?? "",
  );
  const [values, setValues] = useState<Record<string, string>>(
    () => initialFieldValues ?? defaultValues(fields),
  );
  const [openOutcome, setOpenOutcome] = useState<string | null>(null);
  // Set on a blocked submit and cleared as soon as the gap closes. Storing the
  // *fact* that a submit failed would leave a cold-red alarm sitting under a
  // matrix whose rails have all since turned green.
  const [flaggedGap, setFlaggedGap] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  const kinds = useMemo(
    () => new Map(groups.map((g) => [g.id, g.kind ?? "section"])),
    [groups],
  );

  // The same walk buildConfigFromValues runs on the server, so a field this form
  // hides is exactly a field the action prunes — one function, not two rules
  // that drift. Values are never cleared on hide: `values` is the draft, and
  // visibility is only a projection of it, so toggling a step off and back on
  // returns what the user typed.
  const visible = useMemo(
    () =>
      visibleFieldNames(fields, (name) =>
        name === "selected_format" ? format : values[name] ?? "",
      ),
    [fields, values, format],
  );

  const runs = useMemo(
    () =>
      toRuns(fields)
        .map((run) => ({
          ...run,
          fields: run.fields.filter((f) => visible.has(f.name)),
        }))
        .filter((run) => run.fields.length > 0),
    [fields, visible],
  );

  /** The first incomplete block in any matrix group, or null when all are filled. */
  const firstGap = useMemo(() => {
    for (const run of runs) {
      if (!run.group || kinds.get(run.group) !== "matrix") continue;
      const gap = toOutcomeBlocks(run.fields).find(
        (b) => !isBlockComplete(b, values),
      );
      if (gap) return gap;
    }
    return null;
  }, [runs, kinds, values]);

  /**
   * A closed outcome row submits through hidden inputs, which browsers exempt
   * from constraint validation — so `required` cannot reach them and the server
   * would be the first to notice a half-filled exit. Its `fail()` redirects,
   * which throws away everything else the user typed. Catching it here costs one
   * check and saves the whole form.
   */
  function guardOutcomes(e: React.FormEvent<HTMLFormElement>) {
    if (!firstGap) return;
    e.preventDefault();
    setFlaggedGap(true);
    setOpenOutcome(firstGap.id);
    const empty = firstGap.fields.find(
      (f) => f.required && (values[f.name] ?? "").trim() === "",
    );
    // The row has to be open before its input exists to focus.
    if (empty) {
      requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>(`[name="${CSS.escape(empty.name)}"]`)
          ?.focus();
      });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <form
        ref={formRef}
        action={action}
        onSubmit={guardOutcomes}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name="template_id" value={template.id} />
        {creativeId && <input type="hidden" name="creative_id" value={creativeId} />}

        <label className="flex flex-col gap-2">
          <span className="label-instr">{dict.dashboard.creativeName}</span>
          <input
            name="name"
            type="text"
            maxLength={200}
            placeholder={template.name}
            defaultValue={initialName}
            className={inputClass}
          />
          <span className="type-caption text-fg-muted">
            {dict.dashboard.creativeNameHelp}
          </span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="label-instr">
            {dict.configurator.deliveryFormat}
          </legend>
          <div className="inline-flex self-start rounded-ctl border border-line bg-surface">
            {template.supported_standards.map((s) => {
              const current = format === s;
              return (
                <label
                  key={s}
                  className={`cursor-pointer border-r border-hairline px-3 py-1.5 chip-instr transition-colors first:rounded-l-ctl last:rounded-r-ctl last:border-r-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                    current
                      ? "bg-surface-2 font-medium text-fg"
                      : "text-fg-secondary hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="radio"
                    name="selected_format"
                    value={s}
                    checked={current}
                    onChange={() => setFormat(s)}
                    required
                    className="sr-only"
                  />
                  {s}
                </label>
              );
            })}
          </div>
        </fieldset>

        {runs.map((run) => {
          const renderField = (field: ConfigField) => (
            <Field
              key={field.name}
              field={field}
              requiredLabel={dict.configurator.required}
              value={values[field.name] ?? ""}
              onChange={(v) => setValue(field.name, v)}
            />
          );

          if (!run.group) {
            return (
              <div key={run.key} className="flex flex-col gap-5">
                {run.fields.map(renderField)}
              </div>
            );
          }

          return (
            <FieldSection key={run.key} heading={groupLabel(dict, run.group)}>
              {kinds.get(run.group) === "matrix" ? (
                <OutcomeMatrix
                  blocks={toOutcomeBlocks(run.fields)}
                  values={values}
                  openId={openOutcome}
                  onToggle={(id) =>
                    setOpenOutcome((cur) => (cur === id ? null : id))
                  }
                  renderField={renderField}
                />
              ) : (
                run.fields.map(renderField)
              )}
            </FieldSection>
          );
        })}

        {fields.length === 0 && (
          <p className="type-small text-fg-muted">
            {dict.configurator.noFields}
          </p>
        )}

        {flaggedGap && firstGap && (
          <Notice tone="dead" live>
            {dict.configurator.outcomes.errIncomplete}
          </Notice>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className={buttonClass("primary")}>
            {submitLabel}
          </button>
          <Link href={cancelHref} className={buttonClass("ghost")}>
            {dict.common.cancel}
          </Link>
        </div>
      </form>

      <div className="lg:sticky lg:top-6">
        <PreviewPanel templateId={template.id} format={format} fields={values} />
      </div>
    </div>
  );
}

function Field({
  field,
  value,
  requiredLabel,
  onChange,
}: {
  field: ConfigField;
  value: string;
  requiredLabel: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="label-instr">
        {field.label}
        {field.required ? ` · ${requiredLabel}` : ""}
      </span>

      {field.type === "textarea" ? (
        <textarea
          name={field.name}
          required={field.required}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={inputClass}
        />
      ) : field.type === "select" ? (
        <select
          name={field.name}
          required={field.required}
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
      ) : field.type === "range" ? (
        <span className="flex items-center gap-3">
          <input
            name={field.name}
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full accent-fg-secondary"
          />
          <span className="data-instr w-10 shrink-0 text-right type-small text-fg-secondary">
            {value || "0"}
          </span>
        </span>
      ) : field.type === "image" ? (
        <MediaUploadField field={field} value={value} onChange={onChange} />
      ) : (
        <input
          name={field.name}
          type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
          required={field.required}
          min={field.type === "number" ? field.min : undefined}
          max={field.type === "number" ? field.max : undefined}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}

      {field.help && <span className="type-caption text-fg-muted">{field.help}</span>}
    </label>
  );
}
