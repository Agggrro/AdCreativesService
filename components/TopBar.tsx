import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TopNav } from "@/components/TopNav";
import { BrandMark } from "@/components/ui/BrandMark";
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
 * underline (docs/design-system.md §3).
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
    <header className="border-b border-hairline bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center justify-between gap-6 px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/*
            Named explicitly because the wordmark is split across two elements
            for colour: the accessible name would otherwise be assembled from
            nested nodes, and the a11y tree already reports them as separate
            generics. One label, in the right order, regardless.
          */}
          <Link
            href={brandHref}
            aria-label={`${dict.brand.nameLead}${dict.brand.nameTail}`}
            className="flex items-center gap-2.5"
          >
            <BrandMark />
            {/*
              Two-toned to match the monogram: Creo takes the accent like the C,
              Smith the fg like the S, so the mark and the word are visibly the
              same object rather than a glyph with a caption. Split in the
              dictionary rather than sliced here — §8 forbids a human-readable
              literal in a component, even one this small.
            */}
            <span className="text-[15px] font-bold tracking-[-0.01em]">
              <span className="text-accent">{dict.brand.nameLead}</span>
              {dict.brand.nameTail}
            </span>
          </Link>
          {nav.length > 0 && <TopNav items={nav} />}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <LanguageSwitcher />
          {right}
        </div>
      </div>
    </header>
  );
}
