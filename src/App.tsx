import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor from "@monaco-editor/react";
import { monaco } from "./lib/monaco";
import "./App.css";

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

const LOADERS = ["neoforge", "forge", "fabric", "quilt", "purpur"];

const emptyForm = {
  name: "",
  author: "Bryan Grados",
  minecraft_version: "1.21.1",
  loader: "neoforge",
  loader_version: "",
  version: "1.0.0",
  description: "",
};

function languageFor(path: string): string {
  if (path.endsWith(".json") || path.endsWith(".json5")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".yml") || path.endsWith(".yaml")) return "yaml";
  return "toml";
}

function errorText(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) return (e as ErrorInfo).message;
  return String(e);
}

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [packwiz, setPackwiz] = useState<PackwizStatus | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<OpLine[]>([]);

  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

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
      if (!disposed) setLogs((prev) => [...prev.slice(-299), event.payload]);
    }).then((fn) => unlisteners.push(fn));
    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [loadAll]);

  const openPack = useCallback(async (dir: string) => {
    try {
      const list = await invoke<FileEntry[]>("pack_files", { dir });
      setFiles(list);
      setSelectedPack(dir);
      setDiagnostics([]);
      setShowHistory(false);
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

  // Validación diferida del archivo activo.
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
        const model = editorRef.current?.getModel();
        if (model) {
          monaco.editor.setModelMarkers(
            model,
            "packwright",
            found.map((d) => ({
              startLineNumber: d.line,
              startColumn: d.column,
              endLineNumber: d.line,
              endColumn: d.column + 1,
              message: d.message,
              severity: monaco.MarkerSeverity.Error,
            })),
          );
        }
      } catch {
        // Un archivo recién escrito puede no existir aún en el índice; se ignora.
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
        loader_version: form.loader_version.trim() || null,
      });
      setForm({ ...emptyForm, author: form.author, minecraft_version: form.minecraft_version });
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

  return (
    <main className="blueprint min-h-screen">
      <div className="mx-auto max-w-[1500px] px-8 py-6">
        <header className="flex items-end justify-between border-b border-line pb-5">
          <div className="flex items-center gap-4">
            <div className="grid h-11 w-11 place-items-center border border-violet/50 bg-panel">
              <span className="brand-glyph text-lg">PW</span>
            </div>
            <div>
              <h1 className="text-[19px] font-semibold tracking-[-0.03em]">PACKWRIGHT</h1>
              <p className="eyebrow mt-0.5">Modpack studio — build 0.1</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`status-tag ${packwiz?.found ? "text-lime" : "text-[#f08c96]"}`}>
              {packwiz?.found ? "[ PACKWIZ OK ]" : "[ PACKWIZ MISSING ]"}
            </span>
            <span className="status-tag text-dim">[{String(packs.length).padStart(2, "0")} PACKS]</span>
          </div>
        </header>

        {error && (
          <div className="mt-4 border border-[#7f2d39] bg-[#2a1119] px-4 py-3 text-xs text-[#f3a9b2]">
            <span className="font-mono">ERR / </span>{error}
            <button className="float-right font-mono text-dim hover:text-white" onClick={() => setError(null)}>✕</button>
          </div>
        )}

        <div className="mt-6 grid grid-cols-[330px_1fr] gap-6">
          <aside>
            <section className="panel p-4">
              <div className="eyebrow flex items-center gap-2">
                <span className="text-violet">01</span> / WORKSPACE
              </div>
              <div className="accent-rule my-3" />
              <code className="block break-all font-mono text-[11px] leading-5 text-[#9aa5c8]">
                {config?.workspace ?? "—"}
              </code>
            </section>

            <section className="panel mt-4 p-4">
              <div className="eyebrow flex items-center gap-2">
                <span className="text-violet">02</span> / NEW PACK
              </div>
              <div className="accent-rule my-3" />
              <form onSubmit={createPack} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="eyebrow">Nombre</span>
                  <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mi Gran Pack" required />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="eyebrow">Autor</span>
                  <input className="field" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="eyebrow">Minecraft</span>
                    <input className="field" value={form.minecraft_version} onChange={(e) => setForm({ ...form, minecraft_version: e.target.value })} required />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="eyebrow">Versión</span>
                    <input className="field" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="eyebrow">Loader</span>
                  <select className="field" value={form.loader} onChange={(e) => setForm({ ...form, loader: e.target.value })}>
                    {LOADERS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="eyebrow">Loader version <em className="normal-case not-italic text-[#4d5778]">/ latest</em></span>
                  <input className="field" value={form.loader_version} onChange={(e) => setForm({ ...form, loader_version: e.target.value })} placeholder="auto" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="eyebrow">Descripción</span>
                  <textarea className="field resize-y" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Una línea sobre el pack" />
                </label>
                <button className="btn-primary mt-1" type="submit" disabled={busy || !packwiz?.found}>
                  {busy ? "FORJANDO…" : "FORJAR PACK →"}
                </button>
              </form>
            </section>
          </aside>

          <section>
            {selectedPack ? (
              <div className="panel">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <div>
                    <div className="eyebrow flex items-center gap-2"><span className="text-cyan">04</span> / FILE EDITOR</div>
                    <h2 className="mt-1 font-mono text-sm text-[#e6ebff]">{selectedPack}</h2>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => { setSelectedPack(null); setActiveFile(null); }}>← PACKS</button>
                    <button className="btn-ghost" onClick={loadHistory}>HISTORY</button>
                    <button className="btn-primary" onClick={saveFile} disabled={!dirty}>GUARDAR ⌃S</button>
                  </div>
                </div>

                <div className="grid grid-cols-[230px_1fr]">
                  <div className="max-h-[600px] overflow-auto border-r border-line py-2">
                    <div className="eyebrow px-3 pb-2">FILES / {String(files.length).padStart(2, "0")}</div>
                    {files.map((f) => (
                      <div
                        key={f.path}
                        className={`file-row ${f.path === activeFile ? "active" : ""}`}
                        onClick={() => openFile(f.path)}
                        title={f.path}
                      >
                        {f.path}
                      </div>
                    ))}
                  </div>

                  <div className="min-w-0">
                    <div className="flex h-8 items-center gap-3 border-b border-line px-3 font-mono text-[10px]">
                      <span className="text-cyan">{activeFile ?? "—"}</span>
                      {dirty && <span className="text-[#f0b86e]">● MODIFICADO</span>}
                      {diagnostics.length > 0 ? (
                        <span className="text-[#f08c96]">{diagnostics.length} ERROR(ES)</span>
                      ) : (
                        <span className="text-dim">SIN ERRORES</span>
                      )}
                    </div>

                    {showHistory && (
                      <div className="border-b border-line bg-panel-2 px-3 py-2">
                        <div className="eyebrow mb-2">HISTORIAL DE {activeFile}</div>
                        <div className="flex flex-wrap gap-2">
                          {history.length === 0 && <span className="font-mono text-[11px] text-dim">Sin versiones guardadas</span>}
                          {history.map((h) => (
                            <button key={h.id} className="btn-ghost" onClick={() => restoreVersion(h.id)}>
                              {new Date(Number(h.id) * 1000).toLocaleString()}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {diagnostics.length > 0 && (
                      <div className="border-b border-[#5a2a35] bg-[#21121a] px-3 py-2">
                        {diagnostics.slice(0, 3).map((d, i) => (
                          <div key={i} className="console-line err">
                            {d.line}:{d.column} — {d.message.split("\n")[0]}
                          </div>
                        ))}
                      </div>
                    )}

                    <Editor
                      height="520px"
                      theme="packwright"
                      language={activeFile ? languageFor(activeFile) : "toml"}
                      value={content}
                      onMount={(editor) => { editorRef.current = editor; }}
                      onChange={(value) => { setContent(value ?? ""); setDirty(true); }}
                      options={{
                        fontFamily: "Cascadia Code, Consolas, monospace",
                        fontSize: 12,
                        lineHeight: 20,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        padding: { top: 12 },
                        renderLineHighlight: "line",
                        tabSize: 2,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="eyebrow flex items-center gap-2"><span className="text-cyan">03</span> / PACKS</div>
                    <h2 className="mt-1 text-lg font-medium tracking-tight">Tus modpacks</h2>
                  </div>
                  <span className="eyebrow">selecciona uno para editar sus archivos</span>
                </div>

                {packs.length === 0 ? (
                  <div className="panel mt-4 grid place-items-center py-20">
                    <div className="text-center">
                      <div className="font-mono text-4xl text-violet/40">[ + ]</div>
                      <p className="mt-4 font-mono text-xs text-dim">EL WORKSPACE ESTÁ VACÍO</p>
                      <p className="mt-1 text-xs text-[#4d5778]">Forja tu primer pack desde el panel izquierdo.</p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                    {packs.map((pack) => (
                      <article key={pack.dir} className="pack-card">
                        <div className="flex items-start justify-between">
                          <div className="grid h-9 w-9 place-items-center border border-violet/30 bg-violet/5 font-mono text-xs text-violet">
                            ▦
                          </div>
                          <span className="status-tag text-dim">v{pack.version ?? "?"}</span>
                        </div>
                        <h3 className="mt-4 text-sm font-semibold tracking-tight">{pack.name}</h3>
                        <p className="mt-1 text-[11px] leading-5 text-dim line-clamp-2">
                          {pack.description || "Sin descripción"}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          <span className="chip">MC {pack.minecraft_version ?? "?"}</span>
                          <span className="chip">{pack.loader ?? "—"}</span>
                          <span className="chip">{pack.mod_count} MODS</span>
                        </div>
                        {pack.issues.length > 0 && (
                          <ul className="mt-3 space-y-1 font-mono text-[10px] text-[#f0b86e]">
                            {pack.issues.map((i) => <li key={i}>! {i}</li>)}
                          </ul>
                        )}
                        <div className="mt-5 flex gap-4">
                          <button className="btn-ghost" onClick={() => openPack(pack.dir)}>EDITAR →</button>
                          <button className="btn-ghost" onClick={() => reveal(pack.dir)}>CARPETA ↗</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <footer className="mt-6">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="eyebrow">PACKWIZ / OUTPUT</span>
            <span className="font-mono text-[10px] text-[#3f4969]">stdout · stderr</span>
          </div>
          <div className="console mt-2 h-32 overflow-auto p-3">
            {logs.length === 0 ? (
              <div className="console-line text-[#3f4969]">$ esperando operaciones…</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`console-line ${log.stream === "stderr" ? "err" : ""}`}>
                  {log.stream === "stderr" ? "!" : "›"} {log.line}
                </div>
              ))
            )}
          </div>
        </footer>
      </div>
    </main>
  );
}

export default App;
