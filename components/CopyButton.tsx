"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";

export function CopyButton({ value }: { value: string }) {
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
    <button type="button" onClick={copy} className={buttonClass("secondary")}>
      {copied ? (
        <Check size={14} aria-hidden />
      ) : (
        <Copy size={14} aria-hidden />
      )}
      {copied ? dict.common.tagCopied : dict.common.copyTag}
    </button>
  );
}
