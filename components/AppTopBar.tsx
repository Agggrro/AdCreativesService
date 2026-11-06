import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { mainNav, publicNav } from "@/lib/nav";
import { isAdminEmail } from "@/lib/admin";
import { readOwnAccess } from "@/lib/beta-access";
import { TopBar } from "@/components/TopBar";
import { AccountMenu } from "@/components/AccountMenu";
import { AccountPanel } from "@/components/AccountPanel";
import { LinkButton } from "@/components/ui/Button";

/**
 * The one top bar, rendered by both the dashboard layout and the public
 * catalog. The catalog lives outside app/dashboard/, so it cannot inherit that
 * layout — sharing this component is what keeps the section underline correct
 * on a public page and a private one alike.
 *
 * A signed-out visitor gets the shorter `publicNav`: the sections behind a
 * login are dropped rather than the whole strip hidden, so the catalog and the
 * free tools stay reachable by the people they exist for (ADR-0013).
 *
 * A signed-in viewer gets Creatives, Tools and one Account menu (ADR-0037): the
 * address, the access state, the postback, the language and sign-out sit in it
 * instead of in the bar. Reading the viewer's own entitlement rows costs one
 * owner-scoped query per page; the admin's accounts link joins the menu for the
 * accounts `lib/admin.ts` names.
 */
export async function AppTopBar() {
  const supabase = await createServerSupabase();
  const { dict } = await getDict();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = user ? isAdminEmail(user.email) : false;
  const access = user
    ? await readOwnAccess(supabase, user.id)
    : { granted: false, since: null };

  // One component, two homes: the dropdown from `lg`, and the end of the mobile
  // panel below it. The bar and the panel never show the same control at the
  // same width.
  const accountProps = user
    ? {
        dict,
        email: user.email ?? "",
        granted: access.granted,
        admin,
      }
    : null;

  return (
    <TopBar
      dict={dict}
      brandHref="/"
      nav={user ? mainNav(dict) : publicNav(dict)}
      // A signed-in viewer's language control is a row of the account menu.
      language={!user}
      right={
        user ? (
          <div className="hidden lg:block">
            <AccountMenu label={dict.nav.account}>
              {accountProps && <AccountPanel {...accountProps} variant="menu" />}
            </AccountMenu>
          </div>
        ) : (
          <>
            {/*
              The secondary action drops below `lg` and the primary one stays:
              on a compact bar there is room for one, and the one worth keeping
              is the one the page exists to produce — down to `xs`, below which
              not even that fits. Sign-in moves into the menu panel rather than
              disappearing — see `mobileAccount`.
            */}
            {/* `max-lg:hidden`, not `hidden lg:inline-flex`: the button's own
                `inline-flex` is emitted after `hidden` (Tailwind orders same-
                property utilities by name), so that pair never hid it, and at
                390px Sign in sat over the wordmark. A variant is emitted after
                every base utility, so it wins. */}
            <LinkButton href="/login" variant="ghost" className="max-lg:hidden">
              {dict.common.signIn}
            </LinkButton>
            {/* Below `xs` (24rem, app/globals.css) — the 360 and 375 phones —
                even the one action does not fit beside the wordmark: the
                English label met it by 4px at 375 and 19px at 360. It moves
                into the panel there, below. */}
            <LinkButton href="/signup" variant="primary" className="max-xs:hidden">
              {dict.common.getStarted}
            </LinkButton>
          </>
        )
      }
      /*
       * The same actions again, for the menu panel. A signed-in viewer's panel
       * ends with the account rows — `-mx-5` lets their dividers run edge to
       * edge across the panel's gutter. A signed-out visitor's is sign-in and,
       * below `xs`, sign-up: the bar and the panel never show the same control
       * at the same width, so this is two placements of one action, not two
       * actions.
       */
      mobileAccount={
        user && accountProps ? (
          <div className="-mx-5">
            <AccountPanel {...accountProps} variant="panel" />
          </div>
        ) : (
          <>
            <LinkButton href="/login" variant="secondary" className="w-full">
              {dict.common.signIn}
            </LinkButton>
            {/* Only where the bar dropped it (below `xs`): one placement of
                the sign-up action at any width, never two. */}
            <LinkButton href="/signup" variant="primary" className="w-full xs:hidden">
              {dict.common.getStarted}
            </LinkButton>
          </>
        )
      }
    />
  );
}
