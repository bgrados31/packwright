import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

import CreatePackForm from "./components/CreatePackForm";
import WelcomeView from "./components/WelcomeView";
import PackEditor from "./components/PackEditor";
import SetupView from "./components/SetupView";
import Sidebar, { type SidebarView } from "./components/Sidebar";
import PacksView from "./components/PacksView";
import HomeView from "./components/HomeView";
import SettingsView from "./components/SettingsView";
import ExportModal from "./components/ExportModal";
import Toasts, { type Toast } from "./components/Toasts";
import { useI18n, type TranslationKey } from "./i18n";
import {
  type AppConfig,
  type CreatePackInput,
  type Diagnostic,
  type ErrorInfo,
  type FileEntry,
  type HistoryEntry,
  type InstalledMod,
  type LoaderVersion,
  type McVersion,
  type ModHistoryEntry,
  type ModHistoryItem,
  type ModOperation,
  type OpLine,
  type PackInfo,
  type PackMeta,
  type PackwizStatus,
} from "./lib/types";

const emptyForm: CreatePackInput = {
  name: "",
  author: "",
  minecraft_version: "",
  loader: "neoforge",
  loaderVersion: null,
  version: "1.0.0",
  description: "",
};

function errorText(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return (error as ErrorInfo).message;
  }
  return String(error);
}

function toHistoryItem(mod: InstalledMod): ModHistoryItem {
  return { id: mod.id, name: mod.name, version: mod.version_id };
}

export default function App() {
  const { t, setLocale } = useI18n();
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("packwright-theme") as "light" | "dark") || "light",
  );
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [packwiz, setPackwiz] = useState<PackwizStatus | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [form, setForm] = useState<CreatePackInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<string | null>(null);
  const [modsRevision, setModsRevision] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [view, setView] = useState<SidebarView>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("packwright-sidebar") === "collapsed",
  );

  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [metaDirty, setMetaDirty] = useState(false);
  const [hasIcon, setHasIcon] = useState(false);

  const [mcVersions, setMcVersions] = useState<McVersion[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("packwright-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("packwright-sidebar", sidebarCollapsed ? "collapsed" : "expanded");
  }, [sidebarCollapsed]);

  const loadPacks = useCallback(async () => {
    try {
      const [cfg, status, list] = await Promise.all([
        invoke<AppConfig>("config_get"),
        invoke<PackwizStatus>("packwiz_status"),
        invoke<PackInfo[]>("pack_list"),
      ]);
      setConfig(cfg);
      setPackwiz(status);
      setPacks(list);
      setForm((previous) =>
        previous.loader === "neoforge" && cfg.default_loader
          ? { ...previous, loader: cfg.default_loader }
          : previous,
      );
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  const saveConfig = async (next: AppConfig) => {
    try {
      const saved = await invoke<AppConfig>("config_set", { config: next });
      setConfig(saved);
      if (saved.locale === "en" || saved.locale === "es") setLocale(saved.locale);
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  useEffect(() => {
    invoke<McVersion[]>("versions_catalog")
      .then(setMcVersions)
      .catch(() => {
        setMcVersions([]);
        setForm((previous) => previous.minecraft_version ? previous : { ...previous, minecraft_version: "1.21.1" });
      });
  }, []);

  // The newest release from Mojang becomes the default selection.
  useEffect(() => {
    if (mcVersions.length === 0) return;
    setForm((previous) =>
      previous.minecraft_version ? previous : { ...previous, minecraft_version: mcVersions[0].id },
    );
  }, [mcVersions]);

  useEffect(() => {
    if (!form.minecraft_version) return;
    const loaders = mcVersions.find((version) => version.id === form.minecraft_version)?.loaders ?? [];
    if (loaders.length > 0 && !loaders.includes(form.loader)) {
      setForm((previous) => ({ ...previous, loader: loaders[0], loaderVersion: null }));
    }
  }, [form.minecraft_version, form.loader, mcVersions]);

  useEffect(() => {
    const compatible = mcVersions.find((version) => version.id === form.minecraft_version);
    if (!compatible || !compatible.loaders.includes(form.loader)) {
      setLoaderVersions([]);
      return;
    }
    let cancelled = false;
    invoke<LoaderVersion[]>("versions_loader", {
      loader: form.loader,
      mcVersion: form.minecraft_version,
    })
      .then((list) => { if (!cancelled) setLoaderVersions(list); })
      .catch(() => { if (!cancelled) setLoaderVersions([]); });
    return () => { cancelled = true; };
  }, [form.loader, form.minecraft_version, mcVersions]);

  useEffect(() => {
    if (!selectedPack || !activeFile) return;
    const timer = setTimeout(async () => {
      try {
        setDiagnostics(
          await invoke<Diagnostic[]>("file_validate", {
            dir: selectedPack,
            path: activeFile,
            content,
          }),
        );
      } catch {
        // The file may not be indexed yet; ignore transient validation errors.
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [content, activeFile, selectedPack]);

  const createPack = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await invoke<PackInfo>("pack_create", {
        name: form.name,
        author: form.author || "Packwright",
        minecraftVersion: form.minecraft_version,
        loader: form.loader,
        loaderVersion: form.loaderVersion,
        version: form.version,
        description: form.description,
      });
      setForm(emptyForm);
      setView("packs");
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const openPack = async (dir: string) => {
    try {
      const list = await invoke<FileEntry[]>("pack_files", { dir });
      const details = await invoke<PackMeta>("meta_get", { dir });
      setFiles(list);
      setSelectedPack(dir);
      setView("editor");
      setDiagnostics([]);
      setShowHistory(false);
      setMeta(details);
      setMetaDirty(false);
      setHasIcon(
        await invoke<boolean>("pack_has_icon", { dir, path: details.icon || ".packwright/assets/icon.png" }),
      );
      const first = list.find((file) => file.path === "pack.toml") ?? list[0];
      setActiveFile(first?.path ?? null);
      setContent(first ? await invoke<string>("file_read", { dir, path: first.path }) : "");
      setDirty(false);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const openFile = async (path: string) => {
    if (!selectedPack || path === activeFile) return;
    try {
      setActiveFile(path);
      setContent(await invoke<string>("file_read", { dir: selectedPack, path }));
      setDirty(false);
      setDiagnostics([]);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const saveFile = useCallback(async () => {
    if (!selectedPack || !activeFile || !dirty) return;
    try {
      await invoke("file_write", { dir: selectedPack, path: activeFile, content });
      setDirty(false);
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  }, [selectedPack, activeFile, dirty, content, loadPacks]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [saveFile]);

  const loadHistory = async () => {
    if (!selectedPack || !activeFile) return;
    try {
      setHistory(await invoke<HistoryEntry[]>("file_history", { dir: selectedPack, path: activeFile }));
      setShowHistory(true);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const restoreVersion = async (id: string) => {
    if (!selectedPack || !activeFile) return;
    try {
      setContent(await invoke<string>("file_restore", { dir: selectedPack, path: activeFile, id }));
      setDirty(true);
      setShowHistory(false);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const saveDetails = async () => {
    if (!selectedPack || !meta) return;
    try {
      await invoke("meta_set", { dir: selectedPack, meta });
      setMetaDirty(false);
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const useDefaultIcon = async () => {
    if (!selectedPack) return;
    try {
      await invoke("pack_icon_set_default", { dir: selectedPack });
      setMeta((previous) => previous ? { ...previous, icon: ".packwright/assets/icon.png" } : previous);
      setMetaDirty(true);
      setHasIcon(
        await invoke<boolean>("pack_has_icon", { dir: selectedPack, path: ".packwright/assets/icon.png" }),
      );
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const generateReadme = async () => {
    if (!selectedPack) return;
    try {
      await invoke("pack_generate_readme", { dir: selectedPack });
      const list = await invoke<FileEntry[]>("pack_files", { dir: selectedPack });
      setFiles(list);
      const readme = list.find((file) => file.path === "README.md");
      setActiveFile(readme?.path ?? null);
      setContent(readme ? await invoke<string>("file_read", { dir: selectedPack, path: readme.path }) : "");
      setDirty(false);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const reveal = async (dir: string) => {
    try {
      await invoke("pack_reveal", { dir });
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const dismissToast = (id: string) =>
    setToasts((current) => current.filter((item) => item.id !== id));

  const recordModHistory = async (
    operation: ModOperation,
    ok: boolean,
    output: string[],
    main: ModHistoryItem[],
    dependencies: ModHistoryItem[],
  ) => {
    const entry: ModHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      action: operation.kind,
      ok,
      main,
      dependencies,
      output: output.slice(-40),
    };
    try {
      await invoke("mods_history_record", { dir: operation.dir, entry });
    } catch {
      // El historial es best-effort.
    }
  };

  const runModOperation = async (operation: ModOperation) => {
    const id = `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = operation.modName ?? t("mods.title");
    const lines: string[] = [];
    let stage = "prepare";
    const actionKey = (kind: ModOperation["kind"]): TranslationKey => {
      switch (kind) {
        case "add": return "mods.action.add";
        case "remove": return "mods.action.remove";
        case "pin": return "mods.action.pin";
        case "unpin": return "mods.action.unpin";
        case "update": return "mods.action.update";
        case "refresh": return "mods.action.refresh";
      }
    };
    const label = () => {
      const running = operation.kind === "add" && stage !== "prepare"
        ? { prepare: t("mods.stagePreparing"), download: t("mods.stageDownloading"), deps: t("mods.stageDependencies"), adding: t("mods.stageAdding") }[stage] ?? t("mods.stagePreparing")
        : t(actionKey(operation.kind));
      return `${name} · ${running}`;
    };
    const successTitle = () => {
      switch (operation.kind) {
        case "add": return t("mods.toastSuccess", { name });
        case "remove": return t("mods.toastRemoved", { name });
        case "pin": return t("mods.toastPinned", { name });
        case "unpin": return t("mods.toastUnpinned", { name });
        case "update": return t("mods.toastUpdated", { name });
        case "refresh": return t("mods.toastRefreshed");
      }
    };

    setToasts((current) => [...current, { id, title: label(), state: "running" }]);

    let unlisten: (() => void) | undefined;
    const ready = listen<OpLine>("operation://line", (event) => {
      if (event.payload.id !== id) return;
      lines.push(event.payload.line);
      if (operation.kind === "add") {
        const text = lines.join(" ").toLowerCase();
        stage = text.includes("dependenc")
          ? "deps"
          : text.includes("download") || text.includes("retriev")
            ? "download"
            : text.includes("success") || text.includes("added")
              ? "adding"
              : stage;
      }
      setToasts((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, title: label(), detail: lines[lines.length - 1]?.slice(0, 72) }
            : item,
        ),
      );
    }).then((fn) => { unlisten = fn; });

    const before = await invoke<InstalledMod[]>("mods_list", { dir: operation.dir }).catch(() => [] as InstalledMod[]);
    const beforeIds = new Set(before.map((mod) => mod.id));

    try {
      await ready;
      const call = operation.kind === "add"
        ? invoke("mods_add", {
            dir: operation.dir,
            projectId: operation.projectId,
            versionId: operation.versionId,
            id,
          })
        : operation.names
          ? invoke("mods_command_bulk", {
              dir: operation.dir,
              action: operation.kind,
              names: operation.names,
              id,
            })
          : invoke("mods_command", {
              dir: operation.dir,
              action: operation.kind,
              name: operation.name,
              id,
            });
      await call;

      let main: ModHistoryItem[] = [];
      let dependencies: ModHistoryItem[] = [];
      if (operation.kind === "add") {
        const after = await invoke<InstalledMod[]>("mods_list", { dir: operation.dir }).catch(() => before);
        const added = after.filter((mod) => !beforeIds.has(mod.id));
        main = added.filter((mod) => mod.project_id === operation.projectId).map(toHistoryItem);
        dependencies = added.filter((mod) => mod.project_id !== operation.projectId).map(toHistoryItem);
        if (main.length === 0 && added.length > 0) main.push(toHistoryItem(added[0]));
      } else {
        main = (operation.names ?? (operation.name ? [operation.name] : [])).map((item) => ({
          id: item,
          name,
          version: null,
        }));
      }
      await recordModHistory(operation, true, lines, main, dependencies);
      setToasts((current) =>
        current.map((item) =>
          item.id === id
            ? {
                id,
                title: successTitle(),
                detail: dependencies.length > 0 ? t("mods.toastDeps", { count: dependencies.length }) : undefined,
                state: "success",
              }
            : item,
        ),
      );
      setModsRevision((value) => value + 1);
      void loadPacks();
    } catch (cause) {
      await recordModHistory(operation, false, [...lines, errorText(cause)], [], []);
      setToasts((current) =>
        current.map((item) =>
          item.id === id
            ? {
                id,
                title: operation.kind === "add"
                  ? t("mods.toastError", { name })
                  : t("mods.toastGenericError", { action: t(actionKey(operation.kind)), name }),
                detail: errorText(cause).slice(0, 90),
                state: "error",
              }
            : item,
        ),
      );
    } finally {
      unlisten?.();
      window.setTimeout(() => dismissToast(id), 4200);
    }
  };

  const reloadAssets = async () => {
    if (!selectedPack) return;
    try {
      const details = await invoke<PackMeta>("meta_get", { dir: selectedPack });
      setMeta(details);
      setHasIcon(
        await invoke<boolean>("pack_has_icon", {
          dir: selectedPack,
          path: details.icon || ".packwright/assets/icon.png",
        }),
      );
      await loadPacks();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const activePack = packs.find((pack) => pack.dir === selectedPack);
  const availableLoaders = mcVersions.find((version) => version.id === form.minecraft_version)?.loaders ?? [];

  const activeView: SidebarView = selectedPack && view === "editor" ? "editor" : view;
  const inSetup = config === null || !config.setup_complete;

  return (
    <div className={`min-h-screen bg-bg text-ink ${inSetup ? "" : "app-shell"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {!inSetup && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          active={activeView}
          onHome={() => { setSelectedPack(null); setView("home"); }}
          onPacks={() => { setSelectedPack(null); setView("packs"); }}
          onSettings={() => { setSelectedPack(null); setView("settings"); }}
          packsCount={packs.length}
        />
      )}

      <main className={inSetup ? "mx-auto max-w-5xl px-6 py-10" : "main-area px-8 py-8"}>
        {error && (
          <div className="mb-6 flex items-center justify-between rounded-lg border border-bad/30 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            <span>{error}</span>
            <button className="text-xs opacity-70 hover:opacity-100" onClick={() => setError(null)}>
              {t("common.close")}
            </button>
          </div>
        )}

        {config === null ? null : !config.setup_complete ? (
          <SetupView
            config={config}
            isSetup
            onSave={(next) => void saveConfig(next)}
            onLocaleChange={setLocale}
          />
        ) : view === "settings" ? (
          <div className="view-enter">
            <SettingsView
              config={config}
              theme={theme}
              onThemeChange={setTheme}
              packwizFound={Boolean(packwiz?.found)}
              onSave={(next) => void saveConfig(next)}
              onPackwizInstalled={(status) => { setPackwiz(status); void loadPacks(); }}
            />
          </div>
        ) : view === "home" ? (
          <HomeView
            packs={packs}
            workspace={config?.workspace ?? "—"}
            launchersCount={config?.launchers.length ?? 0}
            onNew={() => setView("create")}
            onGoPacks={() => setView("packs")}
            onOpenPack={(dir) => { setSelectedPack(dir); setView("editor"); }}
            onOpenWorkspace={() => void invoke("open_path", { path: config?.workspace ?? "" })}
          />
        ) : view === "create" ? (
          <div className="view-enter mx-auto max-w-lg">
            <button className="mb-5 text-sm text-muted hover:text-ink" onClick={() => setView("packs")}>
              ← {t("editor.back")}
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{t("nav.newPack")}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("welcome.cardTitle")}</h1>
            <p className="mt-1 text-sm text-muted">{t("welcome.cardSubtitle")}</p>
            <div className="card mt-6 p-6">
              <CreatePackForm
                form={form}
                onChange={setForm}
                onSubmit={createPack}
                mcVersions={mcVersions}
                loaderVersions={loaderVersions}
                packwizFound={Boolean(packwiz?.found)}
                busy={busy}
                availableLoaders={availableLoaders}
                compact
              />
            </div>
          </div>
        ) : view === "editor" ? (
          <div className="view-enter">
            <PackEditor
              key={selectedPack}
              packName={activePack?.name ?? selectedPack ?? ""}
              dir={selectedPack ?? ""}
              version={activePack?.version ?? null}
              minecraftVersion={activePack?.minecraft_version ?? null}
              loader={activePack?.loader ?? null}
              theme={theme}
              files={files}
              activeFile={activeFile}
              content={content}
              dirty={dirty}
              diagnostics={diagnostics}
              history={history}
              showHistory={showHistory}
              meta={meta}
              metaDirty={metaDirty}
              hasIcon={hasIcon}
              onBack={() => { setSelectedPack(null); setActiveFile(null); setView("packs"); }}
              onSaveFile={() => void saveFile()}
              onHistory={() => void loadHistory()}
              onRestore={(id) => void restoreVersion(id)}
              onOpenFile={(path) => void openFile(path)}
              onContentChange={(value) => { setContent(value); setDirty(true); }}
              onMetaChange={(next) => { setMeta(next); setMetaDirty(true); }}
              onSaveMeta={() => void saveDetails()}
              onUseIcon={() => void useDefaultIcon()}
              onGenerateReadme={() => void generateReadme()}
              onExport={() => setExportTarget(selectedPack)}
              exporting={exportTarget === selectedPack}
              onAssetsChanged={() => void reloadAssets()}
              modsRevision={modsRevision}
              onModOperation={(operation) => void runModOperation(operation)}
            />
          </div>
        ) : view === "packs" && packs.length === 0 ? (
          <WelcomeView
            form={form}
            onChange={setForm}
            onSubmit={createPack}
            mcVersions={mcVersions}
            loaderVersions={loaderVersions}
            packwizFound={Boolean(packwiz?.found)}
            busy={busy}
            workspace={config?.workspace ?? "—"}
            availableLoaders={availableLoaders}
          />
        ) : (
          <PacksView
            packs={packs}
            workspace={config?.workspace ?? "—"}
            onOpen={(dir) => void openPack(dir)}
            onReveal={(dir) => void reveal(dir)}
            onExport={setExportTarget}
            exporting={exportTarget}
            onNew={() => setView("create")}
          />
        )}
      </main>

      {exportTarget &&
        createPortal(
          <ExportModal
            dir={exportTarget}
            packName={packs.find((pack) => pack.dir === exportTarget)?.name ?? exportTarget}
            onClose={() => setExportTarget(null)}
          />,
          document.body,
        )}

      <Toasts items={toasts} onDismiss={dismissToast} />
    </div>
  );
}
