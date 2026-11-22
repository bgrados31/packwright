import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  Download,
  Gamepad2,
  Globe,
  Loader2,
  Play,
  Rocket,
  Server as ServerIcon,
  Square,
  Terminal,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import { messageOf } from "../lib/error";
import type {
  JavaRuntime,
  LauncherInstance,
  LauncherProgress,
  LauncherStatus,
  OpLine,
  PackInfo,
  ServerInfo,
} from "../lib/types";
import PackImage from "./PackImage";
import { Tag } from "./ui";

type LaunchConfig = {
  username: string;
  memory: number;
  fullscreen: boolean;
  width: number;
  height: number;
  server?: string;
  port?: number;
};

function fmtDuration(seconds: number) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function LauncherView({ packs }: { packs: PackInfo[] }) {
  const { t } = useI18n();
  const [instances, setInstances] = useState<LauncherInstance[]>([]);
  const [runtimes, setRuntimes] = useState<JavaRuntime[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [status, setStatus] = useState<LauncherStatus>({ running: false, dir: "", started: 0 });
  const [progress, setProgress] = useState<LauncherProgress | null>(null);
  const [lines, setLines] = useState<OpLine[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [installing, setInstalling] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    void invoke<LauncherInstance[]>("launcher_instances").then(setInstances).catch((cause) => setError(messageOf(cause)));
    void invoke<JavaRuntime[]>("runtime_java_list").then(setRuntimes).catch(() => undefined);
    void invoke<ServerInfo[]>("server_list").then(setServers).catch(() => setServers([]));
    void invoke<LauncherStatus>("launcher_status").then(setStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      void invoke<LauncherStatus>("launcher_status").then(setStatus).catch(() => undefined);
    }, 1500);
    const offProgress = listen<LauncherProgress>("launcher://progress", (event) => {
      setProgress(event.payload);
      if (event.payload.stage === "done") refresh();
    });
    const offLines = listen<OpLine>("launcher://line", (event) => {
      if (event.payload.id === "command") return;
      setLines((current) => [...current.slice(-199), event.payload]);
    });
    return () => {
      window.clearInterval(timer);
      void offProgress.then((fn) => fn());
      void offLines.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [lines]);

  const active = instances.find((item) => item.dir === selected)
    ?? instances.find((item) => item.dir === status.dir)
    ?? null;
  const visibleLines = useMemo(
    () => lines.filter((line) => line.id === (active?.dir ?? selected)),
    [lines, active?.dir, selected],
  );

  const installJava = async (major: number) => {
    setInstalling((current) => [...current, major]);
    setError(null);
    try {
      await invoke("runtime_java_install", { major });
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setInstalling((current) => current.filter((item) => item !== major));
    }
  };

  const installPack = async (item: LauncherInstance) => {
    setBusy(true);
    setError(null);
    try {
      await invoke("launcher_install", {
        dir: item.dir,
        mcVersion: item.mc || "1.21.1",
        loader: item.loader || "vanilla",
        loaderVersion: null,
      });
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    try {
      await invoke("launcher_stop");
      setStatus({ running: false, dir: "", started: 0 });
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const startServerAndJoin = async (server: ServerInfo) => {
    await invoke("server_start", { name: server.name, id: `launcher-join-${Date.now()}` });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      const list = await invoke<ServerInfo[]>("server_list");
      if (list.find((item) => item.name === server.name)?.running) return;
    }
    throw new Error(t("launcher.serverTimeout"));
  };

  const launch = async (item: LauncherInstance, config: LaunchConfig, autoStartServer?: ServerInfo) => {
    setBusy(true);
    setError(null);
    try {
      if (autoStartServer && !autoStartServer.running) {
        await startServerAndJoin(autoStartServer);
      }
      await invoke("launcher_play", {
        dir: item.dir,
        options: {
          mcVersion: item.mc || "1.21.1",
          loader: item.loader || "vanilla",
          loaderVersion: null,
          memory: config.memory,
          username: config.username,
          server: config.server,
          port: config.port,
          fullscreen: config.fullscreen,
          width: config.width,
          height: config.height,
        },
      });
      setSelected(item.dir);
      setLines([]);
      setModal(null);
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const launchFromModal = (item: LauncherInstance, config: LaunchConfig, server: ServerInfo | null) => {
    if (!item.runtime_ready) {
      void installPack(item).then(() => {
        const updated = { ...item, runtime_ready: true };
        void launch(updated, config, server ?? undefined);
      });
      return;
    }
    void launch(item, config, server ?? undefined);
  };

  const ready = instances.filter((item) => item.runtime_ready).length;
  const totalPlaytime = instances.reduce((sum, item) => sum + item.playtime, 0);
  const needed = [...new Set(instances.map((item) => item.java_major))];

  return (
    <div className="view-enter">
      <div className="launcher-hero">
        <div className="launcher-hero-grid" />
        <div className="relative z-10">
          <span className="mc-hero-badge"><Rocket size={12} /> {t("launcher.badge")}</span>
          <h1 className="mt-3 text-[30px] font-semibold tracking-tight">{t("launcher.title")}</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted">{t("launcher.subtitle")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="hero-pill"><Gamepad2 size={12} /> {instances.length} {t("launcher.packs")}</span>
            <span className="hero-pill"><Check size={12} /> {ready} {t("launcher.ready")}</span>
            <span className="hero-pill"><Clock size={12} /> {fmtDuration(totalPlaytime)} {t("launcher.played")}</span>
          </div>
        </div>
        <div className="launcher-hero-art"><Gamepad2 size={96} strokeWidth={0.8} /></div>
      </div>

      {error && (
        <div className="launcher-error mt-4">
          <AlertTriangle size={15} />
          <span className="min-w-0 flex-1">{error}</span>
          <button className="icon-btn !h-6 !w-6" onClick={() => setError(null)} aria-label={t("common.close")}><X size={13} /></button>
        </div>
      )}

      {status.running && (
        <div className="launcher-now mt-4">
          <span className="status-dot inline-block h-2 w-2 rounded-full bg-ok" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">{t("launcher.nowPlaying")}: {instances.find((item) => item.dir === status.dir)?.name ?? status.dir}</p>
            <p className="font-mono text-[10px] text-muted">
              {t("launcher.session")} {fmtDuration(Math.max(0, Math.floor(Date.now() / 1000) - status.started))}
            </p>
          </div>
          {progress && (
            <div className="launcher-progress">
              <div className="launcher-progress-bar" style={{ width: `${progress.percent}%` }} />
              <span className="truncate">{progress.label}</span>
            </div>
          )}
          <button className="btn btn-ghost" onClick={() => void stop()}><Square size={13} /> {t("launcher.stop")}</button>
        </div>
      )}

      <div className="mt-6 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="card p-4">
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-accent" />
            <h2 className="text-sm font-semibold">{t("launcher.runtimes")}</h2>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted">{t("launcher.runtimeHint")}</p>
          <div className="mt-3 space-y-2">
            {runtimes.filter((item) => !item.system).map((runtime) => {
              const requiredBy = instances.filter((item) => item.java_major === runtime.major).length;
              return (
                <div key={runtime.major} className="runtime-row">
                  <span className={`runtime-dot ${runtime.installed ? "ok" : ""}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium">Java {runtime.major}</p>
                    <p className="truncate font-mono text-[10px] text-muted">
                      {runtime.installed ? runtime.home : t("launcher.notInstalled")}
                    </p>
                  </div>
                  {requiredBy > 0 && <span className="chip">{requiredBy}</span>}
                  {!runtime.installed && (
                    <button
                      className="btn btn-secondary !px-2 !py-1 text-[11px]"
                      disabled={installing.includes(runtime.major)}
                      onClick={() => void installJava(runtime.major)}
                      title={t("launcher.installJava")}
                    >
                      {installing.includes(runtime.major) ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {needed.some((major) => !runtimes.some((runtime) => runtime.major === major && runtime.installed)) && (
            <p className="mt-3 text-[10px] text-muted">{t("launcher.autoHint")}</p>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("launcher.instances")}</h2>
            <span className="font-mono text-[10px] text-muted">{instances.length}</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {instances.map((item) => {
              const pack = packs.find((entry) => entry.dir === item.dir);
              const running = status.running && status.dir === item.dir;
              return (
                <div key={item.dir} className={`launch-card ${running ? "running" : ""} ${selected === item.dir ? "selected" : ""}`}>
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setSelected(item.dir)}>
                    <PackImage dir={item.dir} path={pack?.icon ?? null} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{item.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted">
                        MC {item.mc || "—"} · {item.loader || "vanilla"}
                      </p>
                    </div>
                  </button>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Tag seed={item.loader || "vanilla"}>{item.loader || "vanilla"}</Tag>
                    <span className={`runtime-chip ${item.runtime_ready ? "ok" : ""}`}>
                      {item.runtime_ready ? <Check size={10} /> : <Download size={10} />}
                      Java {item.java_major}
                    </span>
                    <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted">
                      <Clock size={10} /> {fmtDuration(item.playtime)}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="btn btn-primary flex-1"
                      disabled={busy || (status.running && !running)}
                      onClick={() => setModal(item.dir)}
                    >
                      {running ? <Square size={13} /> : item.runtime_ready ? <Play size={13} /> : <Download size={13} />}
                      {running ? t("launcher.stop") : item.runtime_ready ? t("launcher.play") : t("launcher.installAndPlay")}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setSelected(item.dir)} title={t("launcher.console")}>
                      <Terminal size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
            {instances.length === 0 && (
              <div className="card col-span-full grid place-items-center py-12 text-sm text-muted">{t("launcher.empty")}</div>
            )}
          </div>
        </section>
      </div>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-accent" />
            <span className="text-[12px] font-semibold">{t("launcher.console")}</span>
            {active && <span className="font-mono text-[10px] text-muted">{active.name}</span>}
          </div>
          <button className="btn btn-quiet text-[11px]" onClick={() => setLines([])}>{t("common.clear")}</button>
        </div>
        <div className="console-box !m-3 !h-56" ref={consoleRef}>
          {visibleLines.length === 0 ? (
            <p className="console-placeholder"><Gamepad2 size={13} /> {t("launcher.consoleHint")}</p>
          ) : (
            visibleLines.map((line, index) => (
              <p key={`${line.id}-${index}`} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>{line.line}</p>
            ))
          )}
        </div>
      </section>

      {modal && (
        <LaunchModal
          item={instances.find((item) => item.dir === modal)!}
          servers={servers}
          busy={busy}
          onClose={() => setModal(null)}
          onLaunch={launchFromModal}
        />
      )}
    </div>
  );
}

function LaunchModal({
  item,
  servers,
  busy,
  onClose,
  onLaunch,
}: {
  item: LauncherInstance;
  servers: ServerInfo[];
  busy: boolean;
  onClose: () => void;
  onLaunch: (item: LauncherInstance, config: LaunchConfig, server: ServerInfo | null) => void;
}) {
  const { t } = useI18n();
  const [username, setUsername] = useState("Player");
  const [memory, setMemory] = useState(2048);
  const [fullscreen, setFullscreen] = useState(false);
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [serverName, setServerName] = useState("");
  const [custom, setCustom] = useState("");
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    void invoke<{ memory?: number; username?: string; fullscreen?: boolean; width?: number; height?: number }>("launcher_profile", { dir: item.dir })
      .then((profile) => {
        if (profile.memory) setMemory(profile.memory);
        if (profile.username) setUsername(profile.username);
        if (typeof profile.fullscreen === "boolean") setFullscreen(profile.fullscreen);
        if (profile.width) setWidth(profile.width);
        if (profile.height) setHeight(profile.height);
      })
      .catch(() => undefined);
  }, [item.dir]);

  const chosenServer = servers.find((server) => server.name === serverName) ?? null;
  const config: LaunchConfig = {
    username: username.trim() || "Player",
    memory,
    fullscreen,
    width,
    height,
    server: chosenServer ? "127.0.0.1" : custom.trim() || undefined,
    port: chosenServer?.port,
  };

  const save = () => {
    void invoke("launcher_profile_set", {
      dir: item.dir,
      profile: {
        memory,
        username: config.username,
        fullscreen,
        width,
        height,
        java_major: item.java_major,
        auto_runtime: true,
      },
    });
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("launcher.options")}>
      <div className="modal-card launcher-modal">
        <div className="modal-header">
          <span className="modal-icon running"><Gamepad2 size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{item.name}</h2>
            <p className="text-[11px] text-muted">
              MC {item.mc} · {item.loader} · Java {item.java_major}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("common.close")}><X size={16} /></button>
        </div>

        <div className="launcher-modal-body">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="launcher-label"><Users size={12} /> {t("launcher.username")}</span>
              <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={16} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="launcher-label"><Cpu size={12} /> {t("launcher.memory")}: {memory} MB</span>
              <input type="range" min={512} max={8192} step={512} value={memory} onChange={(event) => setMemory(Number(event.target.value))} />
            </label>
          </div>

          <div className="mt-3">
            <span className="launcher-label"><Wifi size={12} /> {t("launcher.connect")}</span>
            <div className="mt-1.5 grid gap-2">
              <button
                className={`server-choice ${!serverName && !custom ? "active" : ""}`}
                onClick={() => { setServerName(""); setCustom(""); }}
              >
                <Globe size={13} /> {t("launcher.singleplayer")}
              </button>
              {servers.map((server) => (
                <button
                  key={server.name}
                  className={`server-choice ${serverName === server.name ? "active" : ""}`}
                  onClick={() => { setServerName(server.name); setCustom(""); }}
                >
                  <ServerIcon size={13} />
                  <span className="min-w-0 flex-1 truncate text-left">{server.name}</span>
                  <span className="font-mono text-[10px] text-muted">127.0.0.1:{server.port}</span>
                  {!server.running && <span className="chip chip-accent">{t("launcher.autoStart")}</span>}
                </button>
              ))}
              <div className="flex items-center gap-2">
                <input
                  className="field !py-1.5 text-[11px]"
                  placeholder={t("launcher.customServer")}
                  value={custom}
                  onChange={(event) => { setCustom(event.target.value); setServerName(""); }}
                />
                <ChevronDown size={13} className="text-muted" />
              </div>
            </div>
          </div>

          <button className="mt-3 text-[11px] text-muted hover:text-ink" onClick={() => setAdvanced((value) => !value)}>
            {t("launcher.advanced")} {advanced ? "▴" : "▾"}
          </button>
          {advanced && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={fullscreen} onChange={(event) => setFullscreen(event.target.checked)} />
                {t("launcher.fullscreen")}
              </label>
              {!fullscreen && (
                <>
                  <div className="flex items-center gap-2 text-[11px]">
                    {t("launcher.width")} <input className="field !w-20 !px-2 !py-1" type="number" value={width} onChange={(event) => setWidth(Number(event.target.value))} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {t("launcher.height")} <input className="field !w-20 !px-2 !py-1" type="number" value={height} onChange={(event) => setHeight(Number(event.target.value))} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="text-[10px] text-muted">{t("launcher.localOnly")}</span>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => { save(); onClose(); }}>{t("common.close")}</button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => { save(); onLaunch(item, config, chosenServer); }}
            >
              {busy ? <Loader2 size={14} className="spin" /> : item.runtime_ready ? <Play size={14} /> : <Download size={14} />}
              {item.runtime_ready ? t("launcher.play") : t("launcher.installAndPlay")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
