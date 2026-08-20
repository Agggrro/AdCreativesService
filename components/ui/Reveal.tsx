"use client";

import { useCallback, useState } from "react";

/**
 * Section reveal on scroll (docs/design-system.md §9) — the one implementation.
 *
 * CSS plus `IntersectionObserver`, no animation library: neither reference site
 * this system was measured against ships GSAP or AOS either, and the whole list
 * of motion this product needs fits in a transition.
 *
 * The element animates `opacity` and `transform` only, so nothing reflows and
 * nothing shifts under a reader's cursor after first paint.
 *
 * Reduced motion is handled in `globals.css`, and handled the safe way round: the
 * `.reveal` class renders in its FINAL state there rather than staying at
 * `opacity: 0` with its transition suppressed. An element hidden because its
 * animation was disabled is invisible content — a worse bug than the animation.
 *
 * The wiring is a **callback ref**, not an effect. It needs the node the moment
 * it exists, and deciding visibility from it is a reaction to mounting rather
 * than a subscription to be synchronised — which is also why setting state here
 * is correct where doing it in an effect body is not.
 */
export function Reveal({
  /** Stagger between siblings — §9 puts it at 60–80ms. */
  delay = 0,
  as: Tag = "div",
  className = "",
  children,
}: {
  delay?: number;
  as?: "div" | "section" | "li";
  className?: string;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);

  const attach = useCallback((el: HTMLElement | null) => {
    if (!el || shownOnce(el)) return;

    /*
     * Fail open, in three ways, because the failure mode here is invisible
     * content and that is worse than a missed animation.
     *
     * 1. No `IntersectionObserver` at all — show immediately.
     * 2. Already within the viewport at mount (above the fold): decided from
     *    `getBoundingClientRect`, which is geometry and does not need the page
     *    to have painted. An observer only reports once the compositor has run,
     *    and there are real environments where it never does.
     * 3. A backstop timer, for anything the first two miss.
     */
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        io.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);

    const backstop = window.setTimeout(() => {
      setShown(true);
      io.disconnect();
    }, 2000);

    // React 19 runs a ref callback's return value as its cleanup.
    return () => {
      window.clearTimeout(backstop);
      io.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={attach as React.Ref<never>}
      data-shown={shown ? "true" : "false"}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${className}`}
    >
      {children}
    </Tag>
  );
}

/** Already revealed — a re-attach (a re-render, a moved node) must not re-arm it. */
function shownOnce(el: HTMLElement) {
  return el.getAttribute("data-shown") === "true";
}
