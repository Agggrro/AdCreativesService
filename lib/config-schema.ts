import type { Json } from "@/types/database.types";

/**
 * A template's `config_schema` describes the fields the configurator form should
 * render for a creative. It drives the UI and the generic save path, so a new
 * template needs no bespoke form code (ADR-0005 / plans/interactive-templates.md).
 */
export type ConfigFieldType =
  | "text"
  | "textarea"
  | "url"
  | "image"
  | "number"
  | "range"
  | "select";

export interface ConfigField {
  name: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  default?: string | number;
  options?: { value: string; label: string }[];
}

export interface ConfigSchema {
  fields: ConfigField[];
}

const VALID_TYPES: ConfigFieldType[] = [
  "text",
  "textarea",
  "url",
  "image",
  "number",
  "range",
  "select",
];

/** Defensively parse an untyped config_schema into a typed ConfigSchema. */
export function parseConfigSchema(json: unknown): ConfigSchema {
  const raw =
    json && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : {};
  const fields = Array.isArray(raw.fields) ? raw.fields : [];

  const parsed: ConfigField[] = [];
  for (const f of fields) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    if (typeof o.name !== "string") continue;
    const type = (
      typeof o.type === "string" && VALID_TYPES.includes(o.type as ConfigFieldType)
        ? o.type
        : "text"
    ) as ConfigFieldType;
    parsed.push({
      name: o.name,
      label: typeof o.label === "string" ? o.label : o.name,
      type,
      required: o.required === true,
      placeholder: typeof o.placeholder === "string" ? o.placeholder : undefined,
      help: typeof o.help === "string" ? o.help : undefined,
      min: typeof o.min === "number" ? o.min : undefined,
      max: typeof o.max === "number" ? o.max : undefined,
      default:
        typeof o.default === "string" || typeof o.default === "number"
          ? o.default
          : undefined,
      options: Array.isArray(o.options)
        ? o.options
            .filter(
              (op): op is { value: string; label: string } =>
                !!op &&
                typeof op === "object" &&
                typeof (op as { value?: unknown }).value === "string",
            )
            .map((op) => ({ value: op.value, label: op.label ?? op.value }))
        : undefined,
    });
  }
  return { fields: parsed };
}

/** Coerce a raw form value to the field's type; undefined means "omit". */
export function coerceFieldValue(
  field: ConfigField,
  raw: string,
): Exclude<Json, null> | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  if (field.type === "number" || field.type === "range") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return v;
}
