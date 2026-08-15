"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";

export function CopyButton({
  value,
  compact = false,
}: {
  value: string;
  /** Icon-only, fixed 32x32 — for tight table cells where a label would push
   * the column wide. Label goes to `aria-label`/`title` instead. */
  compact?: boolean;
}) {
  const dict = useDict();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }

  const label = copied ? dict.common.tagCopied : dict.common.copyTag;

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        title={label}
        className={buttonClass("secondary", "w-8 shrink-0 justify-center px-0")}
      >
        {copied ? (
          <Check size={18} absoluteStrokeWidth aria-hidden />
        ) : (
          <Copy size={18} absoluteStrokeWidth aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button type="button" onClick={copy} className={buttonClass("secondary")}>
      {/* Both labels are stacked in the same grid cell so the button's
          width is always the wider of the two — swapping "Copy tag" for
          "Tag copied" never resizes the button (or the column it sits in). */}
      <span className="inline-grid">
        <span
          className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${
            copied ? "invisible" : ""
          }`}
        >
          <Copy size={14} aria-hidden />
          {dict.common.copyTag}
        </span>
        <span
          className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${
            copied ? "" : "invisible"
          }`}
        >
          <Check size={14} aria-hidden />
          {dict.common.tagCopied}
        </span>
      </span>
    </button>
  );
}
