import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LEGACY_LOCALE_COOKIE,
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
 *
 * The legacy cookie is consulted only when the current one is missing, so a
 * visitor who chose their language before the rename keeps it. See
 * `LEGACY_LOCALE_COOKIE` for when this second read can go.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const value =
    jar.get(LOCALE_COOKIE)?.value ?? jar.get(LEGACY_LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getDict(): Promise<{ locale: Locale; dict: Dict }> {
  const locale = await getLocale();
  return { locale, dict: dictionaries[locale] };
}
