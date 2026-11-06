import Link from "next/link";
import type { Dict } from "@/lib/i18n/dictionaries";
import { BrandMark } from "@/components/ui/BrandMark";

/**
 * The lockup: the monogram and the wordmark beside it, one object
 * (docs/design-system.md §6, "Top bar"; §3 exempts it from the accent budget). It
 * never shrinks to the monogram alone — below the floor the mark takes the C, but a
 * bar's lockup is whole at every width — and it is named by its label, not by a
 * glyph and a word.
 *
 * Shared by the product bar and the tools' bar. The wordmark's 16px/600 is a
 * literal because it is the brand's size, and it is allowed only here, inside the
 * one primitive that owns it (§11); a second copy in a second bar is how the two
 * would drift.
 */
export function BrandLockup({
  dict,
  href,
  className = "",
}: {
  dict: Dict;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      // Named explicitly because the wordmark is split across two elements for
      // colour: the accessible name would otherwise be assembled from nested nodes,
      // and the a11y tree already reports them as separate generics. One label, in
      // the right order, regardless.
      aria-label={`${dict.brand.nameLead}${dict.brand.nameTail}`}
      className={`flex shrink-0 items-center gap-2.5 rounded-ctl ${className}`}
    >
      <BrandMark />
      {/*
        Two-toned to match the monogram: Creo takes the accent like the C, Smith the
        fg like the S, so the mark and the word are visibly the same object rather
        than a glyph with a caption. Split in the dictionary rather than sliced here
        — §10 forbids a human-readable literal in a component, even one this small.
      */}
      <span className="text-[16px] font-semibold tracking-[-0.01em]">
        <span className="text-accent">{dict.brand.nameLead}</span>
        {dict.brand.nameTail}
      </span>
    </Link>
  );
}
