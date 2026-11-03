import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { formatDate } from "@/lib/i18n/format";
import { readOwnAccess, TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/beta-access";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Field";
import { StateWord } from "@/components/ui/State";
import { buttonClass } from "@/components/ui/Button";

/**
 * What the subscriptions page became in the closed beta (ADR-0034): the one
 * fact the account holder needs — whether their tags serve the interactive
 * payload — and the one way to change it, which is a conversation rather than
 * a checkout. Read on the caller's own session, so RLS answers.
 */
export default async function AccessPage() {
  const supabase = await createServerSupabase();
  const { locale, dict } = await getDict();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The layout has already redirected a signed-out visitor; this is the type's
  // null, not a reachable state.
  if (!user) redirect("/login");
  const access = await readOwnAccess(supabase, user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={dict.access.title} subtitle={dict.access.subtitle} />

      <Panel className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="flex flex-col gap-1">
            <span className="label-instr">{dict.access.accountLabel}</span>
            <span className="data-instr type-small break-all">{user.email}</span>
          </span>
          <span className="flex flex-col gap-1">
            <span className="label-instr">{dict.dashboard.status}</span>
            <span className="flex items-center gap-2">
              <StateWord
                tone={access.granted ? "live" : "idle"}
                label={access.granted ? dict.access.granted : dict.access.notGranted}
              />
              {access.since && (
                <span className="type-caption text-fg-muted">
                  {dict.access.grantedOn}{" "}
                  <span className="data-instr">{formatDate(locale, access.since)}</span>
                </span>
              )}
            </span>
          </span>
        </div>

        {!access.granted && (
          <>
            <p className="type-small max-w-[66ch] text-fg-secondary">{dict.access.body}</p>
            <div>
              {/* The page's one primary action: it is the only thing a visitor
                  without access can do here, so it takes the accent (§3). */}
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noreferrer noopener"
                className={buttonClass("primary", "md")}
              >
                {dict.access.telegram}
                <span className="data-instr">@{TELEGRAM_HANDLE}</span>
              </a>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
