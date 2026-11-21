import { useEffect } from "react";
import { Download, RefreshCw, TriangleAlert, X } from "lucide-react";
import { useI18n } from "../i18n";
import { updater, useUpdater } from "../lib/updater";

/** Aviso flotante inferior de actualizaciones: discreto, no bloquea la UI. */
export default function UpdateToast() {
  const { t } = useI18n();
  const { status, currentVersion, version, body, breaking, progress, visible, error } = useUpdater();

  // Las actualizaciones normales se ocultan solas; las que rompen compatibilidad
  // se quedan hasta que el usuario las descarga o las descarta.
  useEffect(() => {
    if (!visible || status !== "available" || breaking) return;
    const timer = window.setTimeout(updater.dismiss, 10000);
    return () => window.clearTimeout(timer);
  }, [visible, status, breaking]);

  if (!visible) return null;
  if (!["available", "downloading", "installed", "error"].includes(status)) return null;

  const notes = body.split("\n").filter(Boolean).slice(0, 3).join(" ").slice(0, 220);
  const isError = status === "error";

  return (
    <div className="update-toast" role="status" aria-live="polite">
      <span className={`update-toast-icon ${isError ? "bad" : ""}`}>
        {isError ? <TriangleAlert size={17} /> : status === "installed" ? <RefreshCw size={17} /> : <Download size={17} />}
      </span>

      <div className="update-toast-body">
        <div className="update-toast-heading">
          <p className="update-toast-title">
            {isError
              ? t("update.failed")
              : status === "installed"
                ? t("update.readyTitle")
                : status === "downloading"
                  ? t("update.downloading")
                  : t("update.availableTitle")}
          </p>
          {breaking && status !== "installed" && (
            <span className="update-toast-badge">{t("update.breaking")}</span>
          )}
        </div>

        {version && status !== "installed" && (
          <p className="update-toast-version">
            {currentVersion ? `v${currentVersion} → ` : ""}v{version}
          </p>
        )}

        {isError ? (
          <p className="update-toast-notes">{error || t("settings.updateError")}</p>
        ) : (
          <>
            {notes && status === "available" && (
              <p className="update-toast-notes">{notes}</p>
            )}
            {status === "downloading" && (
              <div className="update-toast-progress">
                <div className="update-toast-progress-fill" style={{ width: `${progress}%` }} />
              </div>
            )}
            {status === "downloading" && <p className="update-toast-notes">{progress}%</p>}
          </>
        )}
      </div>

      <div className="update-toast-actions">
        {status === "available" && (
          <button className="btn btn-primary" onClick={updater.install}>
            <Download size={14} /> {t("update.download")}
          </button>
        )}
        {status === "installed" && (
          <button className="btn btn-primary" onClick={updater.restart}>
            <RefreshCw size={14} /> {t("settings.updateRestart")}
          </button>
        )}
        <button className="icon-btn" onClick={updater.dismiss} title={t("update.later")} aria-label={t("update.later")}>
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
