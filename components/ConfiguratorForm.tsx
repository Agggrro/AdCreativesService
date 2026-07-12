"use client";

import { useState } from "react";
import Link from "next/link";
import type { ConfigField } from "@/lib/config-schema";
import { PreviewPanel } from "@/components/PreviewPanel";

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
  const [format, setFormat] = useState(template.supported_standards[0] ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <form action={createCreative} className="space-y-5">
        <input type="hidden" name="template_id" value={template.id} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Delivery format</legend>
          <div className="flex gap-3">
            {template.supported_standards.map((s) => (
              <label
                key={s}
                className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="selected_format"
                  value={s}
                  checked={format === s}
                  onChange={() => setFormat(s)}
                  required
                />
                <span className="uppercase">{s}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {fields.map((field) => (
          <Field
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            onChange={(v) => setValue(field.name, v)}
          />
        ))}

        {fields.length === 0 && (
          <p className="text-sm text-gray-500">
            This template has no configurable fields.
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create creative
          </button>
          <Link href="/dashboard" className="text-sm text-gray-500 underline">
            Cancel
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
  onChange,
}: {
  field: ConfigField;
  value: string;
  onChange: (v: string) => void;
}) {
  const base =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black";

  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {field.label}
        {field.required ? " *" : ""}
      </span>

      {field.type === "textarea" ? (
        <textarea
          name={field.name}
          required={field.required}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={base}
        />
      ) : field.type === "select" ? (
        <select
          name={field.name}
          required={field.required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          {!field.required && <option value="">—</option>}
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "range" ? (
        <input
          name={field.name}
          type="range"
          min={field.min ?? 0}
          max={field.max ?? 100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full"
        />
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
          className={base}
        />
      )}

      {field.help && <span className="text-xs text-gray-400">{field.help}</span>}
    </label>
  );
}
