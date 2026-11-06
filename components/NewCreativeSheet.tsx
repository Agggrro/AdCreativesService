"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useDict } from "@/components/i18n/LocaleProvider";
import { buttonClass } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TemplatePreview } from "@/components/ui/TemplatePreview";

/** A template the sheet offers: a catalog template, or the VAST video generator. */
export interface SheetTemplate {
  id: string;
  name: string;
  description: string | null;
  /** The key `TemplatePreview` draws from; `video` for the generator's entry. */
  type: string;
  standards: string[];
  /** Where *Configure* goes. */
  href: string;
}

/** What Tab may land on inside the card. */
const FOCUSABLE = "button:not([disabled]), [href], input:not([type='hidden'])";

/**
 * *New creative* (docs/design-system.md §6, "Template sheet"; ADR-0038): the list
 * of templates and, beside it, what the selected one is — a dialog over the
 * Creatives list, in place of three pages (catalog → template → configure). Pick,
 * *Configure*, and the workspace opens on the first field: three clicks, one page
 * load, two clicks when the template is already in hand.
 *
 * The VAST video generator is the last row, set apart: it is a creative of a kind
 * of its own (ADR-0035), built in its own tool, and it belongs to the same
 * question — *what do you want to make?*
 *
 * A modal like the destructive confirmation, and built the same way — portalled to
 * `<body>` so nothing inherited from the page reaches it, Escape closes it, Tab
 * stays inside the card, and focus returns to where it was opened from. The
 * previews are the catalog's static diagrams: a live unit would share
 * `window.getVPAIDAd` with nothing here, but the diagram is what a template looks
 * like before it is configured, which is what this question is about.
 *
 * Below `md` the preview pane gives way: the list is the sheet, and the selected
 * row opens to show its description.
 */
export function NewCreativeSheet({
  templates,
  autoOpen = false,
}: {
  templates: SheetTemplate[];
  /** Open on arrival — a link that wants a template picked (`?new=1`). */
  autoOpen?: boolean;
}) {
  const dict = useDict();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Opening on arrival waits for the trigger to exist: a dialog is portalled to
  // `<body>`, which the server render has no such thing as. A callback ref, not an
  // effect — the wiring is a reaction to mounting, as in `Reveal`.
  const armed = useRef(false);
  const attach = useCallback(
    (el: HTMLButtonElement | null) => {
      triggerRef.current = el;
      if (el && autoOpen && !armed.current) {
        armed.current = true;
        setOpen(true);
      }
    },
    [autoOpen],
  );

  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus lands on the current row, so the arrow of the eye and the keyboard
    // start in the same place.
    cardRef.current
      ?.querySelector<HTMLElement>("[aria-current='true']")
      ?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      const card = cardRef.current;
      if (e.key !== "Tab" || !card) return;
      const focusable = card.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!card.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // The video row is set apart from the interactive templates above it.
  const video = templates.filter((t) => t.type === "video");
  const interactive = templates.filter((t) => t.type !== "video");

  const row = (t: SheetTemplate) => {
    const on = t.id === selected?.id;
    return (
      <li key={t.id}>
        <button
          type="button"
          aria-current={on ? "true" : undefined}
          onClick={() => setSelectedId(t.id)}
          className={`focus-inset flex min-h-11 w-full flex-col justify-center gap-1 px-6 py-2.5 text-left transition-colors duration-150 md:px-5 ${
            on ? "bg-surface-2 font-medium text-fg" : "text-fg-secondary hover:bg-surface-2"
          }`}
        >
          <span className="type-body truncate">{t.name}</span>
          {/* Below `md` there is no preview pane: the open row says what it is. */}
          {on && t.description && (
            <span className="type-small font-normal text-fg-muted md:hidden">
              {t.description}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <>
      <button
        ref={attach}
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass("primary", "md")}
      >
        <Plus size={14} aria-hidden />
        {dict.dashboard.newCreative}
      </button>

      {open &&
        selected &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ground/70 p-4"
            onClick={close}
          >
            <div
              ref={cardRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onClick={(e) => e.stopPropagation()}
              className="flex h-[min(612px,calc(100dvh-2rem))] w-full min-w-0 max-w-[880px] flex-col rounded-panel border border-hairline bg-surface shadow-overlay"
            >
              <header className="flex h-14 shrink-0 items-center border-b border-hairline px-6">
                {/* An h2 in the h3 role, like the destructive confirmation this
                    dialog is built the same way as (§6). */}
                <h2 id={titleId} className="type-h3">
                  {dict.dashboard.newCreative}
                </h2>
              </header>

              <div className="flex min-h-0 flex-1">
                <nav
                  aria-label={dict.dashboard.templates}
                  className="flex w-full min-w-0 shrink-0 flex-col overflow-y-auto border-hairline py-2 md:w-[300px] md:border-r"
                >
                  <ul className="flex flex-col">{interactive.map(row)}</ul>
                  {video.length > 0 && (
                    <>
                      {/* A hairline, not whitespace: the video generator is another
                          kind of row, and §5 sets groups apart by a line or a surface. */}
                      <span aria-hidden className="my-2 h-px shrink-0 bg-hairline" />
                      <ul className="flex flex-col">{video.map(row)}</ul>
                    </>
                  )}
                </nav>

                <section className="hidden min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-6 md:flex">
                  <div className="rounded-well border border-well-line bg-well p-3">
                    <TemplatePreview type={selected.type} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="type-h3">{selected.name}</h3>
                      <span className="flex shrink-0 flex-wrap justify-end gap-2">
                        {selected.standards.map((s) => (
                          <Chip key={s}>{s}</Chip>
                        ))}
                      </span>
                    </div>
                    {selected.description && (
                      <p className="max-w-[52ch] type-body text-fg-secondary">
                        {selected.description}
                      </p>
                    )}
                  </div>
                </section>
              </div>

              <footer className="flex h-16 shrink-0 items-center justify-end gap-3 border-t border-hairline px-6">
                <button type="button" onClick={close} className={buttonClass("ghost", "md")}>
                  {dict.common.cancel}
                </button>
                <Link href={selected.href} className={buttonClass("primary", "md")}>
                  {dict.dashboard.configure}
                </Link>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
