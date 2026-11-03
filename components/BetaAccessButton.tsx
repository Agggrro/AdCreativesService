"use client";

import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/Button";
import { ConfirmAction } from "@/components/ui/ConfirmAction";
import { useDict } from "@/components/i18n/LocaleProvider";
import { grantBetaAccess, revokeBetaAccess } from "@/app/dashboard/admin/actions";

/** Disabled while the action runs, so a double click grants once. */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      // `sm`: a row action (§6). A word, not an icon, like every row action.
      className={buttonClass("secondary", "sm")}
    >
      {label}
    </button>
  );
}

/**
 * The one row action of the accounts list (ADR-0034): grant or revoke, by what
 * the row already has.
 *
 * Grant is a single click — granting twice loses nothing. Revoke goes through
 * the destructive confirmation (§6): a re-grant restores access, but not what
 * the revoke took in the meantime — a running campaign's tag stops serving the
 * interactive payload within two minutes, and the grant date starts over.
 * The subject is the account's email, which is an identifier and so mono,
 * unlike the user-written names the dialog usually carries.
 */
export function BetaAccessButton({
  userId,
  email,
  granted,
}: {
  userId: string;
  email: string;
  granted: boolean;
}) {
  const dict = useDict();
  if (granted) {
    return (
      <ConfirmAction
        triggerLabel={dict.admin.revoke}
        triggerSize="sm"
        title={dict.admin.revokeConfirmTitle}
        subject={email}
        subjectMono
        body={dict.admin.revokeConfirmBody}
        confirmLabel={dict.admin.revoke}
        action={revokeBetaAccess}
        fields={{ user_id: userId }}
      />
    );
  }
  return (
    <form action={grantBetaAccess}>
      <input type="hidden" name="user_id" value={userId} />
      <Submit label={dict.admin.grant} />
    </form>
  );
}
