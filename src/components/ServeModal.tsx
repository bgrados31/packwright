import { useEffect, useState } from "react";
import { messageOf } from "../lib/error";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Copy, ExternalLink, Loader2, Radio, Square, X } from "lucide-react";
import { useI18n } from "../i18n";
import { useDialogKeyboard } from "../lib/useDialog";
import { fireAndForget } from "../lib/error";

type Props = {
  dir: string;
  port: number;
  onClose: () => void;
};

export default function ServeModal({ dir, port, onClose }: Props) {
  useDialogKeyboard(onClose);
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>("serve_status")
      .then(setRunning)
      .catch(() => setRunning(false));
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await invoke<string>("serve_start", {
        dir,
        port,
        id: `serve-${Date.now()}`,
      });
      setUrl(result);
      setRunning(true);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await invoke("serve_stop");
      setRunning(false);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("serve.title")}>
      <div className="modal-card" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <span className={`modal-icon ${running ? "success" : "running"}`}>
            <Radio size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("serve.title")}</h2>
            <p className="text-[11px] text-muted">{t("serve.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          <div className={`serve-status ${running ? "on" : ""}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: running ? "var(--pw-ok)" : "var(--pw-muted)" }} />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {running ? url || `http://localhost:${port}` : t("serve.stopped")}
            </span>
          </div>

          {running && (
            <div className="mt-3 flex gap-2">
              {url && (
                <>
                  <button className="btn btn-secondary flex-1" onClick={() => void openUrl(url)}>
                    <ExternalLink size={13} /> {t("serve.open")}
                  </button>
                  <button className="btn btn-ghost px-3" onClick={() => fireAndForget(navigator.clipboard.writeText(url))} title={t("editor.copyPath")}>
                    <Copy size={13} />
                  </button>
                </>
              )}
            </div>
          )}

          <p className="mt-4 text-[11px] leading-5 text-muted">{t("serve.hint")}</p>
          {error && <div className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
          {running ? (
            <button className="btn btn-secondary" onClick={() => void stop()} disabled={busy}>
              <Square size={13} /> {t("serve.stop")}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => void start()} disabled={busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Radio size={14} />}
              {t("serve.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
