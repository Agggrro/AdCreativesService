"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { setLocale } from "@/app/actions/locale";

/**
 * Segmented RU | EN control. Language codes, never flags — a flag denotes a
 * country, not a language (docs/design-system.md §8). The choice is persisted
 * server-side, so the landing page and the dashboard always agree.
 */
export function LanguageSwitcher() {
  const { locale, dict } = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={dict.nav.language}
      className="inline-flex rounded-ctl border border-line bg-surface"
    >
      {LOCALES.map((code) => {
        const current = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            aria-pressed={current}
            className={`border-r border-hairline px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition-colors first:rounded-l-ctl last:rounded-r-ctl last:border-r-0 ${
              current
                ? "bg-fill font-medium text-fg"
                : "text-fg-secondary hover:bg-fill"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
