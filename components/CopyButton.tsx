"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass, type ButtonSize } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";

/**
 * `size` exists because this button lives in two densities: a data-table action
 * cell, where §6 mandates `sm` and anything taller pushes the row past its 44px,
 * and a detail-page panel, where the default applies.
 */
export function CopyButton({
  value,
  size = "md",
}: {
  value: string;
  size?: ButtonSize;
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

  return (
    <button type="button" onClick={copy} className={buttonClass("secondary", size)}>
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
