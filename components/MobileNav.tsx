"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TopBarLink } from "@/components/TopBar";
import { useDict } from "@/components/i18n/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

/**
 * The navigation below `sm` (docs/design-system.md §6, "Mobile navigation").
 *
 * It exists because the previous system did not have one: `TopNav` was
 * `hidden … sm:flex`, so a phone visitor got a brand mark and nothing to navigate
 * with. There is no width at which the nav disappears.
 *
 * The trigger carries a **word**, not just a glyph — §11 forbids icon-only
 * controls outright, and an `aria-label` is not the fix for one.
 *
 * A `tools` entry is flattened into its own links here rather than nesting a
 * second disclosure inside this one: a menu inside a menu on a 390px screen is a
 * worse answer than four rows.
 */
export function MobileNav({
  items,
  account,
}: {
  items: TopBarLink[];
  /**
   * The account actions. They live here because the bar has no room for them
   * below `sm` — and without this slot a signed-in visitor on a phone had no
   * way to sign out at all, which the desktop-only guard in `AppTopBar` caused.
   */
  account?: React.ReactNode;
}) {
  const dict = useDict();
  const pathname = usePathname();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * The panel is open for *one route*. Navigating closes it as a consequence of
   * the route changing rather than through an effect that chases it — there is no
   * state to synchronise, only state to derive.
   */
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const open = openedFor === pathname;
  const close = () => setOpenedFor(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const rows = items.flatMap((item) =>
    item.tools
      ? item.tools.map((tool) => ({ href: tool.href, label: tool.name }))
      : [{ href: item.href, label: item.label }],
  );

  return (
    <div className="sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenedFor(open ? null : pathname)}
        className="inline-flex h-11 items-center gap-2 rounded-ctl px-3 text-[14px] text-fg-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M3 6h18M3 12h18M3 18h18" />
          )}
        </svg>
        {dict.nav.menu}
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full z-20 border-y border-hairline bg-surface"
        >
          <nav className="flex flex-col px-5 py-2">
            {rows.map((row) => {
              const current = pathname.startsWith(row.href);
              return (
                <Link
                  key={row.href}
                  href={row.href}
                  // Closing is derived from the route changing, which does not
                  // happen when the tapped link IS the current route — so that
                  // one case has to close the panel itself.
                  onClick={close}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-11 items-center text-[15px] ${
                    current ? "font-medium text-accent" : "text-fg-secondary"
                  }`}
                >
                  {row.label}
                </Link>
              );
            })}
            {account && (
              <div className="mt-2 flex flex-col gap-2 border-t border-hairline pt-4">
                {account}
              </div>
            )}
            {/*
              The language control lives here below `sm` — the bar has no room for
              it at 390px, and dropping it entirely would strand a Russian visitor
              on a phone.
            */}
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-4 pb-2">
              <span className="label-instr">{dict.nav.language}</span>
              <LanguageSwitcher />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
