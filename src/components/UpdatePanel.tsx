import { Check, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n";
import { updater, useUpdater } from "../lib/updater";
import { Checkbox } from "./ui";

export default function UpdatePanel() {
  const { t } = useI18n();
  const { status, currentVersion, version, body, breaking, progress, error, autoDownload } = useUpdater();

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">
            {t("settings.updateCurrent")}{" "}
            <span className="font-mono text-accent">v{currentVersion || "—"}</span>
          </p>
          {status === "uptodate" && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ok">
              <Check size={12} /> {t("settings.updateUpToDate")}
            </p>
          )}
          {status === "available" && version && (
            <p className="mt-1 text-[11px] text-accent">
              {t("settings.updateVersion", { version })}
              {breaking && <span className="ml-2 text-bad">{t("update.breaking")}</span>}
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
            <button className="btn btn-primary" onClick={updater.install}>
              <Download size={14} /> {t("settings.updateInstall")}
            </button>
          )}
          {status === "installed" && (
            <button className="btn btn-primary" onClick={updater.restart}>
              <RefreshCw size={14} /> {t("settings.updateRestart")}
            </button>
          )}
          {(status === "uptodate" || status === "idle" || status === "error") && (
            <button className="btn btn-secondary" onClick={updater.refresh}>
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

      {status === "available" && body && (
        <div className="mt-3 max-h-36 overflow-auto border-t border-line pt-3">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">{t("settings.updateNotes")}</p>
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-4 text-muted">{body}</pre>
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <Checkbox
          checked={autoDownload}
          onChange={updater.setAutoDownload}
          label={t("settings.updateAuto")}
          size="sm"
        />
        <p className="mt-1 text-[10px] leading-4 text-muted">{t("settings.updateAutoHint")}</p>
      </div>
    </div>
  );
}
