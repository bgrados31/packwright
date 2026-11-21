import { Activity, ArrowUpRight, Copy, Download, FolderOpen, Play, Server, Square, Terminal, Trash2, Wifi } from "lucide-react";
import { useI18n } from "../i18n";
import type { PackInfo, ServerInfo } from "../lib/types";

type Props = {
  server: ServerInfo;
  packs: PackInfo[];
  syncPack: string;
  onSyncPack: (value: string) => void;
  onOpen: () => void;
  onStart: () => void;
  onStop: () => void;
  onConsole: () => void;
  onBackup: () => void;
  onOpenFolder: () => void;
  onTunnel: () => void;
  onSync: () => void;
  onDelete: () => void;
};

export default function ServerCard({
  server,
  packs,
  syncPack,
  onSyncPack,
  onOpen,
  onStart,
  onStop,
  onConsole,
  onBackup,
  onOpenFolder,
  onTunnel,
  onSync,
  onDelete,
}: Props) {
  const { t } = useI18n();

  return (
    <article
      className="card server-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }}
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
          <button className="server-action-btn primary" onClick={onStart} title={t("servers.start")}><Play size={13} /></button>
          <button className="server-action-btn danger" onClick={onStop} title={t("servers.stop")}><Square size={13} /></button>
          <button className="server-action-btn" onClick={onConsole} title={t("servers.console")}><Terminal size={13} /></button>
          <button className="server-action-btn" onClick={onBackup} title={t("servers.backup")}><Copy size={13} /></button>
          <button className="server-action-btn" onClick={onOpenFolder} title={t("packs.folder")}><FolderOpen size={13} /></button>
          <button className="server-action-btn" onClick={onTunnel} title={t("servers.tunnel")}><Wifi size={13} /></button>
          <button className="server-action-btn" onClick={onOpen} title={t("servers.details")} aria-label={t("servers.details")}><Activity size={13} /></button>
          <button className="server-action-btn danger" onClick={onDelete} title={t("delete.deleteServer")} aria-label={t("delete.deleteServer")}><Trash2 size={13} /></button>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-line pt-3" onClick={(event) => event.stopPropagation()}>
          <select className="field !py-1.5 text-[11px]" value={syncPack} onChange={(event) => onSyncPack(event.target.value)}>
            <option value="">{t("servers.syncSelect")}</option>
            {packs.map((pack) => <option key={pack.dir} value={pack.dir}>{pack.name}</option>)}
          </select>
          <button className="btn btn-secondary shrink-0" disabled={!syncPack} onClick={onSync}>
            <Download size={13} /> {t("servers.sync")}
          </button>
        </div>
      </div>
    </article>
  );
}
