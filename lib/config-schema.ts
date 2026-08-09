import type { Json } from "@/types/database.types";

/**
 * A template's `config_schema` describes the fields the configurator form should
 * render for a creative. It drives the UI and the generic save path, so a new
 * template needs no bespoke form code (ADR-0005 / plans/interactive-templates.md).
 *
 * Since ADR-0011 it also carries *conditional visibility* (`showWhen`) and
 * *grouping* (`group` / `block`), so a template can offer a branching flow —
 * the quiz's 1-3 steps and per-path exits — without any of that logic leaking
 * into a component.
 */
export type ConfigFieldType =
  | "text"
  | "textarea"
  | "url"
  | "image"
  | "number"
  | "range"
  | "select";

/** One `showWhen` clause: the controlling field's current value must be in `equals`. */
export interface ConfigFieldCondition {
  field: string;
  equals: string[];
}

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
  /**
   * Section id. Consecutive fields sharing a group render inside one
   * hairline-separated section (docs/design-system.md §5). The heading text
   * comes from `dict.configurator.groups[id]`, falling back to the raw id —
   * unlike `label`, which is English-only DB data.
   */
  group?: string;
  /**
   * Sub-block inside a `kind: "matrix"` group — for the quiz, the answer path
   * this exit belongs to ("A", "BA", "ABB"). Fields sharing a block are edited
   * together as one collapsible row.
   */
  block?: string;
  /**
   * ALL clauses must hold for the field to be *active*. An inactive field is
   * unmounted in the form, never validated, and never written to `config_json`
   * — which is what makes `required` conditional for free. Absent = always
   * active, so a schema that never uses this behaves exactly as before.
   */
  showWhen?: ConfigFieldCondition[];
}

/** How a group renders. `matrix` groups are further partitioned by `block`. */
export interface ConfigGroup {
  id: string;
  kind?: "section" | "matrix";
}

export interface ConfigSchema {
  fields: ConfigField[];
  groups: ConfigGroup[];
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

const VALID_GROUP_KINDS: NonNullable<ConfigGroup["kind"]>[] = ["section", "matrix"];

/** Defensively parse the `showWhen` array; a malformed clause is dropped, not thrown on. */
function parseConditions(raw: unknown): ConfigFieldCondition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ConfigFieldCondition[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const o = c as Record<string, unknown>;
    if (typeof o.field !== "string" || !o.field) continue;
    if (!Array.isArray(o.equals)) continue;
    const equals = o.equals.filter((v): v is string => typeof v === "string");
    if (equals.length === 0) continue;
    out.push({ field: o.field, equals });
  }
  return out.length ? out : undefined;
}

function parseGroups(raw: unknown): ConfigGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: ConfigGroup[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object" || Array.isArray(g)) continue;
    const o = g as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id) continue;
    const kind =
      typeof o.kind === "string" &&
      VALID_GROUP_KINDS.includes(o.kind as NonNullable<ConfigGroup["kind"]>)
        ? (o.kind as NonNullable<ConfigGroup["kind"]>)
        : "section";
    out.push({ id: o.id, kind });
  }
  return out;
}

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
      group: typeof o.group === "string" && o.group ? o.group : undefined,
      block: typeof o.block === "string" && o.block ? o.block : undefined,
      showWhen: parseConditions(o.showWhen),
    });
  }

  // Fail *visible*, not hidden. A clause naming a field this schema does not
  // have would gate its dependent on an empty string forever — and a hidden
  // required field is unreachable, unsavable, and invisible to whoever has to
  // debug it. Dropping the clause surfaces an extra field instead: still wrong,
  // but wrong in a way someone can see.
  const names = new Set(parsed.map((f) => f.name));
  const order = new Map(parsed.map((f, i) => [f.name, i]));
  for (const [i, field] of parsed.entries()) {
    if (!field.showWhen) continue;
    const kept = field.showWhen.filter((c) => names.has(c.field));
    field.showWhen = kept.length ? kept : undefined;
    if (process.env.NODE_ENV !== "production") {
      for (const c of kept) {
        if ((order.get(c.field) ?? -1) > i) {
          // Visibility is resolved in schema order (see visibleFieldNames), so a
          // controller declared *after* its dependent is always read as "" —
          // which silently hides the dependent for good.
          console.warn(
            `config_schema: "${field.name}" is gated on "${c.field}", which is declared after it. Move the controlling field earlier.`,
          );
        }
      }
    }
  }

  return { fields: parsed, groups: parseGroups(raw.groups) };
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
  // A select's value is a closed set, and since ADR-0011 it can also *gate other
  // fields* — a crafted `stepCount: "99"` would prune every step-2/3 field while
  // the runtime still rendered three steps, producing a creative the configurator
  // could not have built. Reject rather than pass it through to <AdParameters>.
  if (field.type === "select" && field.options) {
    return field.options.some((o) => o.value === v) ? v : undefined;
  }
  return v;
}

/** True when every `showWhen` clause holds against `read`. */
export function isFieldVisible(
  field: ConfigField,
  read: (name: string) => string,
): boolean {
  if (!field.showWhen) return true;
  for (const c of field.showWhen) {
    if (!c.equals.includes(read(c.field))) return false;
  }
  return true;
}

/**
 * Names of the currently-active fields, walked in schema order.
 *
 * Order is load-bearing: a field's controllers must be declared before it,
 * because each field is judged against the values of the fields already found
 * visible. That is what gives transitive hiding for free — hide a controller and
 * everything downstream of it goes too, rather than staying gated on a stale
 * value the user can no longer see or change.
 */
export function visibleFieldNames(
  fields: ConfigField[],
  read: (name: string) => string,
): Set<string> {
  const resolved: Record<string, string> = {};
  const out = new Set<string>();
  for (const field of fields) {
    if (!isFieldVisible(field, (n) => resolved[n] ?? "")) continue;
    resolved[field.name] = (read(field.name) ?? "").trim();
    out.add(field.name);
  }
  return out;
}

export interface BuiltConfig {
  config: Record<string, Exclude<Json, null>>;
  /** Label of the first required-but-empty *active* field, if any. */
  missingField?: string;
}

/**
 * The single schema → config_json build: visibility, coercion and required-
 * checking in one pass. Shared by createCreative, updateCreative and the preview
 * mint, so "what Save writes" and "what Preview shows" cannot drift apart —
 * which is what app/api/vast/preview/route.ts already demanded in prose and had
 * to keep true by hand in three places.
 *
 * Inactive fields are dropped rather than persisted: `config_json` is inlined
 * into <AdParameters> on every ad request, so a switched-off branch must not
 * ride along on the serving path (CLAUDE.md, AdTech rule 3).
 */
export function buildConfigFromValues(
  fields: ConfigField[],
  read: (name: string) => string,
): BuiltConfig {
  const visible = visibleFieldNames(fields, read);
  const config: Record<string, Exclude<Json, null>> = {};
  for (const field of fields) {
    if (!visible.has(field.name)) continue;
    const value = coerceFieldValue(field, read(field.name));
    if (value === undefined) {
      if (field.required) return { config, missingField: field.label };
      continue;
    }
    config[field.name] = value;
  }
  return { config };
}
