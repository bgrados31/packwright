import { useEffect, useState } from "react";
import { messageOf } from "../lib/error";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, Loader2, Play, RotateCcw, Square, X } from "lucide-react";
import { useI18n } from "../i18n";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";
import type { LauncherInfo, OpLine } from "../lib/types";
import { useOpLine } from "../lib/useOpLine";
import Select from "./Select";

type Props = {
  dir: string;
  launcherPaths: Record<string, string>;
  servePort: number;
  preferredLauncher?: string | null;
  onClose: () => void;
};

type Instance = { path: string; mods_linked: boolean; overrides: number };
type Status = { running: boolean; watching: boolean };

export default function DevInstanceModal({ dir, launcherPaths, servePort, preferredLauncher, onClose }: Props) {
  useDialogKeyboard(onClose);
  const { t } = useI18n();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [status, setStatus] = useState<Status>({ running: false, watching: false });
  const [serving, setServing] = useState(false);
  const [detected, setDetected] = useState<LauncherInfo[]>([]);
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
    invoke<LauncherInfo[]>("launcher_detect")
      .then((items) => {
        setDetected(items);
        const found = items.filter((item) => item.found && item.executable);
        if (found.length === 0) return;
        const chosen = found.find((item) => item.key === preferredLauncher)
          ?? found.find((item) => item.integration === "full")
          ?? found[0];
        setExecutable(chosen.executable ?? "");
      })
      .catch(() => undefined);
  }, []);

  useOpLine((line) => {
    const id = line.id;
    if (!(id === "dev-watch" || id.startsWith("dev-") || id.startsWith("serve-"))) return;
    setLines((previous) => [...previous.slice(-39), line]);
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
    <div className="modal-backdrop" onClick={onBackdropClick(() => { if (!busy) onClose(); })} role="dialog" aria-modal="true" aria-label={t("dev.title")}>
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
              <span className="text-xs text-muted">{t("dev.launcher")}</span>
              <Select
                value={detected.find((item) => item.executable === executable)?.key ?? (executable ? "custom" : "")}
                onChange={(key) => {
                  const info = detected.find((item) => item.key === key);
                  if (info?.executable) setExecutable(info.executable);
                }}
                options={[
                  ...detected
                    .filter((item) => item.found && item.executable)
                    .map((item) => ({ value: item.key, label: item.label })),
                  ...(executable && !detected.some((item) => item.executable === executable)
                    ? [{ value: "custom", label: t("dev.custom") }]
                    : []),
                ]}
              />
            </label>
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
