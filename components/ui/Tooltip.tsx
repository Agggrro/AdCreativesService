"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

/**
 * Help tooltip (docs/design-system.md §6, "Help tooltip").
 *
 * Explanation an expert does not need, kept behind a trigger instead of set as a
 * paragraph under the control. The VAST validator forced this: every setting
 * carried two or three lines of `fg-muted` prose, and the form became something
 * to read past rather than operate. An expert tool earns the right to be terse —
 * it does not earn the right to be unexplained.
 *
 * **The label is the trigger, and that is not a detail.** A bare `?` button would
 * be an icon-only control, which §9 forbids without qualification — and
 * ADR-0007 records four iterations of trying to carve an exception out of that
 * rule, each one narrowing the exception instead of questioning it, before
 * retracting it entirely. Rather than reopen that argument, the whole label
 * ("Tracking pixels ?") is one button: the word is visible, it *is* the
 * accessible name, and the icon accompanies it exactly as §9 requires. The side
 * benefit is the one a 14px glyph could never have — a touch target the size of
 * the label.
 *
 * Two other things here are requirements rather than polish:
 *
 * 1. **It opens on hover, on keyboard focus, and on click** — all three, never
 *    hover alone. Hover does not exist on a touch device, and once the inline
 *    paragraph is deleted this panel holds the only copy of that sentence.
 * 2. **It is portalled to `<body>`.** These triggers sit inside table headers and
 *    grid cells, which is exactly the inheritance hazard the portal rule exists
 *    for: `position: fixed` leaves the node in the DOM tree, so a `<th>`'s
 *    `white-space: nowrap` would still reach it — as one measurably does.
 */

/** Offset from the trigger, and the minimum inset from the viewport edge. */
const GAP = 8;
const EDGE = 8;

/**
 * Grace period between leaving the trigger and the panel closing.
 *
 * Without it the panel is unreadable by mouse: crossing the gap to reach the
 * text counts as leaving the trigger, so the thing being reached for disappears.
 */
const CLOSE_DELAY_MS = 120;

export function HelpLabel({
  label,
  help,
  className = "label-instr",
}: {
  label: string;
  help: React.ReactNode;
  /** Type role for the visible word — a field legend by default, a heading where it is one. */
  className?: string;
}) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  /**
   * Whether the tooltip was opened deliberately (click or keyboard focus) rather
   * than by the pointer passing over it. A pinned tooltip ignores pointer exit
   * entirely; an unpinned one closes after the grace period above.
   */
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setOpen(false);
    setPinned(false);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [pinned, cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  // Placed in a layout effect, from the real rects: the panel wraps to its
  // content, so its height is not knowable before it exists. Running before
  // paint is what keeps the correction invisible — a stale position from a
  // previous open is overwritten in the same commit.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const anchor = trigger.getBoundingClientRect();
      const box = panel.getBoundingClientRect();

      // Below by default; above when the space below cannot hold it.
      const below = anchor.bottom + GAP;
      const top =
        below + box.height > window.innerHeight - EDGE && anchor.top - GAP - box.height > EDGE
          ? anchor.top - GAP - box.height
          : below;

      const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - box.width - EDGE));
      setPosition({ top, left });
    };
    place();

    // `true` so a scroll inside any ancestor container repositions it, not just
    // one on the document.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // No `aria-label`: the visible word inside is the accessible name, which
        // is the whole point of making the label the trigger. `role="tooltip"`
        // plus `aria-describedby` is the association; `aria-expanded` belongs to
        // expandable widgets, which a tooltip is not.
        aria-describedby={open ? panelId : undefined}
        // Vertical padding pulled back out by a negative margin: the target grows
        // to 24px without moving the label off the grid it sits on.
        className="group -my-1 inline-flex items-center gap-1 rounded-ctl py-1 text-left"
        onClick={() => {
          if (pinned) {
            close();
            return;
          }
          cancelClose();
          setOpen(true);
          setPinned(true);
        }}
        onPointerEnter={(event) => {
          // Touch raises pointerenter immediately before click; letting it open
          // here would make the click that follows read as a toggle-off.
          if (event.pointerType === "touch") return;
          cancelClose();
          setOpen(true);
        }}
        onPointerLeave={scheduleClose}
        onFocus={(event) => {
          // Only a keyboard arrival pins. A click also focuses, and its own
          // handler has already decided what the state should be.
          if (event.target.matches(":focus-visible")) {
            cancelClose();
            setOpen(true);
            setPinned(true);
          }
        }}
        onBlur={() => {
          if (pinned) close();
        }}
      >
        <span className={className}>{label}</span>
        <CircleHelp
          aria-hidden
          className="size-3.5 shrink-0 text-fg-muted transition-colors duration-[120ms] group-hover:text-fg-secondary"
        />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="tooltip"
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              // Hidden until measured, so the panel never flashes at 0,0 on open.
              visibility: position ? "visible" : "hidden",
            }}
            className="fixed z-50 max-w-[44ch] rounded-ctl border border-hairline bg-surface px-3 py-2 text-[13px] leading-5 text-fg-secondary shadow-overlay"
            onPointerEnter={cancelClose}
            onPointerLeave={scheduleClose}
          >
            {help}
          </div>,
          document.body,
        )}
    </>
  );
}
