"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";

/**
 * The destructive confirmation (docs/design-system.md §6): an action that
 * cannot be undone never fires from a single click.
 *
 * Extracted when a second such action arrived — rotating the postback key
 * (ADR-0023) breaks every network holding the old URL, and is as irreversible as
 * deleting a creative. Two hand-rolled copies of this dialog is how the second
 * one quietly loses the portal or the Escape handler, which is the drift §6's
 * "one implementation per repeated element" exists to stop.
 */

function ConfirmSubmitButton({
  label,
  workingLabel,
  onSettled,
}: {
  label: string;
  workingLabel: string;
  /** Called once the action resolves, so the dialog can get out of the way. */
  onSettled: () => void;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) {
      // The failure path redirects back to this same route, where the dialog
      // would otherwise still be open — its fixed, full-screen backdrop sitting
      // on top of the very notice it just produced. On a delete's success the
      // row unmounts and this never runs.
      wasPending.current = false;
      onSettled();
    }
  }, [pending, onSettled]);

  return (
    <button type="submit" disabled={pending} className={buttonClass("danger")}>
      {pending ? workingLabel : label}
    </button>
  );
}

/** What Tab may land on inside the card. */
const FOCUSABLE = "button:not([disabled]), [href], input:not([type='hidden'])";

export function ConfirmAction({
  triggerLabel,
  triggerIcon,
  triggerTitle,
  triggerSize = "md",
  title,
  subject,
  body,
  confirmLabel,
  action,
  fields = {},
}: {
  /** A plain `secondary` button, labelled — never coloured (§3). */
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
  /** The fuller phrase, as a tooltip, when the visible label is a short verb. */
  triggerTitle?: string;
  /** `sm` in a table row or a panel, where the default would be oversized (§6). */
  triggerSize?: ButtonSize;
  title: string;
  /**
   * The affected item's own name — a label the user wrote, so sans, not mono.
   * Omitted when there is none: a postback key has no name.
   */
  subject?: string;
  /** One line of consequence. */
  body: string;
  confirmLabel: string;
  /** A server action: confirming submits a form, no client-side fetch. */
  action: (formData: FormData) => void | Promise<void>;
  /** Hidden inputs the action reads. */
  fields?: Record<string, string>;
}) {
  const dict = useDict();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Per instance: a list renders one of these per row, and a fixed id would
  // label every dialog with the first row's heading.
  const titleId = useId();
  const bodyId = useId();

  // Focus goes back to where the dialog was opened from, or a keyboard user is
  // dropped at the top of the page. When the action removed the trigger — a
  // deleted row — there is nothing to return to and the ref is simply empty.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    // On the document, not the backdrop: a keydown handler on the backdrop only
    // hears keys while focus is inside it, so one stray click on the body copy
    // or a Tab past the last button and Escape stopped working. Tab is kept
    // inside the card for the same reason — this is a modal, and focus that
    // wanders onto the page behind it is focus on controls the backdrop hides.
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        title={triggerTitle}
        className={buttonClass("secondary", triggerSize)}
      >
        {triggerIcon}
        {triggerLabel}
      </button>

      {/*
        Portalled to <body>, and it has to be.
        `position: fixed` takes the overlay out of layout flow but NOT out of
        the DOM tree, so left in place it stays a descendant of whatever renders
        the trigger — a row's `<td className="… whitespace-nowrap">`, for one —
        and `white-space` is an inherited property. The delete dialog's body
        copy inherited `nowrap`, rendered as one 880px line inside a 384px card,
        and spilled across the table; `break-words` cannot override `nowrap`.
        Rendering from <body> is what actually detaches it, and it also keeps
        `fixed` positioned against the viewport if an ancestor ever gains a
        transform/filter/contain.
      */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ground/70 p-4"
            onClick={close}
          >
            <div
              ref={cardRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={titleId}
              // The consequence is the point of the dialog, so it is announced
              // with the title rather than left for the reader to find.
              aria-describedby={bodyId}
              onClick={(e) => e.stopPropagation()}
              // `min-w-0`: this card is a flex item of the centering backdrop
              // above, and a flex item's default `min-width: auto` lets its
              // content's own intrinsic width win over `max-w-sm` — which is
              // exactly what let the body paragraph push the card wide and
              // spill unwrapped past its own edge. `min-w-0` puts `max-w-sm`
              // back in charge of the card's width.
              className="flex w-full min-w-0 max-w-sm flex-col gap-6 rounded-panel border border-hairline bg-surface p-6 shadow-overlay"
            >
              <div className="flex flex-col gap-2">
                {/* An h2 element in the h3 role: a dialog's heading is a
                    heading of the page it opens over, set at card size. */}
                <h2 id={titleId} className="type-h3">
                  {title}
                </h2>
                {subject && (
                  <p className="truncate type-small font-medium">{subject}</p>
                )}
                <p id={bodyId} className="break-words type-small text-fg-muted">
                  {body}
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={close}
                  className={buttonClass("ghost")}
                >
                  {dict.common.cancel}
                </button>
                <form action={action}>
                  {Object.entries(fields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <ConfirmSubmitButton
                    label={confirmLabel}
                    workingLabel={dict.common.working}
                    onSettled={close}
                  />
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
