import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import { Check, Download, FolderOpen, Info, Moon, RotateCw, Sun, TriangleAlert, WandSparkles } from "lucide-react";
import { LOCALES, useI18n, type TranslationKey } from "../i18n";
import { LOADERS, type AppConfig, type JavaInfo, type LauncherInfo, type PackwizStatus } from "../lib/types";
import { fireAndForget } from "../lib/error";
import Flag from "./Flag";
import LauncherPicker from "./LauncherPicker";
import PackwizReinstallModal from "./PackwizReinstallModal";
import Select from "./Select";
import UpdatePanel from "./UpdatePanel";
import { Checkbox } from "./ui";

type Props = {
  config: AppConfig;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  packwizFound: boolean;
  onSave: (next: AppConfig) => void;
  onPackwizInstalled: (status: PackwizStatus) => void;
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

function SecretField({
  label,
  hint,
  value,
  configured,
  onChange,
  onClear,
}: {
  label: string;
  hint?: string;
  value: string;
  configured: boolean;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex gap-2">
        <input
          className="field font-mono text-xs"
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={configured ? t("settings.secretConfigured") : "••••••••"}
          autoComplete="new-password"
          spellCheck={false}
        />
        {configured && (
          <button className="btn btn-secondary shrink-0" onClick={onClear} title={t("settings.secretClear")}>
            {t("settings.secretClear")}
          </button>
        )}
      </div>
      {hint && <span className="text-[10px] text-muted">{hint}</span>}
    </div>
  );
}

export default function SettingsView({ config, theme, onThemeChange, packwizFound, onSave, onPackwizInstalled }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<AppConfig>(config);
  const [defaults, setDefaults] = useState<Record<string, string>>(config.launcher_paths ?? {});
  const [detected, setDetected] = useState<LauncherInfo[]>([]);
  const [picking, setPicking] = useState<string | null>(null);
  const [showReinstall, setShowReinstall] = useState(false);
  const [javaInfo, setJavaInfo] = useState<JavaInfo | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    invoke<Record<string, string>>("launcher_defaults")
      .then((paths) => setDefaults((current) => ({ ...paths, ...current })))
      .catch(() => undefined);

    invoke<LauncherInfo[]>("launcher_detect")
      .then((items) => {
        setDetected(items);
        const found = items.filter((item) => item.found);
        if (found.length === 0 || config.launchers.length > 0 || config.preferred_launcher) return;
        const best = found.find((item) => item.integration === "full") ?? found[0];
        setDraft((current) => ({
          ...current,
          launchers: found.map((item) => item.key),
          preferred_launcher: best.key,
        }));
      })
      .catch(() => undefined);
  }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const patch = (values: Partial<AppConfig>) => setDraft((current) => ({ ...current, ...values }));

  const pickFolder = async (key: string) => {
    setPicking(key);
    try {
      const path = await invoke<string | null>("pick_folder");
      if (!path) return;
      if (key === "workspace") patch({ workspace: path });
      else if (key === "packwiz") patch({ packwiz_path: path });
      else patch({ launcher_paths: { ...draft.launcher_paths, [key]: path } });
    } catch {
      // El usuario canceló el diálogo o falló la lectura; no hay nada que guardar.
    } finally {
      setPicking(null);
    }
  };

  const detectJava = () => {
    invoke<JavaInfo>("java_detect")
      .then((info) => {
        setJavaInfo(info);
        if (info.found) patch({ java_path: info.path });
      })
      .catch(() => undefined);
  };

  const pickJava = () => {
    fireAndForget(invoke<string | null>("pick_file").then((path) => {
      if (path) patch({ java_path: path });
    }));
  };

  const clearSecret = (kind: "modrinth_token" | "curseforge_api_key") => {
    fireAndForget(invoke("config_clear_secret", { kind }).then(() => onSave(draft)));
  };

  const changeLocale = (value: string) => {
    if (value === "en" || value === "es") patch({ locale: value });
  };

  return (
    <div className={`mx-auto max-w-3xl ${dirty ? "pb-24" : ""}`}>
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
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
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
                options={LOCALES.map((item) => ({
                  value: item.id,
                  label: t(item.label as TranslationKey),
                  icon: <Flag code={item.code} />,
                }))}
              />
            </div>
          </div>
        </Section>

        <Section index="U" title={t("settings.updates")}>
          <UpdatePanel />
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
              onClick={() => fireAndForget(invoke("open_path", { path: draft.workspace }))}
            >
              <FolderOpen size={15} />
            </button>
          </div>
        </Section>

        <Section index="03" title={t("settings.packwiz")}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${packwizFound ? "bg-ok" : "bg-bad"}`} />
              <span className="text-xs text-muted">{packwizFound ? t("workspace.ready") : t("workspace.notReady")}</span>
            </div>
            {packwizFound && (
              <button className="btn btn-quiet text-[11px]" onClick={() => setShowReinstall(true)}>
                <RotateCw size={12} /> {t("settings.reinstall")}
              </button>
            )}
          </div>

          {!packwizFound && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bad/25 bg-bad/5 px-4 py-3">
              <div className="flex items-start gap-2 text-[12px] leading-5 text-bad">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                <span>{t("settings.packwizMissingHint")}</span>
              </div>
              <button className="btn btn-primary shrink-0" onClick={() => setShowReinstall(true)}>
                <Download size={14} /> {t("settings.reinstall")}
              </button>
            </div>
          )}

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

        <Section index="J" title={t("settings.java")}>
          <p className="mb-3 text-[13px] leading-5 text-muted">{t("settings.javaHint")}</p>
          <div className="flex gap-2">
            <input
              className="field font-mono text-xs"
              value={draft.java_path ?? ""}
              onChange={(event) => patch({ java_path: event.target.value || null })}
              placeholder="Auto"
              spellCheck={false}
            />
            <button className="btn btn-secondary shrink-0" onClick={() => void pickJava()}>{t("setup.browse")}</button>
            <button className="btn btn-secondary shrink-0 px-3" onClick={detectJava} title={t("settings.javaAuto")}><WandSparkles size={14} /></button>
          </div>
          {javaInfo && (
            <p className={`mt-2 text-[11px] ${javaInfo.found ? "text-muted" : "text-bad"}`}>
              {javaInfo.found
                ? `${t("settings.javaDetected")} Java ${javaInfo.major}: ${javaInfo.path}`
                : t("servers.javaMissing")}
            </p>
          )}
        </Section>

        <Section index="04" title={t("settings.launchers")}>
          <p className="mb-4 text-[13px] leading-5 text-muted">{t("setup.launcherBody")}</p>
          <LauncherPicker
            launchers={draft.launchers}
            paths={draft.launcher_paths}
            defaults={defaults}
            detected={detected}
            preferred={draft.preferred_launcher}
            onChange={(launchers, paths) => patch({ launchers, launcher_paths: paths })}
            onPreferred={(key) => patch({ preferred_launcher: key })}
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
          <div className="mt-4 border-t border-line pt-4">
            <Checkbox
              checked={draft.debug_console}
              onChange={(checked) => patch({ debug_console: checked })}
              label={t("settings.debugConsole")}
            />
            <p className="mt-1.5 pl-7 text-[11px] text-muted">{t("settings.debugConsoleHint")}</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <SecretField
              label={t("settings.modrinthToken")}
              value={draft.modrinth_token ?? ""}
              configured={draft.has_modrinth_token}
              onChange={(value) => patch({ modrinth_token: value })}
              onClear={() => clearSecret("modrinth_token")}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("settings.modrinthProject")}</span>
              <input
                className="field font-mono text-xs"
                value={draft.modrinth_project_id ?? ""}
                onChange={(event) => patch({ modrinth_project_id: event.target.value })}
                placeholder="Project ID"
                spellCheck={false}
              />
            </div>
            <div className="col-span-2">
              <SecretField
                label={t("settings.curseforgeKey")}
                hint={t("settings.curseforgeKeyHint")}
                value={draft.curseforge_api_key ?? ""}
                configured={draft.has_curseforge_api_key}
                onChange={(value) => patch({ curseforge_api_key: value })}
                onClear={() => clearSecret("curseforge_api_key")}
              />
            </div>
            <p className="col-span-2 text-[10px] text-muted">{t("settings.secretNote")}</p>
          </div>
        </Section>

        <Section index="06" title={t("settings.about")}>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Info size={16} strokeWidth={1.8} />
            <span>{t("app.name")} · 0.1.0</span>
          </div>
        </Section>
      </div>

      {dirty &&
        createPortal(
          <div className="save-bar">
            <div className="save-bar-inner">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="save-bar-dot" />
                <span>{t("settings.unsaved")}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-secondary" onClick={() => setDraft(config)}>
                  {t("settings.discard")}
                </button>
                <button className="btn btn-primary" onClick={() => onSave(draft)}>
                  <Check size={15} />
                  {t("settings.save")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showReinstall &&
        createPortal(
          <PackwizReinstallModal
            onClose={() => setShowReinstall(false)}
            onInstalled={(status) => {
              onPackwizInstalled(status);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
