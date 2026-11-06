"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ToolListing } from "@/lib/tools";
import { NavDropdown } from "@/components/NavDropdown";
import { navItemClass } from "@/components/navItemClass";

/**
 * The "Tools" nav entry (ADR-0013): a disclosure button that lists the two free
 * tools right here — by name, nothing under it (ADR-0037). There is no `/tools`
 * index page; this panel is the only place the two are listed together, and each
 * tool's own page is still reachable directly (a search engine, a bookmark,
 * `?tag=` on the validator).
 *
 * The mechanism, and the reasons it needs no portal, are `NavDropdown`'s.
 */
export function ToolsNavMenu({
  label,
  items,
}: {
  label: string;
  items: ToolListing[];
}) {
  const pathname = usePathname();
  const current = pathname.startsWith("/tools");

  return (
    <NavDropdown
      label={label}
      current={current}
      triggerClassName={navItemClass(current, "inline-flex items-center gap-1")}
      panelClassName="w-64 divide-y divide-hairline"
    >
      {items.map((tool, i) => (
        <Link
          key={tool.href}
          href={tool.href}
          className={`focus-inset flex h-11 items-center px-5 type-small text-fg transition-colors duration-150 hover:bg-surface-2 ${
            i === 0 ? "rounded-t-ctl" : ""
          } ${i === items.length - 1 ? "rounded-b-ctl" : ""}`}
        >
          {tool.name}
        </Link>
      ))}
    </NavDropdown>
  );
}
