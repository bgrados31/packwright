import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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

function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [packwiz, setPackwiz] = useState<PackwizStatus | null>(null);
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<OpLine[]>([]);

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
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">PW</div>
          <div>
            <h1>Packwright</h1>
            <p>Estudio de modpacks</p>
          </div>
        </div>
        <div className="status-group">
          <span className={`pill ${packwiz?.found ? "ok" : "bad"}`}>
            {packwiz?.found ? "packwiz listo" : "packwiz no encontrado"}
          </span>
          <span className="pill">{packs.length} pack(s)</span>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <div className="workspace-bar">
        <span>Workspace</span>
        <code>{config?.workspace ?? "…"}</code>
      </div>

      <div className="layout">
        <section className="card form-card">
          <h2>Crear modpack</h2>
          <form onSubmit={createPack}>
            <label>
              Nombre
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mi Gran Pack" required />
            </label>
            <label>
              Autor
              <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </label>
            <div className="row">
              <label>
                Minecraft
                <input value={form.minecraft_version} onChange={(e) => setForm({ ...form, minecraft_version: e.target.value })} required />
              </label>
              <label>
                Versión
                <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
              </label>
            </div>
            <label>
              Loader
              <select value={form.loader} onChange={(e) => setForm({ ...form, loader: e.target.value })}>
                {LOADERS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label>
              Versión del loader <small>(vacío = latest)</small>
              <input value={form.loader_version} onChange={(e) => setForm({ ...form, loader_version: e.target.value })} placeholder="latest" />
            </label>
            <label>
              Descripción
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descripción corta del pack" />
            </label>
            <button type="submit" disabled={busy || !packwiz?.found}>
              {busy ? "Creando…" : "Crear pack"}
            </button>
          </form>

          <div className="console">
            <div className="console-head">Consola de packwiz</div>
            <div className="console-body">
              {logs.length === 0 ? <span className="muted">Sin actividad reciente</span> : logs.map((log, i) => (
                <div key={i} className={`log ${log.stream}`}>{log.line}</div>
              ))}
            </div>
          </div>
        </section>

        <section className="packs">
          <h2>Tus modpacks</h2>
          {packs.length === 0 && <div className="empty">Todavía no hay packs. Crea el primero 👈</div>}
          <div className="pack-grid">
            {packs.map((pack) => (
              <article className="pack-card" key={pack.dir}>
                <div className="pack-icon">▦</div>
                <div className="pack-main">
                  <h3>{pack.name}</h3>
                  <p className="desc">{pack.description || "Sin descripción"}</p>
                  <div className="tags">
                    <span>MC {pack.minecraft_version ?? "?"}</span>
                    <span>{pack.loader ?? "sin loader"} {pack.loader_version ?? ""}</span>
                    <span>v{pack.version ?? "?"}</span>
                    <span>{pack.mod_count} mods</span>
                  </div>
                  {pack.issues.length > 0 && (
                    <ul className="issues">{pack.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                  )}
                  <button className="link" onClick={() => reveal(pack.dir)}>Abrir carpeta ↗</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function errorText(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    return (e as ErrorInfo).message;
  }
  return String(e);
}

export default App;
