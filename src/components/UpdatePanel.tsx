import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Check, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n";

type Status =
  | "idle"
  | "checking"
  | "available"
  | "uptodate"
  | "error"
  | "downloading"
  | "installed";

export default function UpdatePanel() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    let mounted = true;
    getVersion()
      .then((version) => { if (mounted) setCurrent(version); })
      .catch(() => undefined);
    void checkForUpdates(true);
    return () => {
      mounted = false;
      void updateRef.current?.close().catch(() => undefined);
    };
    // La comprobación inicial solo se hace al montar el panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkForUpdates = async (silent = false) => {
    if (!silent) setStatus("checking");
    if (!silent) setError("");
    try {
      await updateRef.current?.close().catch(() => undefined);
      const found = await check();
      updateRef.current = found;
      setUpdate(found);
      setStatus(found ? "available" : "uptodate");
    } catch (cause) {
      if (!silent) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      } else {
        setStatus("idle");
      }
    }
  };

  const install = async () => {
    const found = updateRef.current;
    if (!found) return;
    setStatus("downloading");
    setProgress(0);
    let downloaded = 0;
    let contentLength = 0;
    try {
      await found.downloadAndInstall((event) => {
        if (event.event === "Started") contentLength = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setProgress(contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0);
        }
      });
      setStatus("installed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  };

  const restart = () => {
    void relaunch().catch(() => undefined);
  };

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">
            {t("settings.updateCurrent")}{" "}
            <span className="font-mono text-accent">v{current || "—"}</span>
          </p>
          {status === "uptodate" && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ok">
              <Check size={12} /> {t("settings.updateUpToDate")}
            </p>
          )}
          {status === "available" && update && (
            <p className="mt-1 text-[11px] text-accent">
              {t("settings.updateVersion", { version: update.version })}
            </p>
          )}
          {status === "checking" && (
            <p className="mt-1 text-[11px] text-muted">{t("settings.updateChecking")}</p>
          )}
          {status === "downloading" && (
            <p className="mt-1 text-[11px] text-muted">
              {t("settings.updateDownloading")} {progress}%
            </p>
          )}
          {status === "installed" && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ok">
              <Check size={12} /> {t("settings.updateInstalled")}
            </p>
          )}
          {status === "error" && (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] text-bad">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" />
              <span>{error || t("settings.updateError")}</span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {status === "available" && (
            <button className="btn btn-primary" onClick={() => void install()}>
              <Download size={14} /> {t("settings.updateInstall")}
            </button>
          )}
          {status === "installed" && (
            <button className="btn btn-primary" onClick={restart}>
              <RefreshCw size={14} /> {t("settings.updateRestart")}
            </button>
          )}
          {(status === "uptodate" || status === "idle" || status === "error") && (
            <button className="btn btn-secondary" onClick={() => void checkForUpdates(false)}>
              <RefreshCw size={14} /> {t("settings.updateCheck")}
            </button>
          )}
        </div>
      </div>

      {status === "downloading" && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-subtle">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {status === "available" && update?.body && (
        <div className="mt-3 max-h-36 overflow-auto border-t border-line pt-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{t("settings.updateNotes")}</p>
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-4 text-muted">{update.body}</pre>
        </div>
      )}
    </div>
  );
}
