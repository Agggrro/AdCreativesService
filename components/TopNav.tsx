"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TopBarLink } from "@/components/TopBar";
import { ToolsNavMenu } from "@/components/ToolsNavMenu";
import { navItemClass } from "@/components/navItemClass";

/**
 * Section links in the top bar. The current section is marked with the accent
 * underline — one of the at-most-two accent appearances on a dashboard screen.
 *
 * An item carrying `tools` (only the Tools entry, today) renders as a dropdown
 * instead of a link — see `ToolsNavMenu`.
 */
export function TopNav({ items }: { items: TopBarLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {items.map((item) => {
        if (item.tools) {
          return <ToolsNavMenu key={item.href} label={item.label} items={item.tools} />;
        }

        const current = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={navItemClass(current)}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
