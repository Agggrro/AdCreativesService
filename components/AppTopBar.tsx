import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { signOut } from "@/app/auth/actions";
import { mainNav, publicNav } from "@/lib/nav";
import { TopBar } from "@/components/TopBar";
import { Button, LinkButton } from "@/components/ui/Button";

/**
 * The one top bar, rendered by both the dashboard layout and the public
 * catalog. The catalog lives outside app/dashboard/, so it cannot inherit that
 * layout — sharing this component is what keeps the section underline correct
 * on a public page and a private one alike.
 *
 * A signed-out visitor gets the shorter `publicNav`: the sections behind a
 * login are dropped rather than the whole strip hidden, so the catalog and the
 * free tools stay reachable by the people they exist for (ADR-0013).
 */
export async function AppTopBar() {
  const supabase = await createServerSupabase();
  const { dict } = await getDict();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <TopBar
      dict={dict}
      brandHref="/"
      nav={user ? mainNav(dict) : publicNav(dict)}
      right={
        user ? (
          <>
            <span className="data-instr hidden type-small text-fg-muted lg:inline">
              {user.email}
            </span>
            <form action={signOut} className="hidden sm:block">
              <Button type="submit" variant="ghost">
                {dict.common.signOut}
              </Button>
            </form>
          </>
        ) : (
          <>
            {/*
              The secondary action drops below `sm` and the primary one stays:
              on a 390px bar there is room for one, and the one worth keeping is
              the one the page exists to produce. Sign-in moves into the menu
              panel rather than disappearing — see `mobileAccount`.
            */}
            <LinkButton href="/login" variant="ghost" className="hidden sm:inline-flex">
              {dict.common.signIn}
            </LinkButton>
            <LinkButton href="/signup" variant="primary">
              {dict.common.getStarted}
            </LinkButton>
          </>
        )
      }
      /*
       * The same actions again, for the menu panel. Everything in `right` above
       * is hidden below `sm` because a 390px bar cannot hold it, and without a
       * second home a signed-in visitor on a phone had **no way to sign out at
       * all** — the account cluster was simply gone. The bar and the panel never
       * show the same control at the same width, so this is two placements of
       * one action, not two actions.
       */
      mobileAccount={
        user ? (
          <>
            <span className="data-instr type-small break-all text-fg-muted">
              {user.email}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="secondary" className="w-full">
                {dict.common.signOut}
              </Button>
            </form>
          </>
        ) : (
          <LinkButton href="/login" variant="secondary" className="w-full">
            {dict.common.signIn}
          </LinkButton>
        )
      }
    />
  );
}
