"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { Segmented } from "@/components/ui/Segmented";
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
    <Segmented
      label={dict.nav.language}
      value={locale}
      onChange={choose}
      options={LOCALES.map((code) => ({ value: code, label: code }))}
    />
  );
}
