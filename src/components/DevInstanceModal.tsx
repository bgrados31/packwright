import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, Loader2, Play, RotateCcw, Square, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { OpLine } from "../lib/types";

type Props = {
  dir: string;
  launcherPaths: Record<string, string>;
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

export default function DevInstanceModal({ dir, launcherPaths, onClose }: Props) {
  const { t } = useI18n();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [status, setStatus] = useState<Status>({ running: false, watching: false });
  const [executable, setExecutable] = useState(launcherPaths.prism ?? launcherPaths.modrinth ?? "");
  const [lines, setLines] = useState<OpLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<Status>("dev_status").then(setStatus).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      if (event.payload.id === "dev-watch" || event.payload.id.startsWith("dev-")) {
        setLines((previous) => [...previous.slice(-29), event.payload]);
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const prepare = async () => {
    setBusy(true);
    setError(null);
    try {
      setInstance(await invoke<Instance>("dev_instance_prepare", { dir }));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const toggleWatch = async () => {
    setBusy(true);
    try {
      if (status.watching) await invoke("dev_watch_stop");
      else await invoke("dev_watch_start", { dir });
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("dev_launch", {
        dir,
        executable: executable || null,
        id: `dev-${Date.now()}`,
      });
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
            <p className="text-[11px] text-muted">{t("dev.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          <div className="flex items-center gap-2">
            <span className={`chip ${status.running ? "chip-accent" : ""}`}>
              {status.running ? t("dev.running") : t("dev.stopped")}
            </span>
            <span className={`chip ${status.watching ? "chip-accent" : ""}`}>
              {status.watching ? t("dev.watching") : t("dev.notWatching")}
            </span>
          </div>

          <button className="btn btn-secondary mt-3 w-full" onClick={() => void prepare()} disabled={busy}>
            <FolderOpen size={14} /> {t("dev.prepare")}
          </button>
          {instance && (
            <div className="mt-2 rounded-lg border border-line bg-subtle p-3 text-[11px]">
              <p className="truncate font-mono text-muted">{instance.path}</p>
              <p className="mt-1 text-muted">
                {t("dev.modsLinked")}: {instance.mods_linked ? t("dev.yes") : t("dev.no")} · {t("dev.overrides")}: {instance.overrides}
              </p>
            </div>
          )}

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("dev.executable")}</span>
            <input
              className="field font-mono text-[11px]"
              value={executable}
              onChange={(event) => setExecutable(event.target.value)}
              placeholder="C:\\Launchers\\PrismLauncher\\PrismLauncher.exe"
              spellCheck={false}
            />
          </label>

          {lines.length > 0 && (
            <div className="mt-4 max-h-32 overflow-auto rounded-lg bg-subtle p-2">
              {lines.slice(-8).map((line, index) => (
                <div key={index} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>{line.line}</div>
              ))}
            </div>
          )}
          {error && <div className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost" onClick={() => void toggleWatch()} disabled={busy || !instance}>
              {status.watching ? t("dev.watchStop") : t("dev.watchStart")}
            </button>
            {status.running && (
              <button className="btn btn-secondary" onClick={() => void stop()} disabled={busy}>
                <Square size={13} /> {t("dev.stop")}
              </button>
            )}
          </div>
          <button className="btn btn-primary" onClick={() => void launch()} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : status.running ? <RotateCcw size={14} /> : <Play size={14} />}
            {status.running ? t("dev.restart") : t("dev.launch")}
          </button>
        </div>
      </div>
    </div>
  );
}
