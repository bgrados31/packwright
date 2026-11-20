import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";

const CodeEditor = lazy(() => import("./components/CodeEditor"));

type PackInfo = {
  dir: string;
  path: string;
  name: string;
  author: string | null;
  version: string | null;
  description: string | null;
  minecraft_version: string | null;
  loader: string | null;
  loader_version: string | null;
  mod_count: number;
  issues: string[];
};

type AppConfig = {
  workspace: string;
  packwiz_path: string | null;
  serve_port: number;
  locale: string;
  atlauncher_path: string | null;
};

type PackwizStatus = { found: boolean; path: string | null };
type OpLine = { id: string; stream: "stdout" | "stderr"; line: string };
type ErrorInfo = { message: string; kind: string };
type FileEntry = { path: string; name: string; size: number };
type Diagnostic = { line: number; column: number; message: string; severity: string };
type HistoryEntry = { id: string; path: string };
type McVersion = { id: string; kind: string; release_time: string };
type LoaderVersion = { id: string; stable: boolean };
type PackMeta = {
  summary: string;
  license: string;
  homepage: string;
  source: string;
  categories: string[];
  icon: string;
  banner: string;
  readme: string;
};

const LOADERS = ["neoforge", "forge", "fabric", "quilt", "purpur"];
const emptyForm = {
  name: "",
  author: "",
  minecraft_version: "1.21.1",
  loader: "neoforge",
  loader_version: "",
  version: "1.0.0",
  description: "",
};

function errorText(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) return (e as ErrorInfo).message;
  return String(e);
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

function App() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("packwright-theme") as "light" | "dark") || "light",
  );
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [packwiz, setPackwiz] = useState<PackwizStatus | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [form, setForm] = useState(emptyForm);
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
  const [editorTab, setEditorTab] = useState<"files" | "details">("files");
  const [metaForm, setMetaForm] = useState<PackMeta | null>(null);
  const [metaDirty, setMetaDirty] = useState(false);
  const [hasIcon, setHasIcon] = useState(false);
  const [mcVersions, setMcVersions] = useState<McVersion[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("packwright-theme", theme);
  }, [theme]);

  const loadAll = useCallback(async () => {
    try {
      const [cfg, status, list] = await Promise.all([
        invoke<AppConfig>("config_get"),
        invoke<PackwizStatus>("packwiz_status"),
        invoke<PackInfo[]>("pack_list"),
      ]);
      setConfig(cfg);
      setPackwiz(status);
      setPacks(list);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    loadAll();
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    listen<OpLine>("operation://line", (event) => {
      if (!disposed) setLogs((prev) => [...prev.slice(-199), event.payload]);
    }).then((fn) => unlisteners.push(fn));
    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [loadAll]);

  const loadMcVersions = useCallback(async () => {
    try {
      const list = await invoke<McVersion[]>("versions_minecraft", { includeSnapshots: false });
      setMcVersions(list);
    } catch {
      setMcVersions([]);
    }
  }, []);

  const loadLoaderVersions = useCallback(async (loader: string, mc: string) => {
    if (!loader || !mc) return;
    setLoadingVersions(true);
    try {
      const list = await invoke<LoaderVersion[]>("versions_loader", { loader, mcVersion: mc });
      setLoaderVersions(list);
    } catch {
      setLoaderVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  useEffect(() => { loadMcVersions(); }, [loadMcVersions]);
  useEffect(() => {
    loadLoaderVersions(form.loader, form.minecraft_version);
  }, [form.loader, form.minecraft_version, loadLoaderVersions]);

  const reloadVersions = async () => {
    setError(null);
    await loadMcVersions();
    await loadLoaderVersions(form.loader, form.minecraft_version);
  };

  const openPack = useCallback(async (dir: string) => {
    try {
      const list = await invoke<FileEntry[]>("pack_files", { dir });
      setFiles(list);
      setSelectedPack(dir);
      setDiagnostics([]);
      setShowHistory(false);
      setEditorTab("files");
      const meta = await invoke<PackMeta>("meta_get", { dir });
      setMetaForm(meta);
      setMetaDirty(false);
      setHasIcon(await invoke<boolean>("pack_has_icon", { dir, path: meta.icon || ".packwright/assets/icon.png" }));
      const first = list.find((f) => f.path === "pack.toml") ?? list[0];
      if (first) {
        setActiveFile(first.path);
        setContent(await invoke<string>("file_read", { dir, path: first.path }));
        setDirty(false);
      } else {
        setActiveFile(null);
        setContent("");
      }
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  const openFile = async (path: string) => {
    if (!selectedPack || path === activeFile) return;
    try {
      setActiveFile(path);
      setContent(await invoke<string>("file_read", { dir: selectedPack, path }));
      setDirty(false);
      setDiagnostics([]);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const saveFile = useCallback(async () => {
    if (!selectedPack || !activeFile || !dirty) return;
    try {
      setLogs([]);
      await invoke("file_write", { dir: selectedPack, path: activeFile, content });
      setDirty(false);
      await loadAll();
    } catch (e) {
      setError(errorText(e));
    }
  }, [selectedPack, activeFile, dirty, content, loadAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveFile]);

  useEffect(() => {
    if (!selectedPack || !activeFile) return;
    const timer = setTimeout(async () => {
      try {
        const found = await invoke<Diagnostic[]>("file_validate", {
          dir: selectedPack,
          path: activeFile,
          content,
        });
        setDiagnostics(found);
      } catch {
        // archivo todavía no indexado, se ignora
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [content, activeFile, selectedPack]);

  const loadHistory = async () => {
    if (!selectedPack || !activeFile) return;
    try {
      setHistory(await invoke<HistoryEntry[]>("file_history", { dir: selectedPack, path: activeFile }));
      setShowHistory(true);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const restoreVersion = async (id: string) => {
    if (!selectedPack || !activeFile) return;
    try {
      setContent(await invoke<string>("file_restore", { dir: selectedPack, path: activeFile, id }));
      setDirty(true);
      setShowHistory(false);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const createPack = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setLogs([]);
    try {
      await invoke<PackInfo>("pack_create", {
        ...form,
        author: form.author || "Packwright",
        loaderVersion: form.loader_version.trim() || null,
      });
      setForm(emptyForm);
      setShowCreate(false);
      await loadAll();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const reveal = async (dir: string) => {
    try {
      await invoke("pack_reveal", { dir });
    } catch (err) {
      setError(errorText(err));
    }
  };

  const saveMeta = async () => {
    if (!selectedPack || !metaForm) return;
    try {
      await invoke("meta_set", { dir: selectedPack, meta: metaForm });
      setMetaDirty(false);
      await loadAll();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const useDefaultIcon = async () => {
    if (!selectedPack) return;
    try {
      await invoke<string>("pack_icon_set_default", { dir: selectedPack });
      setMetaForm((prev) => prev ? { ...prev, icon: ".packwright/assets/icon.png" } : prev);
      setMetaDirty(true);
      setHasIcon(await invoke<boolean>("pack_has_icon", { dir: selectedPack, path: ".packwright/assets/icon.png" }));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const generateReadme = async () => {
    if (!selectedPack) return;
    try {
      await invoke("pack_generate_readme", { dir: selectedPack });
      const list = await invoke<FileEntry[]>("pack_files", { dir: selectedPack });
      setFiles(list);
      setEditorTab("files");
      const readme = list.find((f) => f.path === "README.md");
      if (readme) {
        setActiveFile(readme.path);
        setContent(await invoke<string>("file_read", { dir: selectedPack, path: readme.path }));
        setDirty(false);
      }
    } catch (err) {
      setError(errorText(err));
    }
  };

  const renderForm = (compact: boolean) => (
    <form onSubmit={createPack} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pack-name" className="text-xs font-medium text-muted">Nombre del pack</label>
        <input
          id="pack-name"
          className="field"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Mi modpack"
          required
          autoFocus={compact}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pack-mc" className="flex items-center justify-between text-xs font-medium text-muted">
            <span>Minecraft {mcVersions.length > 0 && <span className="font-normal">· {mcVersions.length}</span>}</span>
            <button type="button" className="text-[10px] font-normal text-accent hover:underline" onClick={reloadVersions}>
              Recargar
            </button>
          </label>
          {mcVersions.length > 0 ? (
            <select
              id="pack-mc"
              className="field"
              value={form.minecraft_version}
              onChange={(e) => setForm({ ...form, minecraft_version: e.target.value, loader_version: "" })}
              required
            >
              {form.minecraft_version && !mcVersions.some((v) => v.id === form.minecraft_version) && (
                <option value={form.minecraft_version}>{form.minecraft_version} (actual)</option>
              )}
              {mcVersions.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}
            </select>
          ) : (
            <input
              id="pack-mc"
              className="field"
              value={form.minecraft_version}
              onChange={(e) => setForm({ ...form, minecraft_version: e.target.value })}
              placeholder="1.21.1"
              required
            />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pack-loader" className="text-xs font-medium text-muted">Loader</label>
          <select
            id="pack-loader"
            className="field"
            value={form.loader}
            onChange={(e) => setForm({ ...form, loader: e.target.value, loader_version: "" })}
          >
            {LOADERS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      <details className="group text-sm">
        <summary className="flex items-center gap-1.5 py-1 text-xs text-muted transition-colors hover:text-ink">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="transition-transform group-open:rotate-90">
            <path d="M9 18l6-6-6-6" />
          </svg>
          Más opciones
        </summary>
        <div className="mt-3 flex flex-col gap-4 rounded-lg border border-line bg-subtle p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted" htmlFor="pack-author">Autor</label>
              <input id="pack-author" className="field" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted" htmlFor="pack-version">Versión</label>
              <input id="pack-version" className="field" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted" htmlFor="pack-lv">
              Versión del loader {loaderVersions.length > 0 && <span className="font-normal">· {loaderVersions.length}</span>}
              {loadingVersions && <span className="ml-1 font-normal">cargando…</span>}
            </label>
            {loaderVersions.length > 0 ? (
              <select
                id="pack-lv"
                className="field"
                value={form.loader_version}
                onChange={(e) => setForm({ ...form, loader_version: e.target.value })}
              >
                <option value="">Automática (recomendada)</option>
                {loaderVersions.map((v) => (
                  <option key={v.id} value={v.id}>{v.id}{v.stable ? "" : " · inestable"}</option>
                ))}
              </select>
            ) : (
              <input
                id="pack-lv"
                className="field"
                value={form.loader_version}
                onChange={(e) => setForm({ ...form, loader_version: e.target.value })}
                placeholder={loadingVersions ? "Cargando versiones…" : "Automática"}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted" htmlFor="pack-desc">Descripción</label>
            <textarea id="pack-desc" className="field resize-y" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Opcional" />
          </div>
        </div>
      </details>

      <button className="btn btn-primary mt-1" type="submit" disabled={busy || !packwiz?.found}>
        {busy ? "Creando…" : "Crear modpack"}
      </button>
      {!packwiz?.found && (
        <p className="text-center text-xs text-bad">No se detectó packwiz. Instálalo o indícalo en la configuración.</p>
      )}
    </form>
  );

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <img src="/packwright-mark.png" alt="Packwright" className="h-8 w-8" />
            <span className="text-[15px] font-semibold tracking-tight">Packwright</span>
          </div>
          <div className="flex items-center gap-2">
            {packs.length > 0 && !showCreate && !selectedPack && (
              <button className="btn btn-secondary" onClick={() => setShowCreate(true)}>Nuevo modpack</button>
            )}
            <button
              className="btn btn-quiet px-2.5"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              title={theme === "light" ? "Modo oscuro" : "Modo claro"}
              aria-label="Cambiar tema"
            >
              {theme === "light" ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 max-w-5xl px-6">
          <div className="flex items-center justify-between rounded-lg border border-bad/30 bg-bad/5 px-4 py-2.5 text-sm text-bad">
            <span>{error}</span>
            <button className="text-xs opacity-70 hover:opacity-100" onClick={() => setError(null)}>Cerrar</button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-6 py-10">
        {!showCreate && !selectedPack && packs.length === 0 ? (
          <div className="mx-auto max-w-lg py-8">
            <div className="text-center">
              <img src="/packwright-mark.png" alt="" className="mx-auto h-14 w-14" />
              <h1 className="mt-6 text-[26px] font-semibold tracking-tight">Crea tu primer modpack</h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                Organiza tus mods, elige la versión de Minecraft y exporta un pack listo para instalar en tu launcher.
              </p>
            </div>
            <div className="card mt-8 p-6">{renderForm(false)}</div>
            <p className="mt-5 text-center text-xs text-muted">
              Todo se guarda en local · <span className="font-mono">{config?.workspace ?? "…"}</span>
            </p>
          </div>
        ) : showCreate ? (
          <div className="mx-auto max-w-lg">
            <button className="mb-5 text-sm text-muted hover:text-ink" onClick={() => setShowCreate(false)}>← Volver</button>
            <h1 className="text-2xl font-semibold tracking-tight">Nuevo modpack</h1>
            <p className="mt-1 text-sm text-muted">Configura lo esencial. Puedes ajustar el resto después.</p>
            <div className="card mt-6 p-6">{renderForm(true)}</div>
          </div>
        ) : selectedPack ? (
          <div>
            <button className="text-sm text-muted hover:text-ink" onClick={() => { setSelectedPack(null); setActiveFile(null); }}>
              ← Todos los packs
            </button>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {packs.find((p) => p.dir === selectedPack)?.name ?? selectedPack}
                </h1>
                <p className="mt-1 font-mono text-xs text-muted">{selectedPack}</p>
              </div>
              <div className="flex gap-2">
                {editorTab === "files" ? (
                  <>
                    <button className="btn btn-secondary" onClick={loadHistory}>Historial</button>
                    <button className="btn btn-primary" onClick={saveFile} disabled={!dirty}>Guardar</button>
                  </>
                ) : (
                  <button className="btn btn-primary" onClick={saveMeta} disabled={!metaDirty}>Guardar metadata</button>
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-1 border-b border-line">
              {(["files", "details"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`border-b-2 px-3 pb-2 text-sm transition-colors ${
                    editorTab === tab ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
                  }`}
                  onClick={() => setEditorTab(tab)}
                >
                  {tab === "files" ? "Archivos" : "Detalles"}
                </button>
              ))}
            </div>

            {editorTab === "files" ? (
              <div className="card mt-6 overflow-hidden">
                <div className="grid grid-cols-[210px_1fr]">
                  <aside className="max-h-[600px] overflow-auto border-r border-line p-2">
                    <div className="px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">Archivos</div>
                    {files.map((f) => (
                      <button
                        key={f.path}
                        className={`file-row ${f.path === activeFile ? "active" : ""}`}
                        onClick={() => openFile(f.path)}
                        title={f.path}
                      >
                        {f.path}
                      </button>
                    ))}
                  </aside>

                  <div className="min-w-0">
                    <div className="flex h-10 items-center justify-between border-b border-line px-4 text-xs">
                      <span className="font-mono text-muted">{activeFile ?? "—"}</span>
                      <div className="flex items-center gap-3">
                        {dirty && <span className="text-muted">Sin guardar</span>}
                        {diagnostics.length > 0 ? (
                          <span className="text-bad">{diagnostics.length} error(es)</span>
                        ) : (
                          <span className="text-ok">Sin errores</span>
                        )}
                      </div>
                    </div>

                    {showHistory && (
                      <div className="border-b border-line bg-subtle px-4 py-3">
                        <div className="mb-2 text-xs font-medium text-muted">Versiones anteriores</div>
                        <div className="flex flex-wrap gap-2">
                          {history.length === 0 && <span className="text-xs text-muted">Sin versiones guardadas</span>}
                          {history.map((h) => (
                            <button key={h.id} className="btn btn-secondary text-xs" onClick={() => restoreVersion(h.id)}>
                              {new Date(Number(h.id) * 1000).toLocaleString()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {diagnostics.length > 0 && (
                      <div className="border-b border-bad/30 bg-bad/5 px-4 py-2">
                        {diagnostics.slice(0, 3).map((d, i) => (
                          <div key={i} className="output-line err">
                            {d.line}:{d.column} — {d.message.split("\n")[0]}
                          </div>
                        ))}
                      </div>
                    )}

                    <Suspense
                      fallback={<div className="grid h-[520px] place-items-center text-sm text-muted">Cargando editor…</div>}
                    >
                      <CodeEditor
                        theme={theme}
                        path={activeFile ?? "pack.toml"}
                        value={content}
                        diagnostics={diagnostics}
                        onChange={(value) => { setContent(value); setDirty(true); }}
                      />
                    </Suspense>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-[1fr_320px] gap-6">
                <div className="card p-6">
                  <h2 className="text-lg font-semibold">Detalles del pack</h2>
                  <p className="mt-1 text-sm text-muted">Esta información aparece al compartir o publicar el modpack.</p>
                  {metaForm && (
                    <div className="mt-6 flex flex-col gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-muted">Resumen</span>
                        <textarea
                          className="field resize-y"
                          rows={3}
                          maxLength={200}
                          value={metaForm.summary}
                          onChange={(e) => { setMetaForm({ ...metaForm, summary: e.target.value }); setMetaDirty(true); }}
                          placeholder="Una frase que describa tu pack"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">Licencia</span>
                          <input className="field" value={metaForm.license} onChange={(e) => { setMetaForm({ ...metaForm, license: e.target.value }); setMetaDirty(true); }} placeholder="MIT" />
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="text-xs text-muted">Categorías</span>
                          <input
                            className="field"
                            value={metaForm.categories.join(", ")}
                            onChange={(e) => {
                              setMetaForm({
                                ...metaForm,
                                categories: e.target.value.split(",").map((c) => c.trim()).filter(Boolean),
                              });
                              setMetaDirty(true);
                            }}
                            placeholder="Aventura, Performance"
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted">Web</span>
                        <input className="field" value={metaForm.homepage} onChange={(e) => { setMetaForm({ ...metaForm, homepage: e.target.value }); setMetaDirty(true); }} placeholder="https://…" />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted">Código fuente</span>
                        <input className="field" value={metaForm.source} onChange={(e) => { setMetaForm({ ...metaForm, source: e.target.value }); setMetaDirty(true); }} placeholder="https://github.com/…" />
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2 border-t border-line pt-4">
                        <button className="btn btn-secondary" onClick={useDefaultIcon}>Usar isotipo como icono</button>
                        <button className="btn btn-secondary" onClick={generateReadme}>Generar README</button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs font-medium text-muted">Vista previa</div>
                  <div className="card mt-2 overflow-hidden">
                    <div className="flex h-28 items-center justify-center bg-subtle">
                      <img src="/packwright-mark.png" alt="" className="h-16 w-16" />
                    </div>
                    <div className="p-5">
                      <h3 className="font-semibold">{packs.find((p) => p.dir === selectedPack)?.name ?? selectedPack}</h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted">
                        {metaForm?.summary || packs.find((p) => p.dir === selectedPack)?.description || "Sin resumen"}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {packs.find((p) => p.dir === selectedPack)?.minecraft_version && (
                          <span className="chip">MC {packs.find((p) => p.dir === selectedPack)?.minecraft_version}</span>
                        )}
                        {metaForm?.categories.slice(0, 3).map((c) => <span key={c} className="chip">{c}</span>)}
                      </div>
                      <p className="mt-4 text-xs text-muted">v{packs.find((p) => p.dir === selectedPack)?.version ?? "—"}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Icono: <span className={hasIcon ? "text-ok" : "text-bad"}>{hasIcon ? "configurado" : "pendiente"}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">Tus modpacks</h1>
              <span className="text-sm text-muted">{packs.length} {packs.length === 1 ? "pack" : "packs"}</span>
            </div>
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
                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-muted">{pack.description || "Sin descripción"}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <span className="chip">MC {pack.minecraft_version ?? "—"}</span>
                    <span className="chip">{pack.loader ?? "—"}</span>
                    <span className="chip">{pack.mod_count} mods</span>
                  </div>
                  <div className="mt-5 flex items-center gap-2">
                    <button className="btn btn-primary flex-1" onClick={() => openPack(pack.dir)}>Abrir</button>
                    <button className="btn btn-secondary" onClick={() => reveal(pack.dir)} title="Abrir carpeta">↗</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>

      {logs.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface shadow-lg">
          <div className="mx-auto max-w-5xl px-6 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">Salida de packwiz</span>
              <button className="text-xs text-muted hover:text-ink" onClick={() => setLogs([])}>Limpiar</button>
            </div>
            <div className="max-h-28 overflow-auto">
              {logs.map((log, i) => (
                <div key={i} className={`output-line ${log.stream === "stderr" ? "err" : ""}`}>{log.line}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
