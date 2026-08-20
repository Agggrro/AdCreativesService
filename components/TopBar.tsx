import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TopNav } from "@/components/TopNav";
import { MobileNav } from "@/components/MobileNav";
import { BrandMark } from "@/components/ui/BrandMark";
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
 * The one top bar: brand mark, section links, then the language control next to
 * the account. The accent appears here at most once — on the current section's
 * marker, which §3 exempts from the budget along with the lockup itself.
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
  right,
}: {
  dict: Dict;
  brandHref: string;
  nav?: TopBarLink[];
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-ground/90 backdrop-blur-md">
      <Container
        width="wide"
        className="flex h-16 items-center justify-between gap-4 sm:h-[72px] sm:gap-8"
      >
        <div className="flex min-w-0 items-center gap-6 lg:gap-10">
          {/*
            Named explicitly because the wordmark is split across two elements
            for colour: the accessible name would otherwise be assembled from
            nested nodes, and the a11y tree already reports them as separate
            generics. One label, in the right order, regardless.
          */}
          <Link
            href={brandHref}
            aria-label={`${dict.brand.nameLead}${dict.brand.nameTail}`}
            className="flex shrink-0 items-center gap-2.5 rounded-ctl"
          >
            <BrandMark />
            {/*
              Two-toned to match the monogram: Creo takes the accent like the C,
              Smith the fg like the S, so the mark and the word are visibly the
              same object rather than a glyph with a caption. Split in the
              dictionary rather than sliced here — §10 forbids a human-readable
              literal in a component, even one this small.
            */}
            <span className="text-[16px] font-semibold tracking-[-0.01em]">
              <span className="text-accent">{dict.brand.nameLead}</span>
              {dict.brand.nameTail}
            </span>
          </Link>
          {nav.length > 0 && <TopNav items={nav} />}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {/*
            Below `sm` the bar carries brand · primary action · menu, and nothing
            else fits: with the language control still here the cluster overflowed
            390px by 11px. The control moves into the menu panel rather than being
            dropped — it is reachable at every width, just not always in the bar.
          */}
          <span className="hidden sm:flex">
            <LanguageSwitcher />
          </span>
          {right}
          {nav.length > 0 && <MobileNav items={nav} />}
        </div>
      </Container>
    </header>
  );
}
