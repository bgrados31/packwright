import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** English is the source of truth for all UI strings. */
const en = {
  "app.name": "Packwright",
  "nav.newPack": "New modpack",
  "nav.toggleTheme": "Toggle theme",

  "first.title": "Create your first modpack",
  "first.subtitle": "Organize your mods, pick a Minecraft version and export a pack ready for your launcher.",
  "first.local": "Stored locally · {path}",

  "form.name": "Name",
  "form.namePlaceholder": "My modpack",
  "form.author": "Author",
  "form.authorPlaceholder": "Optional",
  "form.minecraft": "Minecraft",
  "form.loader": "Loader",
  "form.version": "Version",
  "form.loaderVersion": "Loader version",
  "form.loaderAuto": "Automatic (recommended)",
  "form.description": "Description",
  "form.descriptionPlaceholder": "Optional",
  "form.more": "More options",
  "form.latest": "latest",
  "form.unstable": "unstable",
  "form.submit": "Create modpack",
  "form.creating": "Creating…",
  "form.packwizMissing": "Packwiz was not found. Install it or set its path in settings.",
  "form.autoHint": "Version lists update automatically when you change the loader or Minecraft version.",

  "packs.title": "Your modpacks",
  "packs.count": "{count} packs",
  "packs.countOne": "{count} pack",
  "packs.emptyTitle": "Your workspace is empty",
  "packs.emptySubtitle": "Create your first pack with the form on the left.",
  "packs.open": "Open",
  "packs.folder": "Open folder",
  "packs.noDescription": "No description",
  "packs.modCount": "{count} mods",

  "editor.back": "All packs",
  "editor.files": "Files",
  "editor.details": "Details",
  "editor.save": "Save",
  "editor.history": "History",
  "editor.saveDetails": "Save details",
  "editor.unsaved": "Unsaved",
  "editor.noErrors": "No errors",
  "editor.errors": "{count} error(s)",
  "editor.previousVersions": "Previous versions",
  "editor.noPrevious": "No previous versions",
  "editor.loading": "Loading editor…",

  "details.title": "Pack details",
  "details.subtitle": "This information appears when sharing or publishing the pack.",
  "details.summary": "Summary",
  "details.summaryPlaceholder": "A short sentence describing your pack",
  "details.license": "License",
  "details.categories": "Categories",
  "details.categoriesPlaceholder": "Adventure, Performance",
  "details.website": "Website",
  "details.source": "Source code",
  "details.useIcon": "Use Packwright icon",
  "details.generateReadme": "Generate README",
  "details.preview": "Preview",
  "details.noSummary": "No summary yet",
  "details.iconReady": "Icon: configured",
  "details.iconMissing": "Icon: missing",

  "output.title": "Packwiz output",
  "output.clear": "Clear",
  "output.empty": "Waiting for operations…",

  "common.close": "Close",
  "common.error": "Error",
} as const;

export type TranslationKey = keyof typeof en;
export type Locale = "en" | "es";

/** Add Spanish translations here when needed; missing keys fall back to English. */
const es: Partial<Record<TranslationKey, string>> = {};

const dictionaries: Record<Locale, Partial<Record<TranslationKey, string>>> = { en, es };

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

  const value = useMemo<I18nValue>(() => {
    const dictionary = dictionaries[locale];
    return {
      locale,
      setLocale(next) {
        localStorage.setItem("packwright-locale", next);
        setLocale(next);
      },
      t(key, params) {
        return interpolate(dictionary[key] ?? en[key], params);
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
