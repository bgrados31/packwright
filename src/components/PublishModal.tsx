import { useState } from "react";
import { messageOf } from "../lib/error";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CheckCircle2, ExternalLink, Loader2, Rocket, X } from "lucide-react";
import { useI18n } from "../i18n";
import { useDialogKeyboard } from "../lib/useDialog";

type Props = {
  dir: string;
  projectId: string;
  hasToken: boolean;
  onClose: () => void;
};

export default function PublishModal({ dir, projectId, hasToken, onClose }: Props) {
  useDialogKeyboard(onClose);
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [changelog, setChangelog] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = hasToken && Boolean(projectId.trim());

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await invoke<{ id?: string }>("modrinth_publish", {
        dir,
        versionName: name.trim() || null,
        changelog: changelog.trim() || null,
        id: `publish-${Date.now()}`,
      });
      setResult(response?.id ?? t("publish.ok"));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("publish.title")}>
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className={`modal-icon ${result ? "success" : "running"}`}>
            {result ? <CheckCircle2 size={18} /> : <Rocket size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("publish.title")}</h2>
            <p className="text-[11px] text-muted">{t("publish.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          {!configured ? (
            <div className="mod-analysis warn" style={{ margin: 0 }}>
              <p>{t("publish.notConfigured")}</p>
            </div>
          ) : result ? (
            <div className="mod-analysis ok" style={{ margin: 0 }}>
              <p>{t("publish.success", { id: result })}</p>
              <button
                className="btn btn-ghost mt-2 text-[11px]"
                onClick={() => void openUrl(`https://modrinth.com/project/${projectId}`)}
              >
                <ExternalLink size={12} /> {t("publish.openProject")}
              </button>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t("publish.versionName")}</span>
                <input className="field text-[12px]" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("publish.versionPlaceholder")} />
              </label>
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t("publish.changelog")}</span>
                <textarea className="field resize-y text-[12px]" rows={4} value={changelog} onChange={(event) => setChangelog(event.target.value)} />
              </label>
            </>
          )}
          {error && <div className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
          {!result && (
            <button className="btn btn-primary" onClick={() => void publish()} disabled={!configured || busy}>
              {busy ? <Loader2 size={14} className="spin" /> : <Rocket size={14} />}
              {busy ? t("publish.publishing") : t("publish.start")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
