"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/dictionaries";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persists the UI language chosen in the top bar. Written server-side so the
 * landing page and the dashboard always render in the same language on the
 * very next request (docs/design-system.md §8).
 */
export async function setLocale(locale: Locale) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}
