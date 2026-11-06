"use client";

import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  formatAnswerPath,
  visibleFieldNames,
  type ConfigField,
  type ConfigGroup,
} from "@/lib/config-schema";
import { groupLabel } from "@/lib/i18n/dictionaries";
import { PreviewPanel } from "@/components/PreviewPanel";
import { InspectorSection } from "@/components/configurator/Inspector";
import {
  defaultValues,
  firstInvalid,
  groupKinds,
  isSectionComplete,
  sectionFields,
  toRuns,
  toSections,
  wantsOutline,
} from "@/components/configurator/model";
import { useDict } from "@/components/i18n/LocaleProvider";
import { OutlineNav, SectionChips, type NavSection } from "@/components/workspace/SectionNav";
import { WorkspaceBar } from "@/components/workspace/WorkspaceBar";
import { buttonClass } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { inputDenseClass, Notice } from "@/components/ui/Field";

type WorkspaceTemplate = {
  id: string;
  name: string;
  supported_standards: string[];
};

/**
 * A creative's Settings, and a new creative's only screen (docs/design-system.md
 * §6, "Workspace"; ADR-0038): the bar, the outline of the template's sections, the
 * stage with the creative running, and the inspector with one section's fields.
 * At 1280×720 a section is one screen, where the long form it replaces ran from
 * one to six.
 *
 * What did not change is what it posts. The schema-driven fields keep their
 * `name`s, the Server Action (`createCreative` / `updateCreative`) reads the same
 * FormData, and `buildConfigFromValues` still decides what is saved. The `<form>`
 * wraps the inspector's fields and nothing else — the bar sits outside it, since it
 * holds a form of its own (Duplicate), so the name, the format and the save button
 * join the form by its id — and the **stage is outside it too**. The Sandbox
 * player runs the creative in this document, inside the stage, and a creative's own
 * buttons carry no `type`, which makes each of them a submit button to any form
 * around it: a click on the ad's call to action would have saved the creative.
 *
 * Values live here, lifted out of the DOM, so the stage can mint a preview from
 * exactly what is typed and so a section the inspector is not showing still posts
 * what the person put in it: every active field of the other sections is written
 * as a hidden input. Visibility is the same walk the action makes
 * (`visibleFieldNames`), so a field hidden here is a field the action prunes.
 */
export function ConfiguratorWorkspace({
  heading,
  template,
  fields,
  groups = [],
  action,
  mode,
  creativeId,
  initialName = "",
  initialFormat,
  initialFieldValues,
  tabs,
  state,
  moreMenu,
  copyTag,
  message,
}: {
  /** The page's `h1`, for assistive technology — the visible name is the bar's input. */
  heading: string;
  template: WorkspaceTemplate;
  fields: ConfigField[];
  /** Group presentation from the schema; an unlisted group renders as a section. */
  groups?: ConfigGroup[];
  action: (formData: FormData) => void;
  mode: "create" | "edit";
  /** Present only in edit mode; the hidden `creative_id` the update action needs. */
  creativeId?: string;
  initialName?: string;
  initialFormat?: string;
  /** Present only in edit mode; overrides the schema-default starting values. */
  initialFieldValues?: Record<string, string>;
  /** Edit mode: the Settings | Stats switch, the serving state, *More* and *Copy tag*. */
  tabs?: React.ReactNode;
  state?: React.ReactNode;
  moreMenu?: React.ReactNode;
  copyTag?: React.ReactNode;
  /** A failed save redirects back here with its message. */
  message?: string | null;
}) {
  const dict = useDict();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [format, setFormat] = useState(
    initialFormat ?? template.supported_standards[0] ?? "",
  );
  const [values, setValues] = useState<Record<string, string>>(
    () => initialFieldValues ?? defaultValues(fields),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);
  // Set on a blocked save and shown only while a gap remains: storing the *fact*
  // that a save failed would leave a cold-red alarm under a form whose gap has
  // since closed.
  const [blocked, setBlocked] = useState(false);

  function setValue(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  const kinds = useMemo(() => groupKinds(groups), [groups]);

  // The same walk buildConfigFromValues runs on the server. Values are never
  // cleared on hide: `values` is the draft, visibility only a projection of it,
  // so toggling a step off and back on returns what the person typed.
  const visible = useMemo(
    () =>
      visibleFieldNames(fields, (name) =>
        name === "selected_format" ? format : (values[name] ?? ""),
      ),
    [fields, values, format],
  );

  const sections = useMemo(
    () => toSections(toRuns(fields.filter((f) => visible.has(f.name)), kinds)),
    [fields, visible, kinds],
  );

  const outline = wantsOutline(sections, visible.size);
  const active = outline ? (sections.find((s) => s.id === activeId) ?? sections[0]) : null;

  // What the inspector draws is what posts under its own name; everything else
  // that is active rides along as a hidden input.
  const shown = useMemo(() => {
    const names = new Set<string>();
    for (const s of active ? [active] : sections) {
      for (const f of sectionFields(s)) names.add(f.name);
    }
    return names;
  }, [active, sections]);
  const carried = fields.filter((f) => visible.has(f.name) && !shown.has(f.name));

  const invalid = firstInvalid(fields, visible, values);
  const missing = invalid?.field ?? null;
  // Named by where it is: a field in a block ("Heading") says nothing until the
  // block is — the path of a quiz exit, the letter of an option.
  const missingText = missing
    ? missing.block
      ? `${
          missing.group && kinds.get(missing.group) === "matrix"
            ? formatAnswerPath(missing.block)
            : missing.block
        } · ${missing.label}`
      : missing.label
    : "";

  /**
   * A field in a section the inspector is not showing is exempt from the browser's
   * own validation — a hidden input is, `required`, `type="url"` and the bounds of a
   * number alike — so the server would be the first to notice, and its redirect
   * throws away everything else typed. Catching it here costs one check and saves
   * the whole form.
   */
  function guard(e: React.FormEvent<HTMLFormElement>) {
    if (!missing) return;
    e.preventDefault();
    setBlocked(true);
    const owner = sections.find((s) => sectionFields(s).some((f) => f.name === missing.name));
    if (owner) setActiveId(owner.id);
    if (missing.group && kinds.get(missing.group) === "matrix") setOpenPath(missing.block ?? null);
    // The section (or the path) has to be on screen before its input exists to focus.
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>(
        `[name="${CSS.escape(missing.name)}"]`,
      );
      // An image field is a hidden input beside its buttons — a label is not
      // focusable, so it is the file input inside it, or a button, that takes it.
      const target =
        el instanceof HTMLInputElement && el.type === "hidden"
          ? el.parentElement?.querySelector<HTMLElement>("button, input:not([type='hidden'])")
          : el;
      target?.focus();
    });
  }

  const multiFormat = template.supported_standards.length > 1;

  const navSections: NavSection[] = sections.map((s) => {
    const complete = isSectionComplete(s, values);
    return {
      id: s.id,
      label: groupLabel(dict, s.id),
      tone: complete ? "live" : "idle",
      status: complete ? dict.workspace.sectionDone : dict.workspace.sectionTodo,
    };
  });

  const bar = (
    <WorkspaceBar
      back={
        <Link
          href="/dashboard/creatives"
          className={buttonClass("ghost", "sm", "pl-2")}
        >
          <ChevronLeft size={14} aria-hidden />
          {dict.dashboard.creatives}
        </Link>
      }
      title={
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 lg:flex-nowrap">
          <input
            form={formId}
            name="name"
            type="text"
            maxLength={200}
            placeholder={template.name}
            defaultValue={initialName}
            aria-label={dict.dashboard.creativeName}
            className={`${inputDenseClass} min-w-0 max-w-full flex-1 lg:max-w-56`}
          />
          {multiFormat ? (
            <fieldset className="shrink-0">
              <legend className="sr-only">{dict.configurator.deliveryFormat}</legend>
              <div className="inline-flex rounded-ctl border border-line bg-surface">
                {template.supported_standards.map((s) => {
                  const current = format === s;
                  return (
                    <label
                      key={s}
                      className={`cursor-pointer border-r border-hairline px-2.5 py-1.5 chip-instr transition-colors first:rounded-l-ctl last:rounded-r-ctl last:border-r-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                        current
                          ? "bg-surface-2 text-fg"
                          : "text-fg-secondary hover:bg-surface-2"
                      }`}
                    >
                      <input
                        form={formId}
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
          ) : (
            <span className="shrink-0">
              <Chip>{format || "—"}</Chip>
            </span>
          )}
          {/* Each server-rendered piece sits in a wrapper of its own: placed as a
              bare sibling among client-made elements it draws React's "child in a
              list needs a key" warning, which is about where it was made. */}
          {state && <span className="shrink-0 whitespace-nowrap">{state}</span>}
        </div>
      }
      tabs={tabs}
      actions={
        <>
          {moreMenu && <span className="contents">{moreMenu}</span>}
          {copyTag && <span className="contents">{copyTag}</span>}
          <button
            type="submit"
            form={formId}
            className={buttonClass("primary", "sm", "max-lg:hidden")}
          >
            {mode === "edit" ? dict.workspace.save : dict.workspace.create}
          </button>
        </>
      }
    />
  );

  return (
    // `lg:flex-none`: `flex-1` sets a flex-basis of 0, and a height is only read
    // from `auto` — without it `h-dvh` is ignored and the screen grows with the
    // inspector's content instead of scrolling inside it.
    <div className="flex min-h-0 flex-1 flex-col lg:h-dvh lg:flex-none">
      <h1 className="sr-only">{heading}</h1>
      {bar}

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {outline && active && (
          <OutlineNav
            label={dict.workspace.sections}
            sections={navSections}
            activeId={active.id}
            onSelect={setActiveId}
          />
        )}

        <PreviewPanel templateId={template.id} format={format} fields={values} />

        <div className="flex min-w-0 flex-col border-hairline lg:min-h-0 lg:w-[340px] lg:shrink-0 lg:border-l">
          {outline && active && (
            <>
              {/* Below `lg` the outline is a row of chips; from `lg` it is the column at the left. */}
              <SectionChips
                label={dict.workspace.sections}
                sections={navSections}
                activeId={active.id}
                onSelect={setActiveId}
              />
              {/* The section's name is a heading at every width, and it is drawn
                  only from `lg`: below it the chip is the name. */}
              <h2 className="sr-only lg:hidden">{groupLabel(dict, active.id)}</h2>
              <div className="hidden h-12 shrink-0 items-center border-b border-hairline px-5 lg:flex">
                <h2 className="type-body font-medium">{groupLabel(dict, active.id)}</h2>
              </div>
            </>
          )}

          <form
            id={formId}
            ref={formRef}
            action={action}
            onSubmit={guard}
            className="flex min-h-0 flex-1 flex-col"
          >
            <input type="hidden" name="template_id" value={template.id} />
            {creativeId && <input type="hidden" name="creative_id" value={creativeId} />}
            {!multiFormat && <input type="hidden" name="selected_format" value={format} />}
            {carried.map((f) => (
              <input key={f.name} type="hidden" name={f.name} value={values[f.name] ?? ""} readOnly />
            ))}

            {/* `relative`: a file input is `sr-only` (absolutely positioned) and, with no
                positioned ancestor, belongs to the page rather than to this scroller —
                so the scroller cannot clip it and it stretches the document. */}
            <div className="relative flex flex-col gap-4 p-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {message && <Notice tone="dead">{message}</Notice>}
              {blocked && invalid && (
                <Notice tone="dead" live>
                  {invalid.fault === "required"
                    ? dict.configurator.errFieldRequired
                    : invalid.fault === "length"
                      ? dict.configurator.errFieldTooLong
                      : dict.configurator.errFieldInvalid}
                  : {missingText}
                </Notice>
              )}

              {fields.length === 0 && (
                <p className="type-small text-fg-muted">{dict.configurator.noFields}</p>
              )}

              {outline && active ? (
                <InspectorSection
                  section={active}
                  values={values}
                  onChange={setValue}
                  openPath={openPath}
                  onOpenPath={setOpenPath}
                />
              ) : (
                sections.map((s) => (
                  <InspectorSection
                    key={s.id}
                    section={s}
                    values={values}
                    onChange={setValue}
                    openPath={openPath}
                    onOpenPath={setOpenPath}
                    headings
                  />
                ))
              )}
            </div>
          </form>
        </div>
      </main>

      {/* Below `lg` the save button leaves the bar for a strip of its own at the
          foot of the screen, where a thumb is. */}
      <div className="workspace-strip sticky bottom-0 z-10 border-t border-hairline bg-ground p-4 lg:hidden">
        <button
          type="submit"
          form={formId}
          className={buttonClass("primary", "md", "w-full")}
        >
          {mode === "edit" ? dict.workspace.save : dict.workspace.create}
        </button>
      </div>
    </div>
  );
}
