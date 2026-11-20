import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import PlayitModal from "./PlayitModal";
import ConsolePanel from "./ConsolePanel";
import {
  Activity,
  ArrowUpRight,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Server,
  Sparkles,
  Square,
  Terminal,
  Wifi,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { JavaInfo, OpLine, PackInfo, ServerInfo, ServerStats, ServerVersion } from "../lib/types";
import Select from "./Select";
import MinecraftScene from "./MinecraftScene";
import ServerDetailView from "./ServerDetailView";
import { Checkbox } from "./ui";

type Props = {
  packs: PackInfo[];
};

const TEMPLATES = [
  "vanilla", "paper", "purpur", "fabric", "forge", "neoforge", "velocity",
];

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function ServersView({ packs }: Props) {
  const { t } = useI18n();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("paper");
  const [version, setVersion] = useState("");
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [port, setPort] = useState(25565);
  const [java, setJava] = useState("java");
  const [detectedJava, setDetectedJava] = useState("");
  const [memory, setMemory] = useState(2048);
  const [motd, setMotd] = useState("Packwright server");
  const [onlineMode, setOnlineMode] = useState(true);
  const [jarUrl, setJarUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consoleServer, setConsoleServer] = useState<ServerInfo | null>(null);
  const [lines, setLines] = useState<OpLine[]>([]);
  const [consoleRunning, setConsoleRunning] = useState(false);
  const [knownPlayers, setKnownPlayers] = useState<string[]>([]);
  const [propertiesServer, setPropertiesServer] = useState<ServerInfo | null>(null);
  const [properties, setProperties] = useState("");
  const [syncPack, setSyncPack] = useState("");
  const [playitOpen, setPlayitOpen] = useState(false);
  const [detailServer, setDetailServer] = useState<ServerInfo | null>(null);

  const refresh = () => {
    invoke<ServerInfo[]>("server_list")
      .then(setServers)
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    invoke<JavaInfo>("java_detect")
      .then((info) => {
        if (info.found) {
          setDetectedJava(info.path);
          setJava(info.path);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      if (cancelled) return;
      setLines((previous) => [...previous.slice(-199), event.payload]);
    }).then((fn) => { if (cancelled) fn(); else unlisten = fn; });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const loadVersions = (provider: string) => {
    let cancelled = false;
    setVersionsLoading(true);
    invoke<ServerVersion[]>("server_versions", { template: provider })
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setVersion(list.find((item) => item.stable)?.id ?? list[0]?.id ?? "1.21.1");
      })
      .catch(() => {
        if (cancelled) return;
        setVersions([]);
        setVersion("1.21.1");
      })
      .finally(() => { if (!cancelled) setVersionsLoading(false); });
    return () => { cancelled = true; };
  };

  useEffect(() => {
    if (!createOpen) return;
    return loadVersions(template);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, template]);

  const openNew = () => {
    setError(null);
    setName("");
    setTemplate("paper");
    setVersion("");
    setPort(25565);
    setJava(detectedJava || "java");
    setMemory(2048);
    setMotd("Packwright server");
    setOnlineMode(true);
    setJarUrl("");
    setShowAdvanced(false);
    setCreateOpen(true);
  };

  const create = async () => {
    const created = await run(() => invoke("server_create", {
      name,
      template,
      version,
      port,
      java,
      jarUrl: jarUrl.trim() || null,
      memory,
      motd: motd.trim() || null,
      onlineMode,
    }));
    if (!created) return;
    setCreateOpen(false);
    setName("");
  };

  const openConsole = (server: ServerInfo) => {
    setLines([]);
    setConsoleServer(server);
    invoke<ServerStats>("server_stats", { name: server.name })
      .then((stats) => setConsoleRunning(stats.running))
      .catch(() => setConsoleRunning(false));
    invoke<string[]>("server_known_players", { name: server.name })
      .then(setKnownPlayers)
      .catch(() => setKnownPlayers([]));
  };

  const start = (server: ServerInfo) => {
    openConsole(server);
    setConsoleRunning(true);
    void run(() => invoke("server_start", {
      name: server.name,
      id: `server-${server.name}-${Date.now()}`,
    }));
  };

  return (
    <div className="view-enter">
      {detailServer ? (
        <ServerDetailView
          server={detailServer}
          onBack={() => { setDetailServer(null); refresh(); }}
        />
      ) : (
        <>
          <section className="mc-hero mc-hero-compact mc-hero-server">
            <MinecraftScene variant="end" />
            <div className="mc-hero-scrim" />
            <div className="mc-hero-content">
              <span className="mc-hero-badge"><Sparkles size={12} /> {t("servers.heroBadge")}</span>
              <h1 className="mt-3 text-[30px] font-semibold tracking-tight">{t("servers.title")}</h1>
              <p className="mt-2 text-[13px] text-muted">{t("servers.subtitle", { count: servers.length })}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="hero-pill"><Server size={12} /> {servers.length} {t("servers.statTotal")}</span>
                <span className="hero-pill"><HardDrive size={12} /> {(servers.reduce((sum, item) => sum + (item.memory ?? 2048), 0) / 1024).toFixed(1)} GB RAM</span>
              </div>
            </div>
            <div className="hero-cta flex gap-2">
              <button className="btn btn-primary" onClick={openNew}><Plus size={15} /> {t("servers.new")}</button>
            </div>
          </section>

          {error && (
            <div className="modal-message error mt-4">{error}</div>
          )}

          {!loading && servers.length === 0 ? (
            <div className="card mt-6 grid place-items-center py-20">
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent"><Server size={20} /></div>
                <p className="mt-4 text-sm font-medium">{t("servers.empty")}</p>
                <p className="mt-1 text-xs text-muted">{t("servers.emptyHint")}</p>
              </div>
            </div>
          ) : (
        <div className="server-grid mt-6">
          {servers.map((server) => (
            <article
              key={server.name}
              className="card server-card"
              role="button"
              tabIndex={0}
              onClick={() => setDetailServer(server)}
              onKeyDown={(event) => { if (event.key === "Enter") setDetailServer(server); }}
            >
              <div className="server-card-banner">
                <div className="server-card-banner-glow" />
                <span className="ui-tag tag-3 absolute right-3 top-3">{server.template}</span>
                <span className="server-card-badge"><Server size={17} /></span>
              </div>
              <div className="p-4 pt-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-[14px] font-semibold">{server.name}</h2>
                    <p className="font-mono text-[10px] text-muted">:{server.port} · {server.version} · {server.memory ?? 2048} MB</p>
                  </div>
                  <ArrowUpRight size={15} className="shrink-0 text-muted" />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
                  <button className="server-action-btn primary" onClick={() => start(server)} title={t("servers.start")}><Play size={13} /></button>
                  <button className="server-action-btn danger" onClick={() => void run(() => invoke("server_stop", { name: server.name }))} title={t("servers.stop")}><Square size={13} /></button>
                  <button className="server-action-btn" onClick={() => openConsole(server)} title={t("servers.console")}><Terminal size={13} /></button>
                  <button className="server-action-btn" onClick={() => void run(() => invoke("server_backup", { name: server.name }))} title={t("servers.backup")}><Copy size={13} /></button>
                  <button className="server-action-btn" onClick={() => void invoke("server_open_folder", { name: server.name })} title={t("packs.folder")}><FolderOpen size={13} /></button>
                  <button className="server-action-btn" onClick={() => setPlayitOpen(true)} title={t("servers.tunnel")}><Wifi size={13} /></button>
                  <button className="server-action-btn" onClick={() => setDetailServer(server)} title={t("servers.details")}><Activity size={13} /></button>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3" onClick={(event) => event.stopPropagation()}>
                  <select className="field !py-1.5 text-[11px]" value={syncPack} onChange={(event) => setSyncPack(event.target.value)}>
                    <option value="">{t("servers.syncSelect")}</option>
                    {packs.map((pack) => <option key={pack.dir} value={pack.dir}>{pack.name}</option>)}
                  </select>
                  <button
                    className="btn btn-secondary shrink-0"
                    disabled={!syncPack}
                    onClick={() => void run(() => invoke("server_sync", { name: server.name, pack: syncPack }))}
                  >
                    <Download size={13} /> {t("servers.sync")}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
          )}
        </>
      )}

      {createOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("servers.new")}>
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-icon running"><Plus size={18} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t("servers.new")}</h2><p className="text-[11px] text-muted">{t("servers.newHint")}</p></div>
              <button className="icon-btn" onClick={() => setCreateOpen(false)}><X size={16} /></button>
            </div>
            <div className="grid gap-3.5 p-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("form.name")}</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="My server" /></label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("servers.template")}</span>
                  <Select
                    id="server-template"
                    value={template}
                    onChange={setTemplate}
                    options={TEMPLATES.map((item) => ({ value: item, label: item.charAt(0).toUpperCase() + item.slice(1) }))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-[1fr_112px] gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="flex h-5 items-center justify-between text-xs text-muted">
                    <span>{template === "velocity" ? t("servers.version") : t("form.minecraft")}</span>
                    <button type="button" className="icon-btn !h-5 !w-5" onClick={() => void loadVersions(template)} title={t("servers.refreshVersions")}>
                      <RefreshCw size={12} className={versionsLoading ? "spin" : ""} />
                    </button>
                  </span>
                  {versions.length > 0 ? (
                    <Select
                      id="server-version"
                      value={version}
                      onChange={setVersion}
                      searchable
                      searchPlaceholder={t("form.search")}
                      emptyLabel={t("form.noResults")}
                      options={versions.map((item) => ({
                        value: item.id,
                        label: item.id,
                        badge: item.stable && item.id === versions.find((candidate) => candidate.stable)?.id ? t("servers.latest") : undefined,
                      }))}
                    />
                  ) : (
                    <input className="field" value={version} onChange={(e) => setVersion(e.target.value)} placeholder={versionsLoading ? t("servers.versionsLoading") : "1.21.1"} />
                  )}
                </label>
                <label className="flex flex-col gap-1.5"><span className="flex h-5 items-center text-xs text-muted">{t("servers.port")}</span><input className="field" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value))} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("servers.memory")} (MB)</span>
                  <input className="field" type="number" min={512} max={16384} step={512} value={memory} onChange={(e) => setMemory(Number(e.target.value))} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("servers.java")}</span>
                  <input className="field font-mono text-[11px]" value={java} onChange={(e) => setJava(e.target.value)} />
                  {!java.trim() && <span className="text-[10px] text-[var(--pw-bad)]">{t("servers.javaMissing")}</span>}
                </label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("servers.motd")}</span><input className="field" value={motd} onChange={(e) => setMotd(e.target.value)} /></label>
              <Checkbox checked={onlineMode} onChange={setOnlineMode} label={t("servers.online")} size="sm" />
              <p className="-mt-1 text-[11px] leading-4 text-muted">{t("servers.versionHint", { provider: template })}</p>
              <details className="group text-sm" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
                <summary className="flex cursor-pointer items-center gap-1.5 py-1 text-xs text-muted transition-colors hover:text-ink">{t("servers.advanced")}</summary>
                <div className="mt-2 flex flex-col gap-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted">{t("servers.jarUrl")}</span>
                    <input className="field font-mono text-[11px]" value={jarUrl} onChange={(e) => setJarUrl(e.target.value)} placeholder="https://…/server.jar" spellCheck={false} />
                  </label>
                  <button className="btn btn-ghost text-[11px]" onClick={() => void openUrl(`https://papermc.io/downloads/${template}`)}>
                    <Download size={12} /> {t("servers.getJar")}
                  </button>
                </div>
              </details>
              {error && <div className="modal-message error">{error}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>{t("common.close")}</button>
              <button className="btn btn-primary" onClick={() => void create()} disabled={busy || !name.trim() || !version.trim()}>
                {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}{t("servers.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {consoleServer && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("servers.console")}>
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <span className="modal-icon running"><Terminal size={18} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{consoleServer.name}</h2><p className="text-[11px] text-muted">{t("servers.console")}</p></div>
              <button className="icon-btn" onClick={() => setConsoleServer(null)}><X size={16} /></button>
            </div>
            <div className="p-4">
              <ConsolePanel
                lines={lines}
                running={consoleRunning}
                height={260}
                playerNames={knownPlayers}
                onClear={() => setLines([])}
                onSend={async (command) => {
                  try {
                    await invoke("server_send", { name: consoleServer.name, command });
                  } catch (cause) {
                    setLines((current) => [...current.slice(-199), {
                      id: `error-${Date.now()}`,
                      stream: "stderr",
                      line: messageOf(cause),
                    }]);
                  }
                }}
              />
              <p className="mt-2 text-[10px] text-muted">{t("servers.commandHint")}</p>
            </div>
          </div>
        </div>
      )}

      {propertiesServer && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("servers.properties")}>
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="modal-icon running"><Server size={18} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t("servers.properties")}</h2><p className="text-[11px] text-muted">{propertiesServer.name}</p></div>
              <button className="icon-btn" onClick={() => setPropertiesServer(null)}><X size={16} /></button>
            </div>
            <div className="p-4"><textarea className="field font-mono text-[11px]" rows={14} value={properties} onChange={(e) => setProperties(e.target.value)} /></div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPropertiesServer(null)}>{t("common.close")}</button>
              <button className="btn btn-primary" onClick={() => void run(() => invoke("server_properties_set", { name: propertiesServer.name, content: properties }))}><Save size={14} />{t("common.save")}</button>
            </div>
          </div>
        </div>
      )}

      {playitOpen && <PlayitModal onClose={() => setPlayitOpen(false)} />}
    </div>
  );
}
