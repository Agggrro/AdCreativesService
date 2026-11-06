"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";
import { duplicateCreative } from "@/app/dashboard/creatives/actions";

/** Disabled while the action runs, so a double click makes one copy, not two. */
function Submit({ rowClassName }: { rowClassName?: string }) {
  const dict = useDict();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      title={dict.dashboard.duplicateTitle}
      // `sm`: a row action (§6), and the 44px row has no room for `md`. No
      // icon, like its neighbours: see the action column on the creatives page.
      className={rowClassName ?? buttonClass("secondary", "sm")}
    >
      {dict.dashboard.duplicate}
    </button>
  );
}

export function DuplicateCreativeButton({
  creativeId,
  rowClassName,
}: {
  creativeId: string;
  /** Renders the button as a row of a menu, with this look, instead of an `sm` button. */
  rowClassName?: string;
}) {
  return (
    <form action={duplicateCreative}>
      <input type="hidden" name="creative_id" value={creativeId} />
      <Submit rowClassName={rowClassName} />
    </form>
  );
}
