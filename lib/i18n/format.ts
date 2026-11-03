import { LOCALE_TAG, type Locale } from "@/lib/i18n/dictionaries";

/**
 * The one date treatment the dashboard uses — `6 июл. 2026 г.` / `Jul 6, 2026`.
 * It had been typed out at three call sites (a creative's created-at, the
 * accounts list, the access page) before this existed; one definition keeps the
 * month form and the year from drifting between them.
 */
export function formatDate(locale: Locale, iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE_TAG[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
