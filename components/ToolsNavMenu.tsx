"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { ToolListing } from "@/lib/tools";
import { StateWord } from "@/components/ui/State";
import { navItemClass } from "@/components/navItemClass";

/**
 * The "Tools" nav entry (ADR-0013): a disclosure button that drops the two
 * free tools right there instead of linking to the `/tools` index first —
 * that index still exists for search-engine arrivals, it just isn't the path
 * a nav click takes anymore.
 *
 * Not portalled, unlike the destructive-confirmation dialog
 * (docs/design-system.md §6, "Nav dropdown" — read it before reusing this as
 * precedent, the exemption is narrow and re-verified per hazard, not a
 * blanket "absolute doesn't need a portal"). Short version: the DOM path from
 * `<header>` to this panel is checked clean of anything inheritable (no
 * `overflow-hidden`/`white-space`/`truncate` ancestor), and the viewport-
 * anchor hazard (`transform`/`filter`/`contain` hijacking `fixed`) doesn't
 * apply because this is `position: absolute` against a `relative` wrapper it
 * owns, not `fixed` against the viewport — which also means it correctly
 * scrolls with the (non-`sticky`) header instead of detaching from it.
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-current={current ? "page" : undefined}
        className={navItemClass(current, "inline-flex items-center gap-1")}
      >
        {label}
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform duration-[120ms] ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute left-0 top-full z-50 mt-2 w-80 divide-y divide-hairline rounded-ctl border border-hairline bg-surface shadow-overlay"
        >
          {items.map((tool, i) => (
            <Link
              key={tool.href}
              href={tool.href}
              onClick={() => setOpen(false)}
              className={`block px-3 py-3 hover:bg-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                i === 0 ? "rounded-t-ctl" : ""
              } ${i === items.length - 1 ? "rounded-b-ctl" : ""}`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-fg">{tool.name}</span>
                <StateWord tone={tool.tone} label={tool.state} />
              </span>
              <span className="mt-0.5 block text-[12px] leading-4 text-fg-muted">
                {tool.description}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
