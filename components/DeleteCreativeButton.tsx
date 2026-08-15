"use client";

import { useEffect, useRef, useState } from "react";
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
        className={buttonClass("secondary")}
      >
        <Trash2 size={14} aria-hidden />
        {/* Short verb on the button itself — "Delete creative" is redundant
            on a row that's already a creative. The fuller phrase stays on
            the tooltip. */}
        {dict.dashboard.deleteConfirmAction}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4"
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
            className="w-full max-w-sm rounded-ctl border border-hairline bg-surface p-6 shadow-overlay"
          >
            <h2
              id="delete-creative-title"
              className="text-[15px] font-semibold leading-[22px] tracking-[-0.01em]"
            >
              {dict.dashboard.deleteConfirmTitle}
            </h2>
            <p className="mt-2 truncate text-[13px] font-medium leading-5">
              {creativeName}
            </p>
            <p className="mt-2 text-[13px] leading-5 text-fg-muted">
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
        </div>
      )}
    </>
  );
}
