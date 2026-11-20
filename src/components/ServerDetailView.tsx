import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Copy,
  Database,
  FileCode2,
  Folder,
  FolderOpen,
  HardDrive,
  Play,
  RefreshCw,
  Save,
  Square,
  Users,
} from "lucide-react";
import { useI18n } from "../i18n";
import type {
  OpLine,
  ServerActivity,
  ServerFileEntry,
  ServerInfo,
  ServerPlayers,
  ServerStats,
} from "../lib/types";
import { Checkbox } from "./ui";

type Props = {
  server: ServerInfo;
  onBack: () => void;
};

const TABS = ["overview", "console", "files", "players", "properties"] as const;
type Tab = (typeof TABS)[number];

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function uptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

type Properties = Record<string, string>;

function parseProperties(text: string): Properties {
  const values: Properties = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator > 0) {
      values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    }
  }
  return values;
}

function stringifyProperties(values: Properties): string {
  return `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

function PropField({
  label,
  value,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  options?: string[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted">{label}</span>
      {options ? (
        <select className="field text-[12px]" value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input className="field text-[12px]" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

export default function ServerDetailView({ server, onBack }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [activity, setActivity] = useState<ServerActivity | null>(null);
  const [players, setPlayers] = useState<ServerPlayers | null>(null);
  const [files, setFiles] = useState<ServerFileEntry[]>([]);
  const [folder, setFolder] = useState("");
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [properties, setProperties] = useState<Properties>({});
  const [eula, setEula] = useState(false);
  const [nogui, setNogui] = useState(true);
  const [lines, setLines] = useState<OpLine[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);
  const [command, setCommand] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<ServerStats>("server_stats", { name: server.name })
      .then(setStats)
      .catch((cause) => setError(messageOf(cause)));
    invoke<ServerActivity>("server_activity", { name: server.name })
      .then(setActivity)
      .catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.name]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      if (event.payload.id.startsWith(`server-${server.name}`)) {
        setLines((previous) => [...previous.slice(-299), event.payload]);
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [server.name]);

  useEffect(() => {
    const element = consoleRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines, tab]);

  const openTab = (next: Tab) => {
    setTab(next);
    setError(null);
    if (next === "files") loadFolder("");
    if (next === "players") {
      invoke<ServerPlayers>("server_players", { name: server.name }).then(setPlayers).catch(() => undefined);
    }
    if (next === "properties") {
      invoke<string>("server_properties", { name: server.name })
        .then((text) => { setProperties(parseProperties(text)); setNogui(server.nogui ?? true); })
        .catch(() => undefined);
      invoke<boolean>("server_eula", { name: server.name }).then(setEula).catch(() => undefined);
    }
  };

  const loadFolder = (path: string) => {
    setFolder(path);
    setOpenFile(null);
    invoke<ServerFileEntry[]>("server_files", { name: server.name, path: path || null })
      .then(setFiles)
      .catch((cause) => setError(messageOf(cause)));
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const startServer = () => {
    setLines([]);
    void run(() => invoke("server_start", { name: server.name, id: `server-${server.name}-${Date.now()}` }));
  };

  const openTextFile = (path: string) => {
    invoke<string>("server_read_file", { name: server.name, path })
      .then((content) => {
        setOpenFile(path);
        setFileContent(content);
      })
      .catch((cause) => setError(messageOf(cause)));
  };

  const saveFile = async () => {
    if (!openFile) return;
    await run(() => invoke("server_write_file", { name: server.name, path: openFile, content: fileContent }));
  };

  const saveProperties = async () => {
    await run(async () => {
      await invoke("server_properties_set", { name: server.name, content: stringifyProperties(properties) });
      await invoke("server_eula_set", { name: server.name, accepted: eula });
      await invoke("server_set_nogui", { name: server.name, enabled: nogui });
    });
  };

  const setProp = (key: string, value: string) => {
    setProperties((current) => ({ ...current, [key]: value }));
  };

  const addPlayer = async () => {
    if (!playerName.trim()) return;
    await run(() => invoke("server_player_add", { name: server.name, list: "whitelist", player: playerName.trim() }));
    setPlayerName("");
    invoke<ServerPlayers>("server_players", { name: server.name }).then(setPlayers).catch(() => undefined);
  };

  return (
    <div className="view-enter">
      <button className="btn btn-ghost mb-4 text-[11px]" onClick={onBack}>
        <ArrowLeft size={13} /> {t("editor.back")}
      </button>

      <section className="server-detail-head">
        <div className="relative z-[1] flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><HardDrive size={20} /></span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight">{server.name}</h1>
                <span className={`server-status-dot ${stats?.running ? "on" : ""}`} title={stats?.running ? t("servers.running") : t("servers.stopped")} />
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-muted">
                {server.template} · {server.version} · :{server.port}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats?.running ? (
              <button className="btn btn-secondary" disabled={busy} onClick={() => void run(() => invoke("server_stop", { name: server.name }))}>
                <Square size={13} /> {t("servers.stop")}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={startServer}>
                <Play size={13} /> {t("servers.start")}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => void run(() => invoke("server_backup", { name: server.name }))}>
              <Copy size={13} /> {t("servers.backup")}
            </button>
            <button className="btn btn-secondary" onClick={() => void invoke("server_open_folder", { name: server.name })}>
              <FolderOpen size={13} /> {t("packs.folder")}
            </button>
          </div>
        </div>
      </section>

      {error && <div className="modal-message error mt-4">{error}</div>}

      <div className="server-tabs mt-5">
        {TABS.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => openTab(item)}>
            {t(`serverDetail.${item}`)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.uptime")}</span><span className="server-stat-value">{uptime(stats?.uptime_secs ?? 0)}</span></div>
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.onlineNow")}</span><span className="server-stat-value">{activity?.online.length ?? 0}</span></div>
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.plugins")}</span><span className="server-stat-value">{stats?.plugins ?? 0}</span></div>
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.mods")}</span><span className="server-stat-value">{stats?.mods ?? 0}</span></div>
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.ram")}</span><span className="server-stat-value">{server.memory ?? 2048} MB</span></div>
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.world")}</span><span className="server-stat-value">{humanSize(stats?.world_size ?? 0)}</span></div>
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.disk")}</span><span className="server-stat-value">{humanSize(stats?.total_size ?? 0)}</span></div>
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.backups")}</span><span className="server-stat-value">{stats?.backups ?? 0}</span></div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Activity size={14} className="text-accent" /> {t("serverDetail.health")}</div>
                {stats?.issues.length ? (
                  <div className="flex flex-col gap-2">
                    {stats.issues.map((issue) => (
                      <div key={issue} className="server-player-row"><span className="h-1.5 w-1.5 rounded-full bg-[var(--pw-bad)]" />{issue}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted">{t("serverDetail.noIssues")}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`chip ${stats?.jar_exists ? "chip-accent" : ""}`}>{stats?.jar_exists ? t("serverDetail.jarOk") : t("serverDetail.jarMissing")}</span>
                  <span className={`chip ${stats?.eula ? "chip-accent" : ""}`}>EULA {stats?.eula ? "✓" : "✕"}</span>
                </div>
              </div>
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium"><Users size={14} className="text-accent" /> {t("serverDetail.recentActivity")}</span>
                  <button className="icon-btn !h-6 !w-6" onClick={refresh} title={t("servers.refreshVersions")}><RefreshCw size={12} /></button>
                </div>
                {activity?.events.length ? (
                  <div className="flex flex-col gap-1.5">
                    {activity.events.slice(0, 6).map((event, index) => (
                      <div key={`${event.time}-${index}`} className="flex items-center justify-between text-[12px]">
                        <span className="font-mono text-[10px] text-muted">{event.time}</span>
                        <span className="flex-1 px-2">{event.name}</span>
                        <span className={event.kind === "join" ? "server-join" : "server-leave"}>
                          {event.kind === "join" ? t("serverDetail.joined") : t("serverDetail.left")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-muted">{t("serverDetail.noActivity")}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "console" && (
          <div className="card p-4">
            <div className="console-box" style={{ height: 380 }} ref={consoleRef}>
              {lines.length === 0 ? <p className="text-[11px] text-muted">{t("output.empty")}</p> : lines.map((line, index) => (
                <div key={index} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>{line.line}</div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="field text-[12px]"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void invoke("server_send", { name: server.name, command });
                    setCommand("");
                  }
                }}
                placeholder="say Hello"
              />
              <button className="btn btn-secondary" onClick={() => { void invoke("server_send", { name: server.name, command }); setCommand(""); }}>
                {t("servers.send")}
              </button>
              <button className="btn btn-ghost" onClick={() => setLines([])} title={t("serverDetail.clear")}><RefreshCw size={13} /></button>
            </div>
            <p className="mt-2 text-[10px] text-muted">{t("servers.commandHint")}</p>
          </div>
        )}

        {tab === "files" && (
          <div className="card p-4">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted">
              <button className="hover:text-ink" onClick={() => loadFolder("")}>{server.name}</button>
              {folder.split("/").filter(Boolean).map((part, index, all) => (
                <span key={index} className="flex items-center gap-1.5">
                  <ChevronRight size={11} />
                  <button className="hover:text-ink" onClick={() => loadFolder(all.slice(0, index + 1).join("/"))}>{part}</button>
                </span>
              ))}
            </div>
            {openFile ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted">{openFile}</span>
                  <button className="btn btn-secondary !py-1 text-[11px]" disabled={busy} onClick={() => void saveFile()}><Save size={12} /> {t("common.save")}</button>
                </div>
                <textarea className="field font-mono text-[11px]" rows={18} value={fileContent} onChange={(event) => setFileContent(event.target.value)} />
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {files.map((entry) => (
                  <button key={entry.path} className="server-file-row" onClick={() => entry.is_dir ? loadFolder(entry.path) : openTextFile(entry.path)}>
                    {entry.is_dir ? <Folder size={14} className="text-accent" /> : <FileCode2 size={14} className="text-muted" />}
                    <span className="flex-1 truncate">{entry.name}</span>
                    {!entry.is_dir && <span className="font-mono text-[10px] text-muted">{humanSize(entry.size)}</span>}
                    <ChevronRight size={12} className="text-muted" />
                  </button>
                ))}
                {!files.length && <p className="text-[12px] text-muted">{t("serverDetail.noFiles")}</p>}
              </div>
            )}
          </div>
        )}

        {tab === "players" && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Activity size={14} className="text-accent" /> {t("serverDetail.onlineNow")}</div>
              {activity?.online.length ? (
                <div className="flex flex-wrap gap-2">
                  {activity.online.map((player) => <span key={player} className="chip chip-accent">{player}</span>)}
                </div>
              ) : <p className="text-[12px] text-muted">{t("serverDetail.noActivity")}</p>}
              <div className="mt-4 flex gap-2">
                <input className="field text-[11px]" value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="PlayerName" />
                <button className="btn btn-secondary shrink-0" disabled={busy || !playerName.trim()} onClick={() => void addPlayer()}><Users size={13} /> {t("servers.players")}</button>
              </div>
            </div>
            {(["ops", "whitelist", "bans"] as const).map((list) => {
              const key = list === "bans" ? "banned" : list;
              return (
                <div key={list} className="card p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Database size={14} className="text-accent" /> {t(`servers.${list}`)}</div>
                  <div className="flex flex-col gap-1.5">
                    {(players?.[key] ?? []).map((player) => (
                      <div key={player} className="server-player-row"><span className="flex-1">{player}</span></div>
                    ))}
                    {!players?.[key]?.length && <p className="text-[12px] text-muted">—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "properties" && (
          <div className="flex flex-col gap-3">
            <div className="card p-4">
              <div className="flex flex-wrap gap-5">
                <Checkbox checked={eula} onChange={setEula} label={t("serverDetail.eula")} />
                <Checkbox checked={nogui} onChange={setNogui} label={t("serverDetail.nogui")} />
              </div>
              <p className="mt-3 text-[11px] text-muted">{t("serverDetail.propRawHint")}</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <PropField label={t("servers.port")} type="number" value={properties["server-port"] ?? "25565"} onChange={(value) => setProp("server-port", value)} />
                <PropField label={t("servers.motd")} value={properties.motd ?? ""} onChange={(value) => setProp("motd", value)} />
                <PropField label={t("serverDetail.propMaxPlayers")} type="number" value={properties["max-players"] ?? "20"} onChange={(value) => setProp("max-players", value)} />
                <PropField label={t("serverDetail.propViewDistance")} type="number" value={properties["view-distance"] ?? "10"} onChange={(value) => setProp("view-distance", value)} />
                <PropField label={t("serverDetail.propDifficulty")} value={properties.difficulty ?? "normal"} options={["peaceful", "easy", "normal", "hard"]} onChange={(value) => setProp("difficulty", value)} />
                <PropField label={t("serverDetail.propGamemode")} value={properties.gamemode ?? "survival"} options={["survival", "creative", "adventure", "spectator"]} onChange={(value) => setProp("gamemode", value)} />
                <PropField label={t("serverDetail.propLevelType")} value={properties["level-type"] ?? "minecraft:normal"} options={["minecraft:normal", "minecraft:flat", "minecraft:large_biomes", "minecraft:amplified"]} onChange={(value) => setProp("level-type", value)} />
                <PropField label={t("serverDetail.propSeed")} value={properties["level-seed"] ?? ""} onChange={(value) => setProp("level-seed", value)} />
                <PropField label={t("serverDetail.propSpawnProtection")} type="number" value={properties["spawn-protection"] ?? "16"} onChange={(value) => setProp("spawn-protection", value)} />
              </div>
            </div>
            <div className="card p-4">
              <p className="mb-4 text-xs font-medium">{t("serverDetail.propRules")}</p>
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                <Checkbox checked={(properties["online-mode"] ?? "true") === "true"} onChange={(checked) => setProp("online-mode", String(checked))} label={t("servers.online")} size="sm" />
                <Checkbox checked={(properties.pvp ?? "true") === "true"} onChange={(checked) => setProp("pvp", String(checked))} label={t("serverDetail.propPvp")} size="sm" />
                <Checkbox checked={(properties["allow-flight"] ?? "false") === "true"} onChange={(checked) => setProp("allow-flight", String(checked))} label={t("serverDetail.propAllowFlight")} size="sm" />
                <Checkbox checked={(properties["enable-command-block"] ?? "false") === "true"} onChange={(checked) => setProp("enable-command-block", String(checked))} label={t("serverDetail.propCommandBlock")} size="sm" />
                <Checkbox checked={(properties["white-list"] ?? "false") === "true"} onChange={(checked) => setProp("white-list", String(checked))} label={t("serverDetail.propWhitelist")} size="sm" />
                <Checkbox checked={(properties.hardcore ?? "false") === "true"} onChange={(checked) => setProp("hardcore", String(checked))} label={t("serverDetail.propHardcore")} size="sm" />
                <Checkbox checked={(properties["generate-structures"] ?? "true") === "true"} onChange={(checked) => setProp("generate-structures", String(checked))} label={t("serverDetail.propStructures")} size="sm" />
              </div>
            </div>
            <div className="flex justify-end">
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveProperties()}><Save size={13} /> {t("common.save")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
