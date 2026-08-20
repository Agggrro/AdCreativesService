"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";
import { deleteCreative } from "@/app/dashboard/creatives/actions";

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
      // on top of the very error notice it just produced. On success the row
      // unmounts and this never runs.
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

export function DeleteCreativeButton({
  creativeId,
  creativeName,
}: {
  creativeId: string;
  creativeName: string;
}) {
  const dict = useDict();
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={dict.dashboard.deleteCreative}
        // A row action: §6 puts this at `sm`, and the default would push the
        // row past the 44px §2 fixes for a data table.
        className={buttonClass("secondary", "sm")}
      >
        <Trash2 size={14} aria-hidden />
        {/* Short verb on the button itself — "Delete creative" is redundant
            on a row that's already a creative. The fuller phrase stays on
            the tooltip. */}
        {dict.dashboard.deleteConfirmAction}
      </button>

      {/*
        Portalled to <body>, and it has to be.
        `position: fixed` takes the overlay out of layout flow but NOT out of
        the DOM tree, so left in place it stays a descendant of the row's
        `<td className="… whitespace-nowrap">` — and `white-space` is an
        inherited property. The dialog's body copy inherited `nowrap`, rendered
        as one 880px line inside a 384px card, and spilled across the table;
        `break-words` cannot override `nowrap`. Rendering from <body> is what
        actually detaches it, and it also keeps `fixed` positioned against the
        viewport if an ancestor ever gains a transform/filter/contain.
      */}
      {open &&
        createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ground/70 p-4"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-creative-title"
            onClick={(e) => e.stopPropagation()}
            // `min-w-0`: this card is a flex item of the centering backdrop
            // above, and a flex item's default `min-width: auto` lets its
            // content's own intrinsic width win over `max-w-sm` — which is
            // exactly what let the body paragraph push the card wide and
            // spill unwrapped past its own edge. `min-w-0` puts `max-w-sm`
            // back in charge of the card's width, the way it would work if
            // this weren't a flex child at all.
            className="w-full min-w-0 max-w-sm rounded-panel border border-hairline bg-surface p-6 shadow-overlay"
          >
            <h2
              id="delete-creative-title"
              className="type-h3"
            >
              {dict.dashboard.deleteConfirmTitle}
            </h2>
            <p className="mt-2 truncate type-small font-medium">
              {creativeName}
            </p>
            <p className="mt-2 break-words type-small text-fg-muted">
              {dict.dashboard.deleteConfirmBody}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => setOpen(false)}
                className={buttonClass("ghost")}
              >
                {dict.common.cancel}
              </button>
              <form action={deleteCreative}>
                <input type="hidden" name="creative_id" value={creativeId} />
                <ConfirmSubmitButton
                  label={dict.dashboard.deleteConfirmAction}
                  workingLabel={dict.common.working}
                  onSettled={() => setOpen(false)}
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
