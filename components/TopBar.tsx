import type { Dict } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TopNav } from "@/components/TopNav";
import { MobileNav } from "@/components/MobileNav";
import { BrandLockup } from "@/components/ui/BrandLockup";
import { Container } from "@/components/ui/Container";
import type { ToolListing } from "@/lib/tools";

export type TopBarLink = {
  href: string;
  label: string;
  exact?: boolean;
  /** Present only on the Tools entry — renders it as a dropdown instead of a link. */
  tools?: ToolListing[];
};

/**
 * The one top bar: brand mark, section links, then the account cluster. The accent
 * appears here at most once — on the current section's marker, which §3 exempts
 * along with the lockup itself.
 *
 * `sticky` because both reference sites this system was measured against keep
 * their navigation pinned, and because the page is long enough on marketing
 * surfaces that losing the nav costs a scroll back to the top.
 *
 * The header is the positioning context `MobileNav`'s panel hangs from
 * (`top-full`), which is why the sticky element is the `<header>` itself rather
 * than an inner wrapper.
 */
export function TopBar({
  dict,
  brandHref,
  nav = [],
  language = true,
  right,
  mobileAccount,
}: {
  dict: Dict;
  brandHref: string;
  nav?: TopBarLink[];
  /**
   * The `RU | EN` control in the bar. A signed-in viewer has it in the account
   * menu instead (ADR-0037), so the bar passes `false` for them.
   */
  language?: boolean;
  /** The account cluster in the bar itself, from `lg` up. */
  right?: React.ReactNode;
  /** The same actions for the mobile panel, where the bar has no room. */
  mobileAccount?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-ground/90 backdrop-blur-md">
      <Container
        width="wide"
        className="flex h-16 items-center justify-between gap-4 sm:h-[72px] sm:gap-8"
      >
        <div className="flex min-w-0 items-center gap-6 lg:gap-10">
          <BrandLockup dict={dict} href={brandHref} />
          {nav.length > 0 && <TopNav items={nav} />}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/*
            Below `lg` the bar carries the lockup, a signed-out visitor's sign-up
            action and the menu; below `xs` the lockup and the menu (AppTopBar).
            The navigation, the language control and the account move into the
            menu panel rather than being dropped — reachable at every width,
            just not always in the bar.

            Measured 2026-11-03, labels unwrapped, overlay scrollbars as on a
            phone: the full bar fits from 768 signed out and from 832 signed in
            (Russian, the longer locale), hence `lg`. At 390 the English sign-up
            clears the wordmark by 11px, at 384 by 5px. What overlapped at 390
            before was a Sign in that never hid — see docs/design-system.md §11.
          */}
          {language && (
            <span className="hidden lg:flex">
              <LanguageSwitcher />
            </span>
          )}
          {right}
          {/* Below `lg` the panel is the only home of sign-in and the account,
              so it mounts whenever it has either to hold. */}
          {(nav.length > 0 || mobileAccount) && (
            <MobileNav items={nav} account={mobileAccount} language={language} />
          )}
        </div>
      </Container>
    </header>
  );
}
