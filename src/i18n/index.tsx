import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./en.json";
import es from "./es.json";

export type TranslationKey = keyof typeof en;
export type Locale = "en" | "es" | "fr" | "de" | "pt";
type Dictionary = Partial<Record<TranslationKey, string>>;

export const SUPPORTED_LOCALES: Locale[] = ["en", "es", "fr", "de", "pt"];

export function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as string[]).includes(value);
}

export function nextLocale(current: Locale): Locale {
  const index = SUPPORTED_LOCALES.indexOf(current);
  return SUPPORTED_LOCALES[(index + 1) % SUPPORTED_LOCALES.length];
}

// EN/ES viajan en el bundle inicial; el resto se carga solo cuando se elige.
const dictionaries: Partial<Record<Locale, Dictionary>> = { en, es };
const loaders: Record<Locale, () => Promise<{ default: Dictionary }>> = {
  en: async () => ({ default: en }),
  es: async () => ({ default: es }),
  fr: () => import("./fr.json"),
  de: () => import("./de.json"),
  pt: () => import("./pt.json"),
};

export const LOCALES: Array<{ id: Locale; label: string; code: "gb" | "es" | "fr" | "de" | "pt" }> = [
  { id: "en", label: "language.english", code: "gb" },
  { id: "es", label: "language.spanish", code: "es" },
  { id: "fr", label: "language.french", code: "fr" },
  { id: "de", label: "language.german", code: "de" },
  { id: "pt", label: "language.portuguese", code: "pt" },
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
    return saved && isLocale(saved) ? saved : "en";
  });
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (dictionaries[locale]) return;
    let cancelled = false;
    void loaders[locale]()
      .then((module) => {
        if (cancelled) return;
        dictionaries[locale] = module.default;
        setLoaded((value) => value + 1);
      })
      .catch(() => { /* fallback a inglés */ });
    return () => { cancelled = true; };
  }, [locale]);

  const value = useMemo<I18nValue>(() => {
    const dictionary = dictionaries[locale] ?? en;
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
  }, [locale, loaded]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
