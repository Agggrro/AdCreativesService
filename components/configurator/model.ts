import { isTooLong, type ConfigField, type ConfigGroup } from "@/lib/config-schema";

/**
 * The configurator's shape, derived from a template's `config_schema` — pure, so
 * the workspace (client) and anything that wants to reason about a schema share
 * one reading of it (ADR-0011, ADR-0038).
 *
 * The schema already says how a template is grouped: consecutive fields sharing a
 * `group` form a run, and a group has a `kind`. The workspace turns runs into
 * *sections*, the entries of its outline, with one rule: an `options` or a
 * `matrix` group is part of the group before it. Step Builder's step 1 is the
 * title (a section) with its four options (an options group) under it, and the
 * quiz's *Result* is the result screen (a section) with the exit of every answer
 * path (a matrix) under it — one place each in the outline, which is what a person
 * thinks of as "step 1" and "results".
 */

export type GroupKind = NonNullable<ConfigGroup["kind"]>;

/** A run of consecutive fields sharing a `group`; ungrouped fields share a run too. */
export interface FieldRun {
  key: string;
  group?: string;
  kind: GroupKind;
  fields: ConfigField[];
}

/** One entry of the outline: what the inspector shows when it is selected. */
export interface Section {
  /** The id of the group that opens it; `main` for the ungrouped fields. */
  id: string;
  runs: FieldRun[];
}

export function groupKinds(groups: ConfigGroup[]): Map<string, GroupKind> {
  return new Map(groups.map((g) => [g.id, g.kind ?? "section"]));
}

export function toRuns(
  fields: ConfigField[],
  kinds: Map<string, GroupKind>,
): FieldRun[] {
  const runs: FieldRun[] = [];
  for (const field of fields) {
    const last = runs[runs.length - 1];
    if (last && last.group === field.group) {
      last.fields.push(field);
    } else {
      runs.push({
        key: `${field.group ?? ""}#${runs.length}`,
        group: field.group,
        kind: field.group ? (kinds.get(field.group) ?? "section") : "section",
        fields: [field],
      });
    }
  }
  return runs;
}

export function toSections(runs: FieldRun[]): Section[] {
  const sections: Section[] = [];
  for (const run of runs) {
    const last = sections[sections.length - 1];
    if (last && (run.kind === "options" || run.kind === "matrix")) {
      last.runs.push(run);
      continue;
    }
    sections.push({ id: run.group ?? "main", runs: [run] });
  }
  return sections;
}

export function sectionFields(section: Section): ConfigField[] {
  return section.runs.flatMap((r) => r.fields);
}

/** A section is complete when every required field it shows has a value. */
export function isSectionComplete(
  section: Section,
  values: Record<string, string>,
): boolean {
  return sectionFields(section).every(
    (f) => !f.required || (values[f.name] ?? "").trim() !== "",
  );
}

/** Why a field would be refused: nothing in a required one, a value the browser's own check would reject, or one past the schema's `maxLength`. */
export type FieldFault = "required" | "url" | "number" | "length";

export interface InvalidField {
  field: ConfigField;
  fault: FieldFault;
}

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The first active field a save would be refused for, in schema order: a required
 * one with no value, a `url` that is not an absolute address, a number outside its
 * bounds. Found here, before submit, because the field may live in a section the
 * inspector is not showing and a hidden input is exempt from the browser's own
 * validation — `required`, `type="url"`, `min` and `max` all — so the server would
 * be the first to notice, and its redirect throws away everything else typed. For a
 * field that is showing, the browser's check runs first and this one agrees with it.
 *
 * The server keeps its own check and is the only one that counts; this one decides
 * whether a save is worth sending.
 */
export function firstInvalid(
  fields: ConfigField[],
  visible: Set<string>,
  values: Record<string, string>,
): InvalidField | null {
  for (const field of fields) {
    if (!visible.has(field.name)) continue;
    const value = (values[field.name] ?? "").trim();
    if (value === "") {
      if (field.required) return { field, fault: "required" };
      continue;
    }
    if (field.type === "url" && !isAbsoluteUrl(value)) return { field, fault: "url" };
    // The input's own maxLength only constrains typing; a paste past it is
    // clipped by some browsers and kept by others.
    if (isTooLong(field, value)) return { field, fault: "length" };
    if (field.type === "number") {
      const n = Number(value);
      if (
        !Number.isFinite(n) ||
        (field.min !== undefined && n < field.min) ||
        (field.max !== undefined && n > field.max)
      ) {
        return { field, fault: "number" };
      }
    }
  }
  return null;
}

export function defaultValues(fields: ConfigField[]): Record<string, string> {
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
 * Whether the schema warrants an outline: enough sections, and enough fields in
 * them, that one column of inputs would scroll. A template of six or eight fields
 * is one inspector; the outline is for Duel, the quiz and Step Builder, where it
 * is what keeps each screen to one section.
 */
export function wantsOutline(sections: Section[], fieldCount: number): boolean {
  return sections.length >= 3 && fieldCount > 8;
}

/** Fields shown as a swatch beside their hex input. */
export function isColorField(field: ConfigField): boolean {
  return field.type === "text" && /colou?r/i.test(field.name);
}

export const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
