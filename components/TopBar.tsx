import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { TopNav } from "@/components/TopNav";
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
          <Link href={brandHref} className="flex items-center gap-2.5">
            <span className="flex size-5 items-center justify-center rounded-ctl bg-accent font-mono text-xs font-medium text-white">
              {dict.brand.mark}
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              {dict.brand.name}
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
