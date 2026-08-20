"use client";

import { useState } from "react";
import { buttonClass, type ButtonVariant } from "@/components/ui/Button";
import { useDict } from "@/components/i18n/LocaleProvider";

type Props = {
  planKey: "single_weekly" | "single_monthly" | "ultimate_monthly";
  templateId?: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
};

export function SubscribeButton({
  planKey,
  templateId,
  children,
  variant = "secondary",
}: Props) {
  const dict = useDict();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, templateId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? dict.common.checkoutError);
    } catch {
      setError(dict.common.checkoutError);
    }
    setLoading(false);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className={buttonClass(variant)}
      >
        {loading ? dict.common.working : children}
      </button>
      {error && (
        <span role="alert" className="type-caption text-dead">
          {error}
        </span>
      )}
    </span>
  );
}
