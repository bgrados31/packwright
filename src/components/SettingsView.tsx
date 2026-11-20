import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, FolderOpen, Info, Moon, Sun } from "lucide-react";
import { LOCALES, useI18n, type TranslationKey } from "../i18n";
import { LOADERS, type AppConfig } from "../lib/types";
import LauncherPicker from "./LauncherPicker";
import Select from "./Select";

type Props = {
  config: AppConfig;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  packwizFound: boolean;
  onSave: (next: AppConfig) => void;
  onCancel: () => void;
};

type SectionProps = {
  index: string;
  title: string;
  children: React.ReactNode;
};

function Section({ index, title, children }: SectionProps) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-6 w-6 place-items-center rounded bg-accent-soft font-mono text-[10px] text-accent">
          {index}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function SettingsView({ config, theme, onThemeChange, packwizFound, onSave, onCancel }: Props) {
  const { t } = useI18n();
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
      if (!path) return;
      if (key === "workspace") patch({ workspace: path });
      else if (key === "packwiz") patch({ packwiz_path: path });
      else patch({ launcher_paths: { ...draft.launcher_paths, [key]: path } });
    } finally {
      setPicking(null);
    }
  };

  const changeLocale = (value: string) => {
    patch({ locale: value });
    // The provider is updated on save to keep the whole app consistent.
  };

  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{t("nav.workspace")}</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight">{t("setup.settingsTitle")}</h1>
      <p className="mt-1 text-sm text-muted">{t("settings.subtitle")}</p>

      <div className="mt-7 flex flex-col gap-4">
        <Section index="01" title={t("settings.appearance")}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted">{t("settings.theme")}</span>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "light" as const, label: t("settings.themeLight"), icon: Sun },
                  { id: "dark" as const, label: t("settings.themeDark"), icon: Moon },
                ]).map((option) => (
                  <button
                    key={option.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      theme === option.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                    onClick={() => onThemeChange(option.id)}
                  >
                    <option.icon size={15} strokeWidth={1.8} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-muted">{t("setup.language")}</span>
              <Select
                value={draft.locale || "en"}
                onChange={changeLocale}
                options={LOCALES.map((item) => ({ value: item.id, label: `${item.flag}  ${t(item.label as TranslationKey)}` }))}
              />
            </div>
          </div>
        </Section>

        <Section index="02" title={t("settings.workspace")}>
          <p className="mb-3 text-[13px] leading-5 text-muted">{t("setup.workspaceBody")}</p>
          <div className="flex gap-2">
            <input
              className="field font-mono text-xs"
              value={draft.workspace}
              onChange={(event) => patch({ workspace: event.target.value })}
              spellCheck={false}
            />
            <button className="btn btn-secondary shrink-0" onClick={() => void pickFolder("workspace")} disabled={picking !== null}>
              {picking === "workspace" ? "…" : t("setup.browse")}
            </button>
            <button
              className="btn btn-secondary shrink-0 px-3"
              title={t("settings.openFolder")}
              onClick={() => void invoke("open_path", { path: draft.workspace })}
            >
              <FolderOpen size={15} />
            </button>
          </div>
        </Section>

        <Section index="03" title={t("settings.packwiz")}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${packwizFound ? "bg-ok" : "bg-bad"}`} />
            <span className="text-xs text-muted">{packwizFound ? t("workspace.ready") : t("workspace.notReady")}</span>
          </div>
          <div className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("settings.packwizPath")}</span>
            <div className="flex gap-2">
              <input
                className="field font-mono text-xs"
                value={draft.packwiz_path ?? ""}
                onChange={(event) => patch({ packwiz_path: event.target.value || null })}
                placeholder="Auto"
                spellCheck={false}
              />
              <button className="btn btn-secondary shrink-0" onClick={() => void pickFolder("packwiz")} disabled={picking !== null}>
                {picking === "packwiz" ? "…" : t("setup.browse")}
              </button>
            </div>
          </div>
        </Section>

        <Section index="04" title={t("settings.launchers")}>
          <p className="mb-4 text-[13px] leading-5 text-muted">{t("setup.launcherBody")}</p>
          <LauncherPicker
            launchers={draft.launchers}
            paths={draft.launcher_paths}
            defaults={defaults}
            onChange={(launchers, paths) => patch({ launchers, launcher_paths: paths })}
            onBrowse={(key) => void pickFolder(key)}
            picking={picking}
          />
        </Section>

        <Section index="05" title={t("settings.advanced")}>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("settings.servePort")}</span>
              <input
                className="field font-mono text-xs"
                type="number"
                value={draft.serve_port}
                onChange={(event) => patch({ serve_port: Number(event.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("setup.defaultLoader")}</span>
              <Select
                value={draft.default_loader || "neoforge"}
                onChange={(value) => patch({ default_loader: value })}
                options={LOADERS.map((loader) => ({ value: loader, label: loader }))}
              />
            </div>
          </div>
        </Section>

        <Section index="06" title={t("settings.about")}>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Info size={16} strokeWidth={1.8} />
            <span>{t("app.name")} · 0.1.0</span>
          </div>
        </Section>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-secondary" onClick={onCancel}>{t("common.close")}</button>
        <button className="btn btn-primary" onClick={() => onSave(draft)}>
          <Check size={15} />
          {t("settings.save")}
        </button>
      </div>
    </div>
  );
}
