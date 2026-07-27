"use client";

import { useState } from "react";
import Link from "next/link";
import type { ConfigField } from "@/lib/config-schema";
import { PreviewPanel } from "@/components/PreviewPanel";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";

type ConfiguratorTemplate = {
  id: string;
  name: string;
  supported_standards: string[];
};

function initialValues(fields: ConfigField[]): Record<string, string> {
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
 * panel can see exactly what's currently typed, while the "Create creative"
 * Server Action keeps working unchanged (same `name` attributes, same
 * `<form action=...>` — FormData parsing on the server is untouched).
 */
export function ConfiguratorForm({
  template,
  fields,
  createCreative,
}: {
  template: ConfiguratorTemplate;
  fields: ConfigField[];
  createCreative: (formData: FormData) => void;
}) {
  const dict = useDict();
  const [format, setFormat] = useState(template.supported_standards[0] ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <form action={createCreative} className="flex flex-col gap-5">
        <input type="hidden" name="template_id" value={template.id} />

        <label className="flex flex-col gap-2">
          <span className="label-instr">{dict.dashboard.creativeName}</span>
          <input
            name="name"
            type="text"
            maxLength={200}
            placeholder={template.name}
            className={inputClass}
          />
          <span className="text-xs text-fg-muted">
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
                  className={`cursor-pointer border-r border-hairline px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors first:rounded-l-ctl last:rounded-r-ctl last:border-r-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                    current
                      ? "bg-fill font-medium text-fg"
                      : "text-fg-secondary hover:bg-fill"
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

        {fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            requiredLabel={dict.configurator.required}
            value={values[field.name] ?? ""}
            onChange={(v) => setValue(field.name, v)}
          />
        ))}

        {fields.length === 0 && (
          <p className="text-[13px] text-fg-muted">
            {dict.configurator.noFields}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className={buttonClass("primary")}>
            {dict.dashboard.createCreative}
          </button>
          <Link href="/dashboard" className={buttonClass("ghost")}>
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
          <span className="data-instr w-10 shrink-0 text-right text-[13px] text-fg-secondary">
            {value || "0"}
          </span>
        </span>
      ) : (
        <input
          name={field.name}
          type={
            field.type === "number"
              ? "number"
              : field.type === "url" || field.type === "image"
                ? "url"
                : "text"
          }
          required={field.required}
          min={field.type === "number" ? field.min : undefined}
          max={field.type === "number" ? field.max : undefined}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}

      {field.help && <span className="text-xs text-fg-muted">{field.help}</span>}
    </label>
  );
}
