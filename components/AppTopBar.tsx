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
            <span className="data-instr hidden text-[13px] text-fg-muted sm:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost">
                {dict.common.signOut}
              </Button>
            </form>
          </>
        ) : (
          <>
            <LinkButton href="/login" variant="ghost">
              {dict.common.signIn}
            </LinkButton>
            <LinkButton href="/signup" variant="secondary">
              {dict.common.getStarted}
            </LinkButton>
          </>
        )
      }
    />
  );
}
