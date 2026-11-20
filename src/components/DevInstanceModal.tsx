import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, Loader2, Play, RotateCcw, Square, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { OpLine } from "../lib/types";

type Props = {
  dir: string;
  launcherPaths: Record<string, string>;
  servePort: number;
  onClose: () => void;
};

type Instance = { path: string; mods_linked: boolean; overrides: number };
type Status = { running: boolean; watching: boolean };

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function DevInstanceModal({ dir, launcherPaths, servePort, onClose }: Props) {
  const { t } = useI18n();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [status, setStatus] = useState<Status>({ running: false, watching: false });
  const [serving, setServing] = useState(false);
  const [executable, setExecutable] = useState(
    launcherPaths.prism ?? launcherPaths.modrinth ?? launcherPaths.atlauncher ?? "",
  );
  const [lines, setLines] = useState<OpLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<Status>("dev_status").then(setStatus).catch(() => undefined);
    invoke<boolean>("serve_status").then(setServing).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      const id = event.payload.id;
      if (cancelled || !(id === "dev-watch" || id.startsWith("dev-") || id.startsWith("serve-"))) return;
      setLines((previous) => [...previous.slice(-39), event.payload]);
    }).then((fn) => { if (cancelled) fn(); else unlisten = fn; });
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  /** Un solo botón: serve + instancia + watcher + launcher. */
  const play = async (restart = false) => {
    setBusy(true);
    setError(null);
    try {
      if (restart) await invoke("dev_stop");
      if (!serving || restart) {
        await invoke("serve_start", { dir, port: servePort, id: `serve-${Date.now()}` });
      }
      const prepared = await invoke<Instance>("dev_instance_prepare", { dir });
      setInstance(prepared);
      await invoke("dev_watch_start", { dir });
      await invoke("dev_launch", { dir, executable: executable || null, id: `dev-${Date.now()}` });
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await invoke("dev_stop");
      await invoke("dev_watch_stop");
      await invoke("serve_stop");
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("dev.title")}>
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-icon running"><Play size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("dev.title")}</h2>
            <p className="text-[11px] text-muted">{t("dev.autoHint")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          <div className="flex flex-wrap gap-1.5">
            <span className={`chip ${serving ? "chip-accent" : ""}`}>{serving ? t("dev.serving") : t("dev.notServing")}</span>
            <span className={`chip ${status.watching ? "chip-accent" : ""}`}>{status.watching ? t("dev.watching") : t("dev.notWatching")}</span>
            <span className={`chip ${status.running ? "chip-accent" : ""}`}>{status.running ? t("dev.running") : t("dev.stopped")}</span>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-subtle p-3">
            <FolderOpen size={15} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 text-[11px] text-muted">
              <p className="truncate font-mono">{instance?.path ?? t("dev.pathHint")}</p>
              {instance && (
                <p className="mt-1">{t("dev.modsLinked")}: {instance.mods_linked ? t("dev.yes") : t("dev.no")} · {t("dev.overrides")}: {instance.overrides}</p>
              )}
              <p className="mt-1">{t("dev.metadataHint")}</p>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="mt-4 max-h-32 overflow-auto rounded-lg bg-subtle p-2">
              {lines.slice(-10).map((line, index) => (
                <div key={index} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>{line.line}</div>
              ))}
            </div>
          )}
          {error && <div className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</div>}

          <details className="group mt-4 text-sm">
            <summary className="cursor-pointer py-1 text-xs text-muted hover:text-ink">{t("dev.advanced")}</summary>
            <label className="mt-2 flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("dev.executable")}</span>
              <input
                className="field font-mono text-[11px]"
                value={executable}
                onChange={(event) => setExecutable(event.target.value)}
                placeholder="C:\\Launchers\\PrismLauncher\\PrismLauncher.exe"
                spellCheck={false}
              />
            </label>
          </details>
        </div>

        <div className="modal-footer">
          <div className="flex items-center gap-2">
            {status.running && (
              <button className="btn btn-secondary" onClick={() => void stop()} disabled={busy}>
                <Square size={13} /> {t("dev.stop")}
              </button>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => void play(status.running)} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : status.running ? <RotateCcw size={14} /> : <Play size={14} />}
            {status.running ? t("dev.restart") : t("dev.play")}
          </button>
        </div>
      </div>
    </div>
  );
}
