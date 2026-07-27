import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  dictionaries,
  isLocale,
  type Dict,
  type Locale,
} from "./dictionaries";

/**
 * The active UI locale for a server render, read from the language cookie the
 * top-bar switcher writes. Never reached from the public VAST path — that
 * endpoint has no session and no UI (docs/design-system.md §8).
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getDict(): Promise<{ locale: Locale; dict: Dict }> {
  const locale = await getLocale();
  return { locale, dict: dictionaries[locale] };
}
