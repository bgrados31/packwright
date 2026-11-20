import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  ArrowLeft,
  Ban,
  ChevronRight,
  Copy,
  Database,
  FileCode2,
  Folder,
  FolderOpen,
  Gavel,
  Download,
  HardDrive,
  Package,
  Play,
  RefreshCw,
  Save,
  Shield,
  ShieldOff,
  Square,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useI18n } from "../i18n";
import type {
  BackupInfo,
  ModsCompare,
  OpLine,
  PackInfo,
  ServerActivity,
  ServerFileEntry,
  ServerInfo,
  ServerPlayers,
  ServerPing,
  ServerStats,
} from "../lib/types";
import { Checkbox } from "./ui";
import ConsolePanel from "./ConsolePanel";
import PlayerAvatar from "./PlayerAvatar";
import { useOpLine } from "../lib/useOpLine";

type Props = {
  server: ServerInfo;
  packs: PackInfo[];
  onBack: () => void;
};

const TABS = ["overview", "console", "files", "players", "mods", "backups", "properties"] as const;
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

type PlayerAction = { key: string; title: string; icon: ReactNode; run: () => void };

function PlayerRow({
  name,
  badge,
  actions,
  busy,
}: {
  name: string;
  badge?: string;
  actions: PlayerAction[];
  busy: boolean;
}) {
  return (
    <div className="player-row">
      <PlayerAvatar name={name} size={28} />
      <span className="min-w-0 flex-1 truncate text-[12px]">{name}</span>
      {badge && <span className="ui-tag tag-2 !text-[9px]">{badge}</span>}
      <span className="player-actions">
        {actions.map((action) => (
          <button
            key={action.key}
            className="server-action-btn !h-7 !w-7"
            title={action.title}
            disabled={busy}
            onClick={action.run}
          >
            {action.icon}
          </button>
        ))}
      </span>
    </div>
  );
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

export default function ServerDetailView({ server, packs, onBack }: Props) {
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
  const [playerName, setPlayerName] = useState("");
  const [knownPlayers, setKnownPlayers] = useState<string[]>([]);
  const [ping, setPing] = useState<ServerPing | null>(null);
  const [modsCompare, setModsCompare] = useState<ModsCompare | null>(null);
  const [comparePack, setComparePack] = useState("");
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<ServerStats>("server_stats", { name: server.name })
      .then(setStats)
      .catch((cause) => setError(messageOf(cause)));
    invoke<ServerActivity>("server_activity", { name: server.name })
      .then(setActivity)
      .catch(() => undefined);
    invoke<string[]>("server_known_players", { name: server.name })
      .then(setKnownPlayers)
      .catch(() => undefined);
    invoke<ServerPing>("server_ping", { name: server.name })
      .then(setPing)
      .catch(() => setPing(null));
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.name]);

  useOpLine((line) => {
    if (!line.id.startsWith(`server-${server.name}`)) return;
    setLines((previous) => [...previous.slice(-299), line]);
  }, [server.name]);

  const openTab = (next: Tab) => {
    setTab(next);
    setError(null);
    if (next === "files") loadFolder("");
    if (next === "players") {
      invoke<ServerPlayers>("server_players", { name: server.name }).then(setPlayers).catch(() => undefined);
    }
    if (next === "mods") {
      const pack = comparePack || packs[0]?.dir || "";
      setComparePack(pack);
      if (pack) {
        invoke<ModsCompare>("server_mods_compare", { name: server.name, pack })
          .then(setModsCompare)
          .catch(() => undefined);
      }
    }
    if (next === "backups") {
      invoke<BackupInfo[]>("server_backups", { name: server.name })
        .then(setBackups)
        .catch(() => undefined);
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

  const reloadPlayers = () => {
    invoke<ServerPlayers>("server_players", { name: server.name }).then(setPlayers).catch(() => undefined);
    refresh();
  };

  const addPlayer = async () => {
    if (!playerName.trim()) return;
    await run(() => invoke("server_player_add", { name: server.name, list: "whitelist", player: playerName.trim() }));
    setPlayerName("");
    reloadPlayers();
  };

  const playerAction = async (
    player: string,
    action: "op" | "deop" | "whitelist-add" | "whitelist-remove" | "ban" | "pardon" | "kick",
  ) => {
    setBusy(true);
    setError(null);
    try {
      if (action === "op" || action === "deop") {
        const command = action === "op" ? "server_player_add" : "server_player_remove";
        await invoke(command, { name: server.name, list: "ops", player });
      } else if (action === "whitelist-add" || action === "whitelist-remove") {
        const command = action === "whitelist-add" ? "server_player_add" : "server_player_remove";
        await invoke(command, { name: server.name, list: "whitelist", player });
      } else if (action === "ban" || action === "pardon") {
        const command = action === "ban" ? "server_player_add" : "server_player_remove";
        await invoke(command, { name: server.name, list: "bans", player });
      } else {
        await invoke("server_player_action", { name: server.name, player, action: "kick" });
      }
      reloadPlayers();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const reloadMods = (pack = comparePack) => {
    if (!pack) return;
    invoke<ModsCompare>("server_mods_compare", { name: server.name, pack })
      .then(setModsCompare)
      .catch(() => undefined);
  };

  const syncMods = async () => {
    if (!comparePack) return;
    await run(() => invoke("server_sync", { name: server.name, pack: comparePack }));
    reloadMods();
  };

  const reloadBackups = () => {
    invoke<BackupInfo[]>("server_backups", { name: server.name })
      .then(setBackups)
      .catch(() => undefined);
  };

  const restoreBackup = async (stamp: string) => {
    if (!window.confirm(t("backup.restoreConfirm"))) return;
    await run(() => invoke("server_backup_restore", { name: server.name, stamp }));
    reloadBackups();
  };

  const deleteBackup = async (stamp: string) => {
    if (!window.confirm(t("backup.deleteConfirm"))) return;
    await run(() => invoke("server_backup_delete", { name: server.name, stamp }));
    reloadBackups();
  };

  const actionsFor = (player: string): PlayerAction[] => [
    {
      key: "kick",
      title: t("player.kick"),
      icon: <Gavel size={12} />,
      run: () => void playerAction(player, "kick"),
    },
    players?.ops.some((value) => value === player)
      ? { key: "deop", title: t("player.deop"), icon: <ShieldOff size={12} />, run: () => void playerAction(player, "deop") }
      : { key: "op", title: t("player.op"), icon: <Shield size={12} />, run: () => void playerAction(player, "op") },
    players?.whitelist.some((value) => value === player)
      ? { key: "wl-remove", title: t("player.whitelistRemove"), icon: <Users size={12} />, run: () => void playerAction(player, "whitelist-remove") }
      : { key: "wl-add", title: t("player.whitelistAdd"), icon: <UserPlus size={12} />, run: () => void playerAction(player, "whitelist-add") },
    players?.banned.some((value) => value === player)
      ? { key: "pardon", title: t("player.pardon"), icon: <Shield size={12} />, run: () => void playerAction(player, "pardon") }
      : { key: "ban", title: t("player.ban"), icon: <Ban size={12} />, run: () => void playerAction(player, "ban") },
  ];

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
                {ping?.online && <span className="chip chip-accent">{ping.latency_ms} ms</span>}
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
              <div className="server-stat"><span className="server-stat-label">{t("serverDetail.onlineNow")}</span><span className="server-stat-value">{ping?.online ? ping.players_online : activity?.online.length ?? 0}</span></div>
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
            <ConsolePanel
              lines={lines}
              running={stats?.running ?? false}
              height={380}
              playerNames={knownPlayers}
              onClear={() => setLines([])}
              onSend={async (command) => {
                try {
                  await invoke("server_send", { name: server.name, command });
                } catch (cause) {
                  setLines((current) => [...current.slice(-299), {
                    id: `error-${Date.now()}`,
                    stream: "stderr",
                    line: messageOf(cause),
                  }]);
                }
              }}
            />
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
          <div className="flex flex-col gap-3">
            <div className="card p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-medium"><Activity size={14} className="text-accent" /> {t("serverDetail.onlineNow")}</div>
              {activity?.online.length ? (
                <div className="flex flex-col gap-0.5">
                  {activity.online.map((player) => (
                    <PlayerRow
                      key={player}
                      name={player}
                      badge={players?.ops.some((value) => value === player) ? t("player.badgeOp") : undefined}
                      actions={actionsFor(player)}
                      busy={busy}
                    />
                  ))}
                </div>
              ) : <p className="text-[12px] text-muted">{t("serverDetail.noActivity")}</p>}
              <div className="mt-4 flex gap-2">
                <input
                  className="field text-[11px]"
                  list="pw-known-players"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="PlayerName"
                />
                <datalist id="pw-known-players">
                  {knownPlayers.map((player) => <option key={player} value={player} />)}
                </datalist>
                <button className="btn btn-secondary shrink-0" disabled={busy || !playerName.trim()} onClick={() => void addPlayer()}>
                  <UserPlus size={13} /> {t("player.whitelistAdd")}
                </button>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {(["ops", "whitelist", "bans"] as const).map((list) => {
                const key = list === "bans" ? "banned" : list;
                const badge = list === "ops" ? t("player.badgeOp") : list === "whitelist" ? t("player.badgeWhitelist") : t("player.badgeBanned");
                return (
                  <div key={list} className="card p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-medium"><Database size={14} className="text-accent" /> {t(`servers.${list}`)}</span>
                      <span className="font-mono text-[10px] text-muted">{players?.[key]?.length ?? 0}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {(players?.[key] ?? []).map((player) => (
                        <PlayerRow
                          key={player}
                          name={player}
                          badge={badge}
                          actions={list === "bans" ? [
                            {
                              key: "pardon",
                              title: t("player.pardon"),
                              icon: <Shield size={12} />,
                              run: () => void playerAction(player, "pardon"),
                            },
                          ] : actionsFor(player)}
                          busy={busy}
                        />
                      ))}
                      {!players?.[key]?.length && <p className="text-[12px] text-muted">—</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "mods" && (
          <div className="card p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <select
                className="field !w-auto text-[11px]"
                value={comparePack}
                onChange={(event) => { setComparePack(event.target.value); reloadMods(event.target.value); }}
              >
                {packs.map((pack) => <option key={pack.dir} value={pack.dir}>{pack.name}</option>)}
              </select>
              <button className="btn btn-secondary !py-1.5 text-[11px]" disabled={!comparePack || busy} onClick={() => void syncMods()}>
                <Download size={12} /> {t("servers.sync")}
              </button>
              <span className="ml-auto font-mono text-[10px] text-muted">
                {modsCompare?.server.length ?? 0} {t("serverDetail.mods")}
              </span>
            </div>
            {modsCompare && (
              <div className="grid gap-3 md:grid-cols-3">
                {([
                  ["missing", t("serverDetail.missingMods")],
                  ["extra", t("serverDetail.extraMods")],
                  ["server", t("serverDetail.installedMods")],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <p className="mb-2 text-xs font-medium">{label} <span className="text-muted">({modsCompare[key].length})</span></p>
                    <div className="flex flex-col gap-1">
                      {modsCompare[key].map((name) => (
                        <div key={name} className="flex items-center gap-2 rounded-md bg-subtle px-2 py-1.5 text-[11px]">
                          <Package size={12} className={key === "missing" ? "text-[var(--pw-bad)]" : "text-accent"} />
                          <span className="truncate">{name}</span>
                        </div>
                      ))}
                      {!modsCompare[key].length && <p className="text-[11px] text-muted">—</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "backups" && (
          <div className="card p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium">{t("serverDetail.backups")}</span>
              <button className="btn btn-secondary !py-1.5 text-[11px]" disabled={busy} onClick={() => void run(() => invoke("server_backup", { name: server.name })).then(reloadBackups)}>
                <Copy size={12} /> {t("servers.backup")}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {backups.map((backup) => (
                <div key={backup.name} className="server-player-row">
                  <Database size={13} className="text-accent" />
                  <span className="flex-1 font-mono text-[11px]">{backup.name}</span>
                  <span className="font-mono text-[10px] text-muted">{humanSize(backup.size)}</span>
                  <button className="server-action-btn !h-7 !w-7" title={t("backup.restore")} disabled={busy} onClick={() => void restoreBackup(backup.name)}>
                    <RefreshCw size={12} />
                  </button>
                  <button className="server-action-btn !h-7 !w-7" title={t("backup.delete")} disabled={busy} onClick={() => void deleteBackup(backup.name)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {!backups.length && <p className="text-[12px] text-muted">{t("serverDetail.noBackups")}</p>}
            </div>
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
