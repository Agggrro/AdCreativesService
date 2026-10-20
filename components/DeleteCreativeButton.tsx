"use client";

import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { useDict } from "@/components/i18n/LocaleProvider";
import { deleteCreative } from "@/app/dashboard/creatives/actions";

export function DeleteCreativeButton({
  creativeId,
  creativeName,
}: {
  creativeId: string;
  creativeName: string;
}) {
  const dict = useDict();

  return (
    <ConfirmAction
      // Short verb on the button itself — "Delete creative" is redundant on a
      // row that's already a creative. The fuller phrase stays on the tooltip.
      triggerLabel={dict.dashboard.deleteConfirmAction}
      // No icon: the creatives table carries three labelled row actions, and
      // the word is what has to fit (§11 — narrower, never icon-only).
      triggerTitle={dict.dashboard.deleteCreative}
      // A row action: §6 puts this at `sm`, and the default would push the row
      // past the 44px §2 fixes for a data table.
      triggerSize="sm"
      title={dict.dashboard.deleteConfirmTitle}
      subject={creativeName}
      body={dict.dashboard.deleteConfirmBody}
      confirmLabel={dict.dashboard.deleteConfirmAction}
      action={deleteCreative}
      fields={{ creative_id: creativeId }}
    />
  );
}
