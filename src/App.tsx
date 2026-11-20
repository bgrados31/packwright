import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

import CreatePackForm from "./components/CreatePackForm";
import OutputPanel from "./components/OutputPanel";
import WelcomeView from "./components/WelcomeView";
import PackEditor from "./components/PackEditor";
import { useI18n } from "./i18n";
import {
  type AppConfig,
  type CreatePackInput,
  type Diagnostic,
  type ErrorInfo,
  type FileEntry,
  type HistoryEntry,
  type LoaderVersion,
  type McVersion,
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

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("packwright-theme") as "light" | "dark") || "light",
  );
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [packwiz, setPackwiz] = useState<PackwizStatus | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [form, setForm] = useState<CreatePackInput>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<OpLine[]>([]);
  const [showCreate, setShowCreate] = useState(false);

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
    } catch (cause) {
      setError(errorText(cause));
    }
  }, []);

  useEffect(() => {
    loadPacks();
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    listen<OpLine>("operation://line", (event) => {
      if (!disposed) setLogs((previous) => [...previous.slice(-199), event.payload]);
    }).then((unlisten) => unlisteners.push(unlisten));
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [loadPacks]);

  useEffect(() => {
    invoke<McVersion[]>("versions_minecraft", { includeSnapshots: false })
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
    let cancelled = false;
    invoke<LoaderVersion[]>("versions_loader", {
      loader: form.loader,
      mcVersion: form.minecraft_version,
    })
      .then((list) => { if (!cancelled) setLoaderVersions(list); })
      .catch(() => { if (!cancelled) setLoaderVersions([]); });
    return () => { cancelled = true; };
  }, [form.loader, form.minecraft_version]);

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
    setLogs([]);
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
      setShowCreate(false);
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
      setLogs([]);
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

  const activePack = packs.find((pack) => pack.dir === selectedPack);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <img src="/packwright-mark.png" alt="" className="h-8 w-8" />
            <span className="text-[15px] font-semibold tracking-tight">{t("app.name")}</span>
          </div>
          <div className="flex items-center gap-2">
            {packs.length > 0 && !showCreate && !selectedPack && (
              <button className="btn btn-secondary" onClick={() => setShowCreate(true)}>
                {t("nav.newPack")}
              </button>
            )}
            <button
              className="btn btn-quiet px-2.5"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={t("nav.toggleTheme")}
              aria-label={t("nav.toggleTheme")}
            >
              {theme === "light" ? <MoonIcon /> : <SunIcon />}
            </button>
            <button
              className="btn btn-quiet px-2.5 font-mono text-[10px] uppercase"
              onClick={() => setLocale(locale === "en" ? "es" : "en")}
              title="Language"
            >
              {locale}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 max-w-5xl px-6">
          <div className="flex items-center justify-between rounded-lg border border-bad/30 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            <span>{error}</span>
            <button className="text-xs opacity-70 hover:opacity-100" onClick={() => setError(null)}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-6 py-10">
        {!showCreate && !selectedPack && packs.length === 0 ? (
          <WelcomeView
            form={form}
            onChange={setForm}
            onSubmit={createPack}
            mcVersions={mcVersions}
            loaderVersions={loaderVersions}
            packwizFound={Boolean(packwiz?.found)}
            busy={busy}
            workspace={config?.workspace ?? "—"}
          />
        ) : showCreate ? (
          <div className="mx-auto max-w-lg">
            <button className="mb-5 text-sm text-muted hover:text-ink" onClick={() => setShowCreate(false)}>
              ← {t("editor.back")}
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">{t("nav.newPack")}</h1>
            <p className="mt-1 text-sm text-muted">{t("welcome.subtitle")}</p>
            <div className="card mt-6 p-6">
              <CreatePackForm
                form={form}
                onChange={setForm}
                onSubmit={createPack}
                mcVersions={mcVersions}
                loaderVersions={loaderVersions}
                packwizFound={Boolean(packwiz?.found)}
                busy={busy}
                compact
              />
            </div>
          </div>
        ) : selectedPack ? (
          <PackEditor
            packName={activePack?.name ?? selectedPack}
            dir={selectedPack}
            version={activePack?.version ?? null}
            minecraftVersion={activePack?.minecraft_version ?? null}
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
            onBack={() => { setSelectedPack(null); setActiveFile(null); }}
            onSaveFile={() => void saveFile()}
            onHistory={() => void loadHistory()}
            onRestore={(id) => void restoreVersion(id)}
            onOpenFile={(path) => void openFile(path)}
            onContentChange={(value) => { setContent(value); setDirty(true); }}
            onMetaChange={(next) => { setMeta(next); setMetaDirty(true); }}
            onSaveMeta={() => void saveDetails()}
            onUseIcon={() => void useDefaultIcon()}
            onGenerateReadme={() => void generateReadme()}
          />
        ) : (
          <div>
            <div className="flex items-baseline justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">{t("packs.title")}</h1>
              <span className="text-sm text-muted">
                {t(packs.length === 1 ? "packs.countOne" : "packs.count", { count: packs.length })}
              </span>
            </div>

            {packs.length === 0 ? (
              <div className="card mt-6 grid place-items-center py-20">
                <div className="text-center">
                  <div className="font-mono text-4xl text-accent/40">[ + ]</div>
                  <p className="mt-4 font-mono text-xs text-muted">{t("packs.emptyTitle")}</p>
                  <p className="mt-1 text-xs text-muted">{t("packs.emptySubtitle")}</p>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                {packs.map((pack) => (
                  <article key={pack.dir} className="card p-5 transition-transform hover:-translate-y-0.5">
                    <div className="flex items-start justify-between">
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-sm font-semibold text-accent">
                        {pack.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-muted">v{pack.version ?? "—"}</span>
                    </div>
                    <h2 className="mt-4 font-medium">{pack.name}</h2>
                    <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-muted">
                      {pack.description || t("packs.noDescription")}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <span className="chip">MC {pack.minecraft_version ?? "—"}</span>
                      <span className="chip">{pack.loader ?? "—"}</span>
                      <span className="chip">{t("packs.modCount", { count: pack.mod_count })}</span>
                    </div>
                    <div className="mt-5 flex items-center gap-2">
                      <button className="btn btn-primary flex-1" onClick={() => void openPack(pack.dir)}>
                        {t("packs.open")}
                      </button>
                      <button className="btn btn-secondary" onClick={() => void reveal(pack.dir)} title={t("packs.folder")}>
                        ↗
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <OutputPanel lines={logs} onClear={() => setLogs([])} />
    </div>
  );
}
