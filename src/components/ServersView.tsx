import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Box,
  Copy,
  Download,
  FolderOpen,
  Globe2,
  Loader2,
  Play,
  Plus,
  Save,
  Server,
  Square,
  Terminal,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { OpLine, PackInfo, ServerInfo, ServerPlayers } from "../lib/types";

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
  const [version, setVersion] = useState("1.21.1");
  const [port, setPort] = useState(25565);
  const [java, setJava] = useState("java");
  const [jarUrl, setJarUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consoleServer, setConsoleServer] = useState<ServerInfo | null>(null);
  const [lines, setLines] = useState<OpLine[]>([]);
  const [command, setCommand] = useState("");
  const [propertiesServer, setPropertiesServer] = useState<ServerInfo | null>(null);
  const [properties, setProperties] = useState("");
  const [playersServer, setPlayersServer] = useState<ServerInfo | null>(null);
  const [players, setPlayers] = useState<ServerPlayers | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerList, setPlayerList] = useState("whitelist");
  const [syncPack, setSyncPack] = useState("");

  const refresh = () => {
    invoke<ServerInfo[]>("server_list")
      .then(setServers)
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      setLines((previous) => [...previous.slice(-199), event.payload]);
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

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

  const create = async () => {
    await run(() => invoke("server_create", { name, template, version, port, java, jarUrl: jarUrl.trim() || null }));
    setCreateOpen(false);
    setName("");
  };

  const start = (server: ServerInfo) => {
    setLines([]);
    setConsoleServer(server);
    void run(() => invoke("server_start", {
      name: server.name,
      id: `server-${server.name}-${Date.now()}`,
    }));
  };

  const openProperties = async (server: ServerInfo) => {
    setPropertiesServer(server);
    setProperties(await invoke<string>("server_properties", { name: server.name }));
  };

  const openPlayers = async (server: ServerInfo) => {
    setPlayersServer(server);
    setPlayers(await invoke<ServerPlayers>("server_players", { name: server.name }));
  };

  return (
    <div className="view-enter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{t("nav.servers")}</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight">{t("servers.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("servers.subtitle", { count: servers.length })}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> {t("servers.new")}
        </button>
      </div>

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
        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {servers.map((server) => (
            <article key={server.name} className="card mod-installed-card">
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Server size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[14px] font-semibold">{server.name}</h2>
                    <p className="font-mono text-[10px] text-muted">:{server.port} · {server.version}</p>
                  </div>
                  <span className="ui-tag tag-3">{server.template}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <button className="btn btn-ghost px-2" onClick={() => start(server)} title={t("servers.start")}><Play size={14} /></button>
                  <button className="btn btn-ghost px-2" onClick={() => void run(() => invoke("server_stop", { name: server.name }))} title={t("servers.stop")}><Square size={14} /></button>
                  <button className="btn btn-ghost px-2" onClick={() => { setLines([]); setConsoleServer(server); }} title={t("servers.console")}><Terminal size={14} /></button>
                  <button className="btn btn-ghost px-2" onClick={() => void openProperties(server)} title={t("servers.properties")}><Settings2Icon /></button>
                  <button className="btn btn-ghost px-2" onClick={() => void openPlayers(server)} title={t("servers.players")}><Users size={14} /></button>
                  <button className="btn btn-ghost px-2" onClick={() => void run(() => invoke("server_backup", { name: server.name }))} title={t("servers.backup")}><Copy size={14} /></button>
                  <button className="btn btn-ghost px-2" onClick={() => void run(() => invoke("server_install_geyser", { name: server.name }))} title={t("servers.geyser")}><Globe2 size={14} /></button>
                  <button className="btn btn-ghost px-2" onClick={() => void invoke("server_open_folder", { name: server.name })} title={t("packs.folder")}><FolderOpen size={14} /></button>
                  <button className="btn btn-ghost px-2" onClick={() => void openUrl("https://playit.gg")} title={t("servers.tunnel")}><Wifi size={14} /></button>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
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

      {createOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("servers.new")}>
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-icon running"><Plus size={18} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t("servers.new")}</h2><p className="text-[11px] text-muted">{t("servers.newHint")}</p></div>
              <button className="icon-btn" onClick={() => setCreateOpen(false)}><X size={16} /></button>
            </div>
            <div className="grid gap-3 p-4">
              <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("form.name")}</span><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="My server" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">{t("servers.template")}</span>
                  <select className="field" value={template} onChange={(e) => setTemplate(e.target.value)}>
                    {TEMPLATES.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("form.minecraft")}</span><input className="field" value={version} onChange={(e) => setVersion(e.target.value)} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("servers.port")}</span><input className="field" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} /></label>
                <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("servers.java")}</span><input className="field" value={java} onChange={(e) => setJava(e.target.value)} /></label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t("servers.jarUrl")}</span>
                <input className="field font-mono text-[11px]" value={jarUrl} onChange={(e) => setJarUrl(e.target.value)} placeholder="https://…/server.jar" spellCheck={false} />
              </label>
              <button className="btn btn-ghost text-[11px]" onClick={() => void openUrl(`https://papermc.io/downloads/${template}`)}>
                <Download size={12} /> {t("servers.getJar")}
              </button>
              {error && <div className="modal-message error">{error}</div>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>{t("common.close")}</button>
              <button className="btn btn-primary" onClick={() => void create()} disabled={busy || !name.trim()}>
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
              <div className="console-box" style={{ height: 260 }}>
                {lines.length === 0 ? <p className="text-[11px] text-muted">{t("output.empty")}</p> : lines.map((line, index) => (
                  <div key={index} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>{line.line}</div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input className="field text-[12px]" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="say Hello" onKeyDown={(e) => { if (e.key === "Enter") { void invoke("server_send", { name: consoleServer.name, command }); setCommand(""); } }} />
                <button className="btn btn-secondary" onClick={() => { void invoke("server_send", { name: consoleServer.name, command }); setCommand(""); }}>{t("servers.send")}</button>
              </div>
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

      {playersServer && players && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("servers.players")}>
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-icon running"><Users size={18} /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t("servers.players")}</h2><p className="text-[11px] text-muted">{playersServer.name}</p></div>
              <button className="icon-btn" onClick={() => setPlayersServer(null)}><X size={16} /></button>
            </div>
            <div className="p-4">
              <select className="field text-[12px]" value={playerList} onChange={(e) => setPlayerList(e.target.value)}>
                <option value="whitelist">{t("servers.whitelist")}</option>
                <option value="ops">{t("servers.ops")}</option>
                <option value="bans">{t("servers.bans")}</option>
              </select>
              <div className="mt-2 flex gap-2">
                <input className="field text-[12px]" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Player" />
                <button className="btn btn-secondary" onClick={() => void run(() => invoke("server_player_add", { name: playersServer.name, list: playerList, player: playerName }))}><Plus size={13} /></button>
              </div>
              <div className="mt-3 flex flex-col gap-1">
                {players[playerList as keyof ServerPlayers].map((player) => (
                  <div key={player} className="rounded-md bg-subtle px-3 py-1.5 text-[12px]">{player}</div>
                ))}
              </div>
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setPlayersServer(null)}>{t("common.close")}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Settings2Icon() {
  return <Box size={14} />;
}
