"use client";

import { createContext, useContext } from "react";
import type { Dict, Locale } from "@/lib/i18n/dictionaries";

type LocaleValue = { locale: Locale; dict: Dict };

const LocaleContext = createContext<LocaleValue | null>(null);

/**
 * Carries the active locale's copy to client components. The dictionary is
 * small enough to serialize once in the root layout, which keeps client
 * components from importing both locales into the bundle themselves.
 */
export function LocaleProvider({
  value,
  children,
}: {
  value: LocaleValue;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return value;
}

export function useDict(): Dict {
  return useLocale().dict;
}
