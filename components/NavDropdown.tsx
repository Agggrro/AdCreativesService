"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

/**
 * A disclosure button with a panel under it — the one mechanism behind the bar's
 * two dropdowns, Tools (`ToolsNavMenu`, ADR-0013) and Account (`AccountMenu`,
 * ADR-0037). docs/design-system.md §6, "Nav dropdown" and "Account menu"; read
 * the first before reusing this anywhere else, because the exemption below is
 * narrow.
 *
 * Not portalled, unlike the destructive-confirmation dialog. The portal rule
 * guards two hazards, and each is checked on its own terms: the DOM path from
 * `<header>` to this panel is clean of anything inheritable (no `overflow-hidden`,
 * `white-space` or `truncate` ancestor), and the viewport-anchor hazard
 * (`transform`/`filter`/`contain` hijacking `fixed`) does not apply because the
 * panel is `position: absolute` against a `relative` wrapper it owns, not `fixed`
 * against the viewport — which also means it scrolls with the header. The header
 * is `sticky`; a sticky ancestor gives an absolute panel no viewport anchor to
 * hijack. Re-run that check if this is ever reused inside a different header.
 *
 * It is the two-item disclosure pattern, not a full ARIA `menu` role, which would
 * promise arrow-key navigation this component does not implement.
 */
export function NavDropdown({
  label,
  triggerClassName,
  current = false,
  align = "left",
  panelClassName = "",
  children,
}: {
  label: string;
  /** The trigger's look: a plain nav item for Tools, a quiet button for Account. */
  triggerClassName: string;
  current?: boolean;
  /** Which edge of the trigger the panel hangs from. */
  align?: "left" | "right";
  /** Width and any divider; the border, radius and overlay shadow are the panel's own. */
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const [open, setOpen] = useState(false);
  // The panel is open for one route. A navigation closes it as a consequence of the
  // route changing — derived while rendering rather than chased by an effect, which
  // is the pattern React documents for state that resets when a value changes.
  const [openAt, setOpenAt] = useState(pathname);
  if (openAt !== pathname) {
    setOpenAt(pathname);
    setOpen(false);
  }

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
        className={triggerClassName}
      >
        {label}
        <ChevronDown
          size={14}
          aria-hidden
          className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          // Focusable so a click on text inside the panel keeps focus within it:
          // without it the click lands on nothing focusable, `blur` sees no
          // related target, and the panel closes under the reader's cursor.
          tabIndex={-1}
          // A link taps through to its own route; closing here covers the one case
          // where that route is the current one and so never changes `pathname`.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className={`absolute top-full z-50 mt-2 rounded-panel border border-hairline bg-surface shadow-overlay outline-none ${
            align === "right" ? "right-0" : "left-0"
          } ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
