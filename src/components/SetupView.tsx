import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n, type Locale } from "../i18n";
import { LOADERS, type AppConfig } from "../lib/types";
import Select from "./Select";

type Props = {
  config: AppConfig;
  isSetup: boolean;
  onSave: (next: AppConfig) => void;
  onCancel?: () => void;
  onLocaleChange: (locale: Locale) => void;
};

const LAUNCHERS = [
  { value: "atlauncher", labelKey: "launcher.atlauncher" as const },
  { value: "prism", labelKey: "launcher.prism" as const },
  { value: "modrinth", labelKey: "launcher.modrinth" as const },
  { value: "multimc", labelKey: "launcher.multimc" as const },
  { value: "none", labelKey: "launcher.none" as const },
];

export default function SetupView({ config, isSetup, onSave, onCancel, onLocaleChange }: Props) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState<AppConfig>(config);
  const [picking, setPicking] = useState<"workspace" | "launcher" | null>(null);

  const patch = (values: Partial<AppConfig>) => setDraft((current) => ({ ...current, ...values }));

  const pickFolder = async (target: "workspace" | "launcher") => {
    setPicking(target);
    try {
      const path = await invoke<string | null>("pick_folder");
      if (path) patch(target === "workspace" ? { workspace: path } : { atlauncher_path: path });
    } finally {
      setPicking(null);
    }
  };

  const changeLocale = (next: Locale) => {
    patch({ locale: next });
    onLocaleChange(next);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <img src="/packwright-mark.png" alt="" className="mx-auto h-12 w-12" />
        <h1 className="mt-5 text-[28px] font-semibold tracking-tight">{t(isSetup ? "setup.title" : "setup.settingsTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          {t(isSetup ? "setup.subtitle" : "setup.note")}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <section className="card view-enter p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded bg-accent-soft font-mono text-[10px] text-accent">01</span>
            <h2 className="text-sm font-semibold">{t("setup.workspaceTitle")}</h2>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted">{t("setup.workspaceBody")}</p>
          <div className="mt-4 flex gap-2">
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
          {isSetup && (
            <button className="mt-2 text-[11px] text-muted hover:text-ink" onClick={() => patch({ workspace: config.workspace })}>
              {t("setup.useDefault")}
            </button>
          )}
        </section>

        <section className="card view-enter p-6" style={{ animationDelay: "70ms" }}>
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded bg-accent-soft font-mono text-[10px] text-accent">02</span>
            <h2 className="text-sm font-semibold">{t("setup.launcherTitle")}</h2>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted">{t("setup.launcherBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {LAUNCHERS.map((item) => {
              const active = draft.launcher === item.value;
              return (
                <button
                  key={item.value}
                  className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-surface text-muted hover:text-ink"
                  }`}
                  onClick={() => patch({ launcher: item.value })}
                >
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>
          {draft.launcher === "atlauncher" && (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted">{t("setup.launcherPath")}</p>
              <div className="flex gap-2">
                <input
                  className="field font-mono text-xs"
                  value={draft.atlauncher_path ?? ""}
                  onChange={(event) => patch({ atlauncher_path: event.target.value })}
                  placeholder="C:\\ATLauncher"
                  spellCheck={false}
                />
                <button className="btn btn-secondary shrink-0" onClick={() => void pickFolder("launcher")} disabled={picking !== null}>
                  {picking === "launcher" ? "…" : t("setup.browse")}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card view-enter p-6" style={{ animationDelay: "140ms" }}>
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded bg-accent-soft font-mono text-[10px] text-accent">03</span>
            <h2 className="text-sm font-semibold">{t("setup.prefsTitle")}</h2>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-muted">{t("setup.prefsBody")}</p>
          <div className="mt-4 grid grid-cols-2 gap-4">
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
              <div className="flex gap-2">
                {(["en", "es"] as const).map((option) => (
                  <button
                    key={option}
                    className={`btn flex-1 ${locale === option ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => changeLocale(option)}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        {onCancel && <button className="btn btn-secondary" onClick={onCancel}>{t("common.close")}</button>}
        <button
          className="btn btn-primary px-6"
          onClick={() => onSave({ ...draft, setup_complete: true })}
          disabled={!draft.workspace.trim()}
        >
          {t(isSetup ? "setup.finish" : "setup.save")}
        </button>
      </div>
    </div>
  );
}
