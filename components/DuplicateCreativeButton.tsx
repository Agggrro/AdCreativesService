"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";
import { duplicateCreative } from "@/app/dashboard/creatives/actions";

/** Disabled while the action runs, so a double click makes one copy, not two. */
function Submit() {
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
      className={buttonClass("secondary", "sm")}
    >
      {dict.dashboard.duplicate}
    </button>
  );
}

export function DuplicateCreativeButton({ creativeId }: { creativeId: string }) {
  return (
    <form action={duplicateCreative}>
      <input type="hidden" name="creative_id" value={creativeId} />
      <Submit />
    </form>
  );
}
