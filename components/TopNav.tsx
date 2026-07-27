"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TopBarLink } from "@/components/TopBar";

/**
 * Section links in the top bar. The current section is marked with the accent
 * underline — one of the at-most-two accent appearances on a dashboard screen.
 */
export function TopNav({ items }: { items: TopBarLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {items.map((item) => {
        const current = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "border-b-2 border-accent px-2.5 pt-1.5 pb-1 text-[13px] font-medium text-fg"
                : "rounded-ctl px-2.5 py-1.5 text-[13px] text-fg-secondary hover:bg-fill"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
