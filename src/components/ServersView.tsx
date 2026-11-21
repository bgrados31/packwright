import { useEffect, useState } from "react";
import { fireAndForget, messageOf } from "../lib/error";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Plus, Save, Server, Sparkles, X } from "lucide-react";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { useI18n } from "../i18n";
import type { JavaInfo, OpLine, PackInfo, ServerInfo, ServerStats } from "../lib/types";
import { useOpLine } from "../lib/useOpLine";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";
import MinecraftScene from "./MinecraftScene";
import ServerCard from "./ServerCard";
import CreateServerModal from "./CreateServerModal";
import ServerConsoleModal from "./ServerConsoleModal";
import ServerDetailView from "./ServerDetailView";
import PlayitModal from "./PlayitModal";

type Props = {
  packs: PackInfo[];
};

function PropertiesModal({
  name,
  value,
  onChange,
  onClose,
  onSave,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  useDialogKeyboard(onClose);
  return (
    <div className="modal-backdrop" onClick={onBackdropClick(onClose)} role="dialog" aria-modal="true" aria-label={t("servers.properties")}>
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-icon running"><Server size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t("servers.properties")}</h2><p className="text-[11px] text-muted">{name}</p></div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")} aria-label={t("common.close")}><X size={16} /></button>
        </div>
        <div className="p-4"><textarea className="field font-mono text-[11px]" rows={14} value={value} onChange={(event) => onChange(event.target.value)} /></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
          <button className="btn btn-primary" onClick={onSave}><Save size={14} />{t("common.save")}</button>
        </div>
      </div>
    </div>
  );
}

export default function ServersView({ packs }: Props) {
  const { t } = useI18n();
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detectedJava, setDetectedJava] = useState("");
  const [detectedJavaMajor, setDetectedJavaMajor] = useState(0);
  const [consoleServer, setConsoleServer] = useState<ServerInfo | null>(null);
  const [lines, setLines] = useState<OpLine[]>([]);
  const [consoleRunning, setConsoleRunning] = useState(false);
  const [knownPlayers, setKnownPlayers] = useState<string[]>([]);
  const [propertiesServer, setPropertiesServer] = useState<ServerInfo | null>(null);
  const [properties, setProperties] = useState("");
  const [syncPack, setSyncPack] = useState("");
  const [playitOpen, setPlayitOpen] = useState(false);
  const [detailServer, setDetailServer] = useState<ServerInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerInfo | null>(null);

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
          setDetectedJavaMajor(info.major);
        }
      })
      .catch(() => undefined);
  }, []);

  useOpLine((line) => {
    if (!line.id.startsWith("server-")) return;
    setLines((previous) => [...previous.slice(-199), line]);
  }, []);

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await action();
      refresh();
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    }
  };

  const deleteServer = async () => {
    if (!deleteTarget) return;
    await invoke("server_delete", { name: deleteTarget.name });
    if (detailServer?.name === deleteTarget.name) setDetailServer(null);
    setDeleteTarget(null);
    refresh();
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
          packs={packs}
          onBack={() => { setDetailServer(null); refresh(); }}
          onDelete={() => detailServer && setDeleteTarget(detailServer)}
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
              <button className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> {t("servers.new")}</button>
            </div>
          </section>

          {error && <div className="modal-message error mt-4">{error}</div>}

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
                <ServerCard
                  key={server.name}
                  server={server}
                  packs={packs}
                  syncPack={syncPack}
                  onSyncPack={setSyncPack}
                  onOpen={() => setDetailServer(server)}
                  onStart={() => start(server)}
                  onStop={() => { void run(() => invoke("server_stop", { name: server.name })); }}
                  onConsole={() => openConsole(server)}
                  onBackup={() => { void run(() => invoke("server_backup", { name: server.name })); }}
                  onOpenFolder={() => fireAndForget(invoke("server_open_folder", { name: server.name }))}
                  onTunnel={() => setPlayitOpen(true)}
                  onSync={() => { void run(() => invoke("server_sync", { name: server.name, pack: syncPack })); }}
                  onDelete={() => setDeleteTarget(server)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {createOpen && (
        <CreateServerModal
          detectedJava={detectedJava}
          detectedJavaMajor={detectedJavaMajor}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); refresh(); }}
        />
      )}

      {consoleServer && (
        <ServerConsoleModal
          server={consoleServer}
          lines={lines}
          running={consoleRunning}
          playerNames={knownPlayers}
          onClose={() => setConsoleServer(null)}
          onClear={() => setLines([])}
          onAppend={(line) => setLines((current) => [...current.slice(-199), line])}
        />
      )}

      {propertiesServer && (
        <PropertiesModal
          name={propertiesServer.name}
          value={properties}
          onChange={setProperties}
          onClose={() => setPropertiesServer(null)}
          onSave={() => { void run(() => invoke("server_properties_set", { name: propertiesServer.name, content: properties })); }}
        />
      )}

      {playitOpen && <PlayitModal onClose={() => setPlayitOpen(false)} />}

      {deleteTarget && (
        <ConfirmDeleteModal
          kind="server"
          name={deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={deleteServer}
        />
      )}
    </div>
  );
}
