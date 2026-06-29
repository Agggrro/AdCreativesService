"use client";

import { useState } from "react";

type Props = {
  planKey: "single_weekly" | "single_monthly" | "ultimate_monthly";
  templateId?: string;
  children: React.ReactNode;
  className?: string;
};

export function SubscribeButton({
  planKey,
  templateId,
  children,
  className,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
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
      alert(data.error ?? "Could not start checkout");
    } catch {
      alert("Could not start checkout");
    }
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={loading}
      className={
        className ??
        "rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      }
    >
      {loading ? "…" : children}
    </button>
  );
}
