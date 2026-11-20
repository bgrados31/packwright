import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LOCALES, useI18n, type Locale, type TranslationKey } from "../i18n";
import { LOADERS, type AppConfig } from "../lib/types";
import LauncherPicker, { LAUNCHERS } from "./LauncherPicker";
import Select from "./Select";

type Props = {
  config: AppConfig;
  isSetup: boolean;
  onSave: (next: AppConfig) => void;
  onCancel?: () => void;
  onLocaleChange: (locale: Locale) => void;
};

const STEPS = ["setup.workspaceTitle", "setup.launcherTitle", "setup.prefsTitle", "setup.reviewTitle"] as const;

export default function SetupView({ config, isSetup, onSave, onCancel, onLocaleChange }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AppConfig>(config);
  const [defaults, setDefaults] = useState<Record<string, string>>(config.launcher_paths ?? {});
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    invoke<Record<string, string>>("launcher_defaults")
      .then((paths) => setDefaults((current) => ({ ...paths, ...current })))
      .catch(() => undefined);
  }, []);

  const patch = (values: Partial<AppConfig>) => setDraft((current) => ({ ...current, ...values }));

  const pickFolder = async (key: string) => {
    setPicking(key);
    try {
      const path = await invoke<string | null>("pick_folder");
      if (path) {
        if (key === "workspace") patch({ workspace: path });
        else patch({ launcher_paths: { ...draft.launcher_paths, [key]: path } });
      }
    } finally {
      setPicking(null);
    }
  };

  const changeLocale = (next: Locale) => {
    patch({ locale: next });
    onLocaleChange(next);
  };

  const next = () => setStep((current) => Math.min(current + 1, STEPS.length - 1));
  const back = () => setStep((current) => Math.max(current - 1, 0));

  const canContinue = step === 0 ? Boolean(draft.workspace.trim()) : true;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <img src="/packwright-mark.png" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-5 text-[28px] font-semibold tracking-tight">{t(isSetup ? "setup.title" : "setup.settingsTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          {t(isSetup ? "setup.subtitle" : "setup.note")}
        </p>
      </div>

      <div className="mt-8 flex items-center gap-2">
        {STEPS.map((_, index) => (
          <div key={index} className="flex flex-1 flex-col gap-2">
            <div className={`h-1 rounded-full transition-colors duration-300 ${index <= step ? "bg-accent" : "bg-line"}`} />
            <span className={`font-mono text-[9px] uppercase tracking-wider ${index <= step ? "text-accent" : "text-muted"}`}>
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
        ))}
      </div>

      <div className="card view-enter relative mt-4" key={step}>
        <div className="h-1 w-full rounded-t-xl bg-gradient-to-r from-accent via-accent to-transparent" />
        <div className="pointer-events-none absolute -right-4 -top-6 font-mono text-[110px] font-bold leading-none text-accent/5">
          {String(step + 1).padStart(2, "0")}
        </div>

        <div className="relative h-[420px] overflow-y-auto p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            {t("setup.step", { current: step + 1, total: STEPS.length })}
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">{t(STEPS[step])}</h2>

          {step === 0 && (
            <div className="mt-5">
              <p className="text-[13px] leading-6 text-muted">{t("setup.workspaceBody")}</p>
              <div className="mt-5 flex gap-2">
                <input
                  className="field font-mono text-xs"
                  value={draft.workspace}
                  onChange={(event) => patch({ workspace: event.target.value })}
                  spellCheck={false}
                />
                <button className="btn btn-secondary shrink-0" onClick={() => void pickFolder("workspace")} disabled={picking !== null}>
                  {picking === "workspace" ? "…" : t("setup.browse")}
                </button>
              </div>
              <button className="mt-3 text-[11px] text-muted hover:text-ink" onClick={() => patch({ workspace: config.workspace })}>
                {t("setup.useDefault")}
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="mt-5">
              <p className="text-[13px] leading-6 text-muted">{t("setup.launcherBody")}</p>
              <div className="mt-5">
                <LauncherPicker
                  launchers={draft.launchers}
                  paths={draft.launcher_paths}
                  defaults={defaults}
                  onChange={(launchers, paths) => patch({ launchers, launcher_paths: paths })}
                  onBrowse={(key) => void pickFolder(key)}
                  picking={picking}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-5">
              <p className="text-[13px] leading-6 text-muted">{t("setup.prefsBody")}</p>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("setup.defaultLoader")}</span>
                  <Select
                    value={draft.default_loader || "neoforge"}
                    onChange={(value) => patch({ default_loader: value })}
                    options={LOADERS.map((loader) => ({ value: loader, label: loader }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("setup.language")}</span>
                  <Select
                    value={draft.locale || "en"}
                    onChange={(value) => changeLocale(value as Locale)}
                    options={LOCALES.map((item) => ({ value: item.id, label: `${item.flag}  ${t(item.label as TranslationKey)}` }))}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-5">
              <p className="text-[13px] leading-6 text-muted">{t("setup.reviewBody")}</p>
              <div className="mt-5 divide-y divide-line rounded-xl border border-line">
                {[
                  { label: t("setup.reviewWorkspace"), value: draft.workspace },
                  {
                    label: t("setup.reviewLaunchers"),
                    value: draft.launchers.length
                      ? draft.launchers.map((value) => {
                          const meta = LAUNCHERS.find((item) => item.value === value);
                          return meta ? t(meta.label) : value;
                        }).join(" · ")
                      : t("setup.noneSelected"),
                  },
                  { label: t("setup.reviewLoader"), value: draft.default_loader || "neoforge" },
                  {
                    label: t("setup.reviewLanguage"),
                    value: LOCALES.find((item) => item.id === draft.locale)?.label ?? "language.english",
                  },
                ].map((row) => (
                  <div key={row.label} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-xs text-muted">{row.label}</span>
                    <span className="max-w-full truncate font-mono text-xs">{row.label === t("setup.reviewLanguage") ? t(row.value as TranslationKey) : row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div>
          {step > 0 && <button className="btn btn-secondary" onClick={back}>← {t("setup.back")}</button>}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && <button className="btn btn-quiet" onClick={onCancel}>{t("common.close")}</button>}
          {step < STEPS.length - 1 ? (
            <button className="btn btn-primary px-6" onClick={next} disabled={!canContinue}>
              {t("setup.next")}
            </button>
          ) : (
            <button className="btn btn-primary px-6" onClick={() => onSave({ ...draft, setup_complete: true })}>
              {t(isSetup ? "setup.finish" : "setup.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
