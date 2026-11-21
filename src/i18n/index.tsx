import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./en.json";
import es from "./es.json";

export type TranslationKey = keyof typeof en;
export type Locale = "en" | "es";

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, es };

export const LOCALES: Array<{ id: Locale; label: string; code: "gb" | "es" }> = [
  { id: "en", label: "language.english", code: "gb" },
  { id: "es", label: "language.spanish", code: "es" },
];

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ""));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem("packwright-locale");
    return saved === "en" || saved === "es" ? saved : "en";
  });

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const dictionary = dictionaries[locale];
    return {
      locale,
      setLocale(next) {
        localStorage.setItem("packwright-locale", next);
        setLocale(next);
      },
      t(key, params) {
        return interpolate(dictionary[key] ?? en[key] ?? String(key), params);
      },
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
