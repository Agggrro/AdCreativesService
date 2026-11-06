import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { getDict } from "@/lib/i18n/server";
import { isAdminEmail } from "@/lib/admin";
import { readOwnAccess } from "@/lib/beta-access";
import { AccountMenu } from "@/components/AccountMenu";
import { AccountPanel } from "@/components/AccountPanel";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { buttonClass } from "@/components/ui/Button";
import { chipType } from "@/components/ui/Chip";
import { Container } from "@/components/ui/Container";

/**
 * The bar of the two free tools (docs/design-system.md §6, "Free tools";
 * ADR-0038): the lockup, the **Validator | Generator** switch in the middle and the
 * visitor on the right — a signed-out visitor's language and *Sign in*, a signed-in
 * one's way back to *Creatives* and their account menu.
 *
 * It stands where the product bar stood on these pages, as a creative's bar does
 * on its own: the tool is the screen, and what it needs from a bar is the other
 * tool one click away rather than a section list to read through. The product is
 * still reachable — the lockup goes to the landing page and a signed-in visitor
 * has *Creatives* beside the menu. The tools stay public: the session is read for
 * the visitor's own cluster and nothing else.
 *
 * Below `md` the bar re-stacks instead of squeezing, as the workspace bar does: the
 * lockup and the account (or *Sign in*) on a 48px row, then the switch with the
 * secondary link — *Creatives*, or the language control — at the end of it. The
 * switch is about 184px in either language and the two outer columns of a single
 * row are 64px at 360, so a one-row bar there ran the switch under the account. One
 * DOM for both, placed by the grid; the pieces that sit side by side from `md` are
 * `contents` below it.
 *
 * The validator is a page with a width (`Section wide`), so its bar stands in the
 * same column; the generator is a workspace and its bar runs edge to edge, like the
 * creative's own.
 *
 * The switch is two links, not a client toggle: each tool is its own address,
 * indexed and shared (`?tag=` on the validator), and the current one is
 * `aria-current` and on `surface-2`, never the accent — a choice among peers
 * (§6, "Segmented controls").
 */
export async function ToolBar({ current }: { current: "validator" | "generator" }) {
  const supabase = await createServerSupabase();
  const { dict } = await getDict();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await readOwnAccess(supabase, user.id) : null;

  const tools = [
    { key: "validator", href: "/tools/vast-validator", label: dict.tools.switchValidator },
    { key: "generator", href: "/tools/vast-generator", label: dict.tools.switchGenerator },
  ] as const;

  const row =
    "grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[3rem_auto] items-center gap-x-3 pb-3 md:h-12 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:grid-rows-1 md:gap-x-4 md:pb-0";

  const content = (
    <>
      <BrandLockup dict={dict} href="/" className="col-start-1 row-start-1" />

      <nav
        aria-label={dict.tools.switchLabel}
        className="col-start-1 row-start-2 inline-flex justify-self-start rounded-ctl border border-line bg-surface md:col-start-2 md:row-start-1"
      >
        {tools.map((tool) => {
          const here = tool.key === current;
          return (
            <Link
              key={tool.key}
              href={tool.href}
              aria-current={here ? "page" : undefined}
              className={`${chipType} border-r border-hairline px-3 py-2 transition-colors duration-150 first:rounded-l-ctl last:rounded-r-ctl last:border-r-0 ${
                here ? "bg-surface-2 text-fg" : "text-fg-secondary hover:bg-surface-2"
              }`}
            >
              {tool.label}
            </Link>
          );
        })}
      </nav>

      <div className="contents md:col-start-3 md:row-start-1 md:flex md:items-center md:justify-end md:gap-2">
        {user ? (
          <>
            <Link
              href="/dashboard/creatives"
              className={buttonClass(
                "ghost",
                "sm",
                "max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end",
              )}
            >
              {dict.dashboard.creatives}
            </Link>
            <div className="max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end">
              <AccountMenu label={dict.nav.account} size="sm">
                <AccountPanel
                  dict={dict}
                  email={user.email ?? ""}
                  granted={access?.granted ?? false}
                  admin={isAdminEmail(user.email)}
                  variant="menu"
                />
              </AccountMenu>
            </div>
          </>
        ) : (
          <>
            <div className="max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end">
              <LanguageSwitcher />
            </div>
            <Link
              href="/login"
              className={buttonClass(
                "ghost",
                "sm",
                "max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end",
              )}
            >
              {dict.common.signIn}
            </Link>
          </>
        )}
      </div>
    </>
  );

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-hairline bg-ground/90 backdrop-blur-md">
      {current === "validator" ? (
        <Container width="wide" className={row}>
          {content}
        </Container>
      ) : (
        <div className={`${row} px-3 md:px-6`}>{content}</div>
      )}
    </header>
  );
}
