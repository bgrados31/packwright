import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Download,
  FolderOpen,
  Gamepad2,
  Loader2,
  Pencil,
  Play,
  Plus,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { messageOf } from "../lib/error";
import MinecraftScene from "./MinecraftScene";
import type {
  InstanceConfig,
  InstanceInfo,
  InstanceInput,
  JavaRuntime,
  LauncherProgress,
  LauncherStatus,
  LoaderVersion,
  McVersion,
  OpLine,
  PackInfo,
  ServerInfo,
} from "../lib/types";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

type Props = { packs: PackInfo[]; createNonce?: number };

function requiredJava(mc: string): number {
  const legacy = mc.trim().startsWith("1.");
  const parts = mc.trim().replace(/^1\./, "").split(".").map(Number);
  const major = parts[0] || (legacy ? 8 : 21);
  const minor = parts[1] || 0;
  if (!legacy) return 21;
  return major >= 21 || (major === 20 && minor >= 5) ? 21 : major >= 17 ? 17 : 8;
}

function fmtDuration(seconds: number) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function InstanceIcon({ instance, className = "h-11 w-11 rounded-lg" }: { instance: InstanceInfo; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    invoke<string>("instance_icon_get", { id: instance.config.id })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [instance.config.id, instance.config.updated_at]);
  return src ? <img src={src} alt="" className={`${className} object-cover`} /> : (
    <span className={`${className} grid place-items-center bg-subtle text-accent`}><Gamepad2 size={18} /></span>
  );
}

const emptyForm: InstanceInput & {
  memory: number; username: string; java_path: string;
  fullscreen: boolean; width: number; height: number; jvm_args: string;
} = {
  name: "", mc_version: "1.21.1", loader: "vanilla", loader_version: null,
  linked_pack: "", linked_server: "", memory: 2048, username: "Player", java_path: "",
  fullscreen: false, width: 1280, height: 720, jvm_args: "",
};

export default function LauncherView({ packs, createNonce = 0 }: Props) {
  const { t } = useI18n();
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [versions, setVersions] = useState<McVersion[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [runtimes, setRuntimes] = useState<JavaRuntime[]>([]);
  const [status, setStatus] = useState<LauncherStatus>({ running: false, dir: "", started: 0 });
  const [progress, setProgress] = useState<LauncherProgress | null>(null);
  const [lines, setLines] = useState<OpLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | "clone" | "delete" | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [cloneName, setCloneName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iconInput = useRef<HTMLInputElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    void invoke<InstanceInfo[]>("instance_list").then(setInstances).catch((cause) => setError(messageOf(cause)));
    void invoke<ServerInfo[]>("server_list").then(setServers).catch(() => setServers([]));
    void invoke<JavaRuntime[]>("runtime_java_list").then(setRuntimes).catch(() => undefined);
    void invoke<LauncherStatus>("launcher_status").then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    void invoke<McVersion[]>("versions_catalog").then(setVersions).catch(() => setVersions([]));
    const timer = window.setInterval(() => {
      void invoke<LauncherStatus>("launcher_status").then(setStatus).catch(() => undefined);
    }, 1500);
    const offProgress = listen<LauncherProgress>("launcher://progress", (event) => {
      setProgress(event.payload);
      if (event.payload.stage === "done") refresh();
    });
    const offLines = listen<OpLine>("launcher://line", (event) => {
      setLines((current) => [...current.slice(-199), event.payload]);
    });
    return () => {
      window.clearInterval(timer);
      void offProgress.then((fn) => fn());
      void offLines.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(() => {
    if (!createNonce) return;
    setForm({ ...emptyForm });
    setModal("create");
  }, [createNonce]);

  useEffect(() => {
    if (!form.loader || form.loader === "vanilla") { setLoaderVersions([]); return; }
    let cancelled = false;
    void invoke<LoaderVersion[]>("versions_loader", { loader: form.loader, mcVersion: form.mc_version })
      .then((list) => { if (!cancelled) setLoaderVersions(list); })
      .catch(() => { if (!cancelled) setLoaderVersions([]); });
    return () => { cancelled = true; };
  }, [form.loader, form.mc_version]);

  useEffect(() => { consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight }); }, [lines]);

  const selected = instances.find((item) => item.config.id === selectedId) ?? null;
  const activeLines = useMemo(
    () => lines.filter((line) => line.id === (selected?.config.id ?? status.dir)),
    [lines, selected?.config.id, status.dir],
  );
  const linkedPack = packs.find((pack) => pack.dir === form.linked_pack);
  const estimatedMods = linkedPack?.mod_count ?? 0;

  const stateOf = (item: InstanceInfo) => {
    switch (item.state) {
      case "playing": return { label: t("instances.statePlaying"), tone: "ok" };
      case "installing": return { label: t("instances.stateInstalling"), tone: "accent" };
      case "error": return { label: t("instances.stateError"), tone: "warn" };
      case "needs-install": return { label: t("instances.stateNeedsInstall"), tone: "warn" };
      default: return { label: t("instances.stateReady"), tone: "ok" };
    }
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setError(null);
    setModal("create");
  };

  const openEdit = (instance: InstanceInfo) => {
    const c = instance.config;
    setForm({
      name: c.name, mc_version: c.mc_version, loader: c.loader, loader_version: c.loader_version,
      linked_pack: c.linked_pack ?? "", linked_server: c.linked_server ?? "", memory: c.memory,
      username: c.username, java_path: c.java_path,
      fullscreen: c.fullscreen, width: c.width, height: c.height,
      jvm_args: c.jvm_args.join("\n"),
    });
    setSelectedId(c.id);
    setModal("edit");
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (modal === "create") {
        await invoke("instance_create", {
          input: {
            name: form.name, mc_version: form.mc_version, loader: form.loader,
            loader_version: form.loader_version || null,
            linked_pack: form.linked_pack, linked_server: form.linked_server,
          },
        });
      } else if (modal === "edit" && selected) {
        const config: InstanceConfig = {
          ...selected.config,
          name: form.name, mc_version: form.mc_version, loader: form.loader,
          loader_version: form.loader_version || null,
          linked_pack: form.linked_pack ?? "", linked_server: form.linked_server ?? "",
          memory: form.memory, username: form.username, java_path: form.java_path,
          fullscreen: form.fullscreen, width: form.width, height: form.height,
          jvm_args: form.jvm_args.split("\n").map((line) => line.trim()).filter(Boolean),
        };
        await invoke("instance_update", { config });
      }
      setModal(null);
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const install = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await invoke("instance_install", { id });
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const play = async (instance: InstanceInfo, server?: ServerInfo | null) => {
    setBusy(true);
    setError(null);
    try {
      if (!instance.runtime_ready) await invoke("instance_install", { id: instance.config.id });
      let address: string | undefined;
      let port: number | undefined;
      if (server) {
        if (!server.running) {
          await invoke("server_start", { name: server.name, id: `instance-${Date.now()}` });
          for (let i = 0; i < 12; i += 1) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000));
            const list = await invoke<ServerInfo[]>("server_list");
            if (list.find((item) => item.name === server.name)?.running) break;
          }
        }
        address = "127.0.0.1";
        port = server.port;
      }
      await invoke("instance_play", {
        id: instance.config.id,
        server: address ?? null,
        port: port ?? null,
      });
      setSelectedId(instance.config.id);
      setLines([]);
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    await invoke("launcher_stop");
    setStatus({ running: false, dir: "", started: 0 });
    refresh();
  };

  const clone = async () => {
    if (!selected || !cloneName.trim()) return;
    setBusy(true);
    try {
      const created = await invoke<InstanceInfo>("instance_clone", { id: selected.config.id, newName: cloneName.trim() });
      setModal(null);
      setSelectedId(created.config.id);
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    try {
      await invoke("instance_delete", { id: selected.config.id, confirm: selected.config.name });
      setModal(null);
      setSelectedId(null);
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const setIcon = async (files: FileList | null) => {
    if (!selected || !files?.length) return;
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    await invoke("instance_icon_set", { id: selected.config.id, bytes: Array.from(bytes) });
    refresh();
  };

  const stats = useMemo(() => {
    const ready = instances.filter((item) => item.runtime_ready).length;
    const playing = instances.filter((item) => item.state === "playing").length;
    const installing = instances.filter((item) => item.state === "installing").length;
    const withError = instances.filter((item) => item.state === "error").length;
    const playtime = instances.reduce((sum, item) => sum + item.playtime, 0);
    return { ready, playing, installing, withError, playtime };
  }, [instances]);

  return (
    <div className="view-enter">
      {/* Hero: tipo splash screen de Minecraft */}
      <section className="mc-hero">
        <MinecraftScene />
        <div className="mc-hero-scrim" />
        <div className="mc-hero-content">
          <span className="mc-hero-badge"><Gamepad2 size={12} /> {t("instances.badge")}</span>
          <h1 className="mt-3 max-w-xl text-[30px] font-semibold leading-[1.15] tracking-tight drop-shadow-sm">
            {t("instances.title")}
          </h1>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted">{t("instances.subtitle")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="hero-pill"><Check size={12} /> {stats.ready} {t("instances.statReady")}</span>
            <span className="hero-pill"><Clock size={12} /> {stats.installing} {t("instances.statInstalling")}</span>
            <span className="hero-pill"><Gamepad2 size={12} /> {stats.playing} {t("instances.statPlaying")}</span>
            <span className="hero-pill"><Play size={12} /> {stats.withError} {t("instances.statErrors")}</span>
            <span className="hero-pill"><Plus size={12} /> {fmtDuration(stats.playtime)} {t("launcher.played")}</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="launcher-error mt-5">
          <AlertTriangle size={15} /><span className="min-w-0 flex-1">{error}</span>
          <button className="icon-btn !h-6 !w-6" onClick={() => setError(null)} aria-label={t("common.close")}><X size={13} /></button>
        </div>
      )}

      {status.running && (
        <div className="launcher-now mt-5">
          <span className="status-dot inline-block h-2 w-2 rounded-full bg-ok" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">{t("launcher.nowPlaying")}: {instances.find((item) => item.config.id === status.dir)?.config.name ?? status.dir}</p>
            <p className="font-mono text-[10px] text-muted">{t("launcher.session")} {fmtDuration(Math.max(0, Math.floor(Date.now() / 1000) - status.started))}</p>
          </div>
          {progress && (
            <div className="launcher-progress">
              <div className="launcher-progress-bar" style={{ width: `${progress.percent}%` }} />
              <span className="truncate">{progress.label}</span>
            </div>
          )}
          <button className="btn btn-ghost" onClick={() => void stop()}><X size={13} /> {t("launcher.stop")}</button>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("instances.yourInstances")}</h2>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> {t("instances.new")}</button>
      </div>

      {instances.length === 0 ? (
        <div className="launcher-card launcher-card-new mt-4" onClick={openCreate}>
          <span className="launcher-card-icon">+</span>
          <span className="launcher-card-text">{t("instances.empty")}</span>
        </div>
      ) : (
        <div className="launcher-cards mt-4">
          {instances.map((instance) => {
            const isPlaying = status.running && status.dir === instance.config.id;
            const state = stateOf(instance);
            return (
              <div
                key={instance.config.id}
                className={`launcher-card ${selectedId === instance.config.id ? "active" : ""} ${isPlaying ? "running" : ""} ${instance.state === "error" ? "error" : ""}`}
              >
                <InstanceIcon instance={instance} />
                <button className="launcher-card-text flex-1 text-left" onClick={() => setSelectedId(instance.config.id)}>
                  <p className="launcher-card-title truncate">{instance.config.name}</p>
                  <p className="launcher-card-meta truncate">MC {instance.config.mc_version} · {instance.config.loader}</p>
                  <p className="launcher-card-meta mt-0.5 truncate"><Clock size={10} /> {fmtDuration(instance.playtime)}</p>
                </button>
                <span className={`chip chip-${state.tone} mt-1`}>
                  {state.tone === "accent" ? <Loader2 size={10} className="spin" /> : <Check size={10} />}
                  {state.label}
                </span>
                <button className="btn btn-primary" disabled={busy || (status.running && !isPlaying)} onClick={() => void play(instance)}>
                  {isPlaying ? <X size={13} /> : instance.runtime_ready ? <Play size={13} /> : <Download size={13} />}
                  {isPlaying ? t("launcher.stop") : instance.runtime_ready ? t("launcher.play") : t("launcher.installAndPlay")}
                </button>
                <button className="btn btn-secondary" onClick={() => openEdit(instance)} title={t("instances.edit")}><Pencil size={13} /></button>
              </div>
            );
          })}
          <div className="launcher-card launcher-card-new" onClick={openCreate}>
            <span className="launcher-card-icon">+</span>
            <span className="launcher-card-text">{t("instances.new")}</span>
          </div>
        </div>
      )}

      {selected && (
        <section className="card mt-6 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <InstanceIcon instance={selected} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold">{selected.config.name}</h3>
              <p className="truncate font-mono text-[10px] text-muted">{selected.path}</p>
            </div>
            <button className="btn btn-secondary" onClick={() => iconInput.current?.click()}><FolderOpen size={13} /> {t("instances.icon")}</button>
            <button className="btn btn-secondary" onClick={() => { setCloneName(`${selected.config.name} copy`); setModal("clone"); }}><Copy size={13} /> {t("instances.clone")}</button>
            <button className="btn btn-ghost text-bad" onClick={() => setModal("delete")}><X size={13} /> {t("instances.delete")}</button>
            <input ref={iconInput} type="file" accept="image/*" className="hidden" onChange={(event) => void setIcon(event.target.files)} />
          </div>
          {!selected.runtime_ready && (
            <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
              <Download size={12} /> {t("instances.stateNeedsInstall")}
              <button className="btn btn-secondary" disabled={busy} onClick={() => void install(selected.config.id)}><Download size={12} /> {t("instances.install")}</button>
            </p>
          )}
          {selected.error && <p className="launcher-error mt-3"><AlertTriangle size={14} /> {selected.error}</p>}
          <div className="mt-4 grid gap-1 text-[11px] sm:grid-cols-4">
            <p><span className="text-muted">{t("instances.mcVersion")}:</span> {selected.config.mc_version}</p>
            <p><span className="text-muted">{t("instances.loader")}:</span> {selected.config.loader} {selected.config.loader_version ?? ""}</p>
            <p><span className="text-muted">{t("instances.memory")}:</span> {selected.config.memory} MB</p>
            <p><span className="text-muted">{t("instances.runtime")}:</span> Java {selected.config.java_major}</p>
            <p><span className="text-muted">{t("instances.username")}:</span> {selected.config.username}</p>
            <p><span className="text-muted">{t("instances.linkedPack")}:</span> {selected.config.linked_pack || "—"}</p>
            <p><span className="text-muted">{t("instances.linkedServer")}:</span> {selected.config.linked_server || "—"}</p>
            <p><span className="text-muted">{t("instances.jvmArgs")}:</span> {selected.config.jvm_args.join(" · ") || "—"}</p>
            <p><span className="text-muted">{t("instances.mods")}:</span> {selected.mods}</p>
            <p><span className="text-muted">{t("instances.created")}:</span> {new Date(selected.config.created_at * 1000).toLocaleDateString()}</p>
            <p><span className="text-muted">{t("instances.state")}:</span> {stateOf(selected).label}</p>
          </div>
        </section>
      )}

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Gamepad2 size={14} className="text-accent" />
            <span className="text-[12px] font-semibold">{t("launcher.console")}</span>
            {selected && <span className="font-mono text-[10px] text-muted">{selected.config.name}</span>}
          </div>
          <button className="btn btn-quiet text-[11px]" onClick={() => setLines([])}>{t("common.clear")}</button>
        </div>
        <div className="console-box !m-3 !h-64" ref={consoleRef}>
          {activeLines.length === 0 ? (
            <p className="console-placeholder"><Gamepad2 size={13} /> {t("launcher.consoleHint")}</p>
          ) : (
            activeLines.map((line, index) => (
              <p key={`${line.id}-${index}`} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>{line.line}</p>
            ))
          )}
        </div>
      </section>

      {(modal === "create" || modal === "edit") && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={modal === "create" ? t("instances.new") : t("instances.edit")}>
          <div className="modal-card instances-modal">
            <div className="modal-header">
              <span className="modal-icon running"><Gamepad2 size={18} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">{modal === "create" ? t("instances.new") : t("instances.edit")}</h2>
                <p className="text-[11px] text-muted">{t("instances.formHint")}</p>
              </div>
              <button className="icon-btn" onClick={() => setModal(null)} aria-label={t("common.close")}><X size={16} /></button>
            </div>
            <div className="instances-form">
              <label className="flex flex-col gap-1">
                <span className="launcher-label">{t("instances.name")}</span>
                <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Kitchen Sink" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="launcher-label">{t("instances.mcVersion")}</span>
                  <select className="field" value={form.mc_version} onChange={(event) => setForm({ ...form, mc_version: event.target.value, loader_version: null })}>
                    {versions.filter((version) => version.kind === "release").slice(0, 60).map((version) => (
                      <option key={version.id} value={version.id}>{version.id}</option>
                    ))}
                    {versions.length === 0 && <option value={form.mc_version}>{form.mc_version}</option>}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="launcher-label">{t("instances.loader")}</span>
                  <select className="field" value={form.loader} onChange={(event) => setForm({ ...form, loader: event.target.value, loader_version: null })}>
                    {["vanilla", "fabric", "quilt", "forge", "neoforge"].map((loader) => <option key={loader} value={loader}>{loader}</option>)}
                  </select>
                </label>
              </div>
              {form.loader !== "vanilla" && (
                <label className="flex flex-col gap-1">
                  <span className="launcher-label">{t("instances.loaderVersion")}</span>
                  <select className="field" value={form.loader_version ?? ""} onChange={(event) => setForm({ ...form, loader_version: event.target.value || null })}>
                    <option value="">{t("instances.recommended")}</option>
                    {loaderVersions.map((version) => <option key={version.id} value={version.id}>{version.id}{version.stable ? " ✓" : ""}</option>)}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="launcher-label">{t("instances.linkedPack")}</span>
                  <select className="field" value={form.linked_pack} onChange={(event) => setForm({ ...form, linked_pack: event.target.value })}>
                    <option value="">—</option>
                    {packs.map((pack) => <option key={pack.dir} value={pack.dir}>{pack.name}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="launcher-label">{t("instances.linkedServer")}</span>
                  <select className="field" value={form.linked_server} onChange={(event) => setForm({ ...form, linked_server: event.target.value })}>
                    <option value="">—</option>
                    {servers.map((server) => <option key={server.name} value={server.name}>{server.name} ({server.port})</option>)}
                  </select>
                </label>
              </div>
              {modal === "edit" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="launcher-label">{t("instances.memory")}: {form.memory} MB</span>
                      <input type="range" min={512} max={8192} step={512} value={form.memory} onChange={(event) => setForm({ ...form, memory: Number(event.target.value) })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="launcher-label">{t("launcher.username")}</span>
                      <input className="field" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="launcher-label">{t("instances.runtime")}</span>
                    <select className="field" value={form.java_path} onChange={(event) => setForm({ ...form, java_path: event.target.value })}>
                      <option value="">{t("instances.managedRuntime")}</option>
                      {runtimes.filter((runtime) => runtime.installed).map((runtime) => (
                        <option key={runtime.major} value={runtime.path}>{runtime.label} — {runtime.path}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-[11px]">
                    <input type="checkbox" checked={form.fullscreen} onChange={(event) => setForm({ ...form, fullscreen: event.target.checked })} />
                    {t("launcher.fullscreen")}
                  </label>
                  {!form.fullscreen && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="launcher-label">{t("launcher.width")}</span>
                        <input className="field" type="number" min={640} max={3840} value={form.width}
                          onChange={(event) => setForm({ ...form, width: Number(event.target.value) })} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="launcher-label">{t("launcher.height")}</span>
                        <input className="field" type="number" min={480} max={2160} value={form.height}
                          onChange={(event) => setForm({ ...form, height: Number(event.target.value) })} />
                      </label>
                    </div>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="launcher-label">{t("instances.jvmArgs")}</span>
                    <textarea
                      className="field font-mono text-[11px]"
                      rows={3}
                      value={form.jvm_args}
                      placeholder={"-XX:+UseG1GC\n-Dfml.earlyprogresswindow=false"}
                      onChange={(event) => setForm({ ...form, jvm_args: event.target.value })}
                    />
                    <span className="text-[10px] text-muted">{t("instances.jvmArgsHint")}</span>
                  </label>
                </>
              )}
              <div className="instances-preview">
                <p className="roots-panel-title">{t("instances.preview")}</p>
                <div className="mt-2 grid grid-cols-2 gap-y-1 text-[11px]">
                  <span className="text-muted">{t("instances.name")}</span><span className="truncate">{form.name || "—"}</span>
                  <span className="text-muted">{t("instances.version")}</span><span>Minecraft {form.mc_version} · {form.loader} {form.loader_version ?? ""}</span>
                  <span className="text-muted">{t("instances.java")}</span><span>Java {requiredJava(form.mc_version)}{form.java_path ? " (custom)" : " (managed)"}</span>
                  <span className="text-muted">{t("instances.mods")}</span><span>{estimatedMods}</span>
                  <span className="text-muted">{t("instances.state")}</span><span>{t("instances.willInstall")}</span>
                </div>
              </div>
              {error && <p className="text-[11px] text-bad">{error}</p>}
            </div>
            <div className="modal-footer">
              <span className="text-[10px] text-muted">{t("instances.localOnly")}</span>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => setModal(null)}>{t("common.close")}</button>
                <button className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={() => void save()}>
                  {busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                  {modal === "create" ? t("instances.create") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal === "clone" && selected && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 420 }}>
            <div className="modal-header"><span className="modal-icon running"><Copy size={18} /></span><div className="flex-1"><h2 className="text-sm font-semibold">{t("instances.clone")}</h2></div><button className="icon-btn" onClick={() => setModal(null)}><X size={16} /></button></div>
            <div className="p-4"><input className="field" value={cloneName} onChange={(event) => setCloneName(event.target.value)} /></div>
            <div className="modal-footer"><span /><div className="flex gap-2"><button className="btn btn-secondary" onClick={() => setModal(null)}>{t("common.close")}</button><button className="btn btn-primary" disabled={!cloneName.trim()} onClick={() => void clone()}>{t("instances.clone")}</button></div></div>
          </div>
        </div>
      )}

      {modal === "delete" && selected && (
        <ConfirmDeleteModal kind="instance" name={selected.config.name} onCancel={() => setModal(null)} onConfirm={remove} />
      )}
    </div>
  );
}
