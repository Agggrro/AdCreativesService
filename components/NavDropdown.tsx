"use client";

import {
  createContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

/**
 * What something inside the panel may ask of the menu around it: where focus goes
 * when it is done. A dialog opened from a row of the panel hands focus back to the
 * row that opened it — and that row sits in a panel which closed behind the dialog,
 * hidden, where focus cannot land; the menu's own button is where it belongs.
 */
export const NavDropdownContext = createContext<{ focusTrigger: () => void } | null>(null);

/** What Tab and focus-on-open may land on inside the panel. */
const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * A disclosure button with a panel under it — the one mechanism behind the bar's
 * dropdowns, Tools (`ToolsNavMenu`, ADR-0013) and Account (`AccountMenu`,
 * ADR-0037), and behind the workspace's *More* and player menus and a list row's
 * *More* (ADR-0038). docs/design-system.md §6, "Nav dropdown" and "Account menu";
 * read the first before reusing this anywhere else, because the exemption below
 * is narrow.
 *
 * Not portalled by default, unlike the destructive-confirmation dialog. The portal
 * rule guards two hazards, and each is checked on its own terms: the DOM path from
 * `<header>` to this panel is clean of anything inheritable (no `overflow-hidden`,
 * `white-space` or `truncate` ancestor), and the viewport-anchor hazard
 * (`transform`/`filter`/`contain` hijacking `fixed`) does not apply because the
 * panel is `position: absolute` against a `relative` wrapper it owns, not `fixed`
 * against the viewport — which also means it scrolls with the header. The header
 * is `sticky`; a sticky ancestor gives an absolute panel no viewport anchor to
 * hijack. Re-run that check if this is ever reused inside a different header.
 *
 * Where that check fails — a row of a table, whose frame scrolls and would clip
 * the panel — pass `portal`: the panel is rendered into `<body>`, fixed at the
 * trigger's place when it opens (below it, or above it when the trigger is in the
 * lower half of the screen, where a panel would open out of view), and closes if
 * the page scrolls or resizes under it rather than following the trigger. At the
 * end of `<body>` it is out of the page's tab order, so opening it moves focus to
 * its first item, and Tab off either end of it closes it and returns to the button.
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
  closeOnClick = false,
  keepMounted = false,
  portal = false,
  children,
}: {
  /** The trigger's content: a word, or a word with a muted prefix (the player menu). */
  label: React.ReactNode;
  /** The trigger's look: a plain nav item for Tools, a quiet button for Account. */
  triggerClassName: string;
  current?: boolean;
  /** Which edge of the trigger the panel hangs from. */
  align?: "left" | "right";
  /** Width and any divider; the border, radius and overlay shadow are the panel's own. */
  panelClassName?: string;
  /**
   * Close on a click anywhere in the panel, and hand focus back to the button: for
   * a list of options (the player menu) and for a panel of actions that keeps its
   * children mounted (below). Without `keepMounted` a form closed under its own
   * click would unmount before it submitted.
   */
  closeOnClick?: boolean;
  /**
   * Keep the panel's children mounted while closed (hidden, not removed). A child
   * that owns a dialog — the delete confirmation in the creative's *More* menu —
   * would otherwise be unmounted, dialog and all, by the very mousedown that
   * lands inside that dialog and counts as "outside" this panel; a form in it still
   * submits after the panel closes under its click.
   */
  keepMounted?: boolean;
  /** Render the panel into `<body>` (see above): for a trigger inside a scrolling frame. */
  portal?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // False for the server render and for hydration, true after: a portal has no
  // server HTML to hydrate against, so it is created only once the page is live.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const context = useMemo(
    () => ({ focusTrigger: () => triggerRef.current?.focus() }),
    [],
  );

  const [open, setOpen] = useState(false);
  // Where a portalled panel hangs, read from the trigger when it opens — in the
  // click, not in an effect, so there is no render with the panel in the wrong place.
  const [anchor, setAnchor] = useState<{ top?: number; bottom?: number; edge: number } | null>(
    null,
  );
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

    function inside(node: Node) {
      return rootRef.current?.contains(node) || panelRef.current?.contains(node);
    }
    function onPointerDown(e: MouseEvent) {
      if (!inside(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    // A fixed panel does not follow its trigger, so it must not outlive where it
    // was opened: any scroll or resize closes it.
    function dismiss() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    if (portal) {
      window.addEventListener("scroll", dismiss, true);
      window.addEventListener("resize", dismiss);
    }
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      if (portal) {
        window.removeEventListener("scroll", dismiss, true);
        window.removeEventListener("resize", dismiss);
      }
    };
  }, [open, portal]);

  // A portalled panel is at the end of the document, nowhere near its trigger in
  // the tab order: focus has to be taken there, or the next Tab goes to the next
  // row and the panel closes behind it.
  useEffect(() => {
    if (!open || !portal) return;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open, portal]);

  function toggle() {
    if (!open && portal && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      // `fixed` is placed against the viewport without its scrollbars, which is
      // what `clientWidth` and `clientHeight` measure and `innerWidth` is not.
      const view = document.documentElement;
      const upward = r.top + r.height / 2 > view.clientHeight / 2;
      setAnchor({
        ...(upward ? { bottom: view.clientHeight - r.top + 8 } : { top: r.bottom + 8 }),
        edge: align === "right" ? view.clientWidth - r.right : r.left,
      });
    }
    setOpen((o) => !o);
  }

  function onPanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!portal || e.key !== "Tab") return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!items || items.length === 0) return;
    const here = document.activeElement;
    if (
      (!e.shiftKey && here === items[items.length - 1]) ||
      (e.shiftKey && here === items[0])
    ) {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  const panel = (
    <div
      id={panelId}
      ref={panelRef}
      // Focusable so a click on text inside the panel keeps focus within it:
      // without it the click lands on nothing focusable, `blur` sees no
      // related target, and the panel closes under the reader's cursor.
      tabIndex={-1}
      hidden={!open}
      onKeyDown={onPanelKeyDown}
      // A link taps through to its own route; closing here covers the one case
      // where that route is the current one and so never changes `pathname`.
      onClick={(e) => {
        const link = (e.target as HTMLElement).closest("a");
        if (closeOnClick || link) {
          setOpen(false);
          // A choice made here moves on with the panel, and the row that was
          // clicked goes with it: focus returns to the button the panel hung from.
          // A link is leaving the page, and focus goes with it.
          if (closeOnClick && !link) triggerRef.current?.focus();
        }
      }}
      style={
        portal && anchor
          ? {
              top: anchor.top,
              bottom: anchor.bottom,
              [align === "right" ? "right" : "left"]: anchor.edge,
            }
          : undefined
      }
      className={`z-50 rounded-panel border border-hairline bg-surface shadow-overlay outline-none [&[hidden]]:hidden ${
        portal
          ? "fixed"
          : `absolute top-full mt-2 ${align === "right" ? "right-0" : "left-0"}`
      } ${panelClassName}`}
    >
      {children}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        // Focus moving into the panel — which, portalled, is outside this wrapper
        // in the DOM although inside it in the React tree — is not leaving.
        if (next && (e.currentTarget.contains(next) || panelRef.current?.contains(next))) {
          return;
        }
        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
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

      <NavDropdownContext.Provider value={context}>
        {portal
          ? isClient && (open || keepMounted)
            ? createPortal(panel, document.body)
            : null
          : (open || keepMounted) && panel}
      </NavDropdownContext.Provider>
    </div>
  );
}
