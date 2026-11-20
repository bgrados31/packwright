import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitBranch, Loader2, Plus, RefreshCw, Tag, X } from "lucide-react";
import { useI18n } from "../i18n";

type Props = { dir: string; onClose: () => void };

type GitStatus = { initialized: boolean; branch: string; changed: string[]; clean: boolean };
type GitChange = { hash: string; message: string };

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function GitPanel({ dir, onClose }: Props) {
  const { t } = useI18n();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [message, setMessage] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<GitStatus>("git_status", { dir }).then(setStatus).catch((cause) => setError(messageOf(cause)));
    invoke<GitChange[]>("git_changelog", { dir }).then(setChanges).catch(() => setChanges([]));
  };

  useEffect(() => { refresh(); }, [dir]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("git.title")}>
      <div className="modal-card" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-icon running"><GitBranch size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("git.title")}</h2>
            <p className="text-[11px] text-muted">
              {status?.initialized ? `${t("git.branch")}: ${status.branch || "main"}` : t("git.notInitialized")}
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          {!status?.initialized && (
            <button className="btn btn-secondary w-full" onClick={() => void run(() => invoke("git_init", { dir }))} disabled={busy}>
              <Plus size={14} /> {t("git.init")}
            </button>
          )}

          {status?.initialized && (
            <>
              <div className={`serve-status ${status.clean ? "on" : ""}`}>
                <span className="text-[11px]">{status.clean ? t("git.clean") : `${status.changed.length} ${t("git.changed")}`}</span>
                <button className="icon-btn ml-auto !h-5 !w-5" onClick={refresh} title={t("common.refresh")}>
                  <RefreshCw size={12} />
                </button>
              </div>

              {status.changed.length > 0 && (
                <div className="mt-2 max-h-24 overflow-auto rounded-lg bg-subtle p-2">
                  {status.changed.slice(0, 12).map((line, index) => (
                    <p key={index} className="font-mono text-[10px] text-muted">{line}</p>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                <input
                  className="field text-[12px]"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={t("git.messagePlaceholder")}
                />
                <button className="btn btn-primary" disabled={busy || !message.trim()} onClick={() => void run(() => invoke("git_commit", { dir, message }))}>
                  {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                  {t("git.commit")}
                </button>
              </div>

              <div className="mt-3 flex gap-2">
                <input
                  className="field text-[12px]"
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder="v1.0.0"
                />
                <button className="btn btn-secondary shrink-0" disabled={busy || !tag.trim()} onClick={() => void run(() => invoke("git_tag", { dir, tag }))}>
                  <Tag size={13} /> {t("git.tag")}
                </button>
              </div>

              {changes.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("git.changelog")}</p>
                  <div className="max-h-28 overflow-auto rounded-lg border border-line">
                    {changes.map((change) => (
                      <div key={change.hash} className="flex gap-2 border-b border-line px-2 py-1.5 text-[11px] last:border-0">
                        <span className="font-mono text-accent">{change.hash}</span>
                        <span className="min-w-0 truncate text-muted">{change.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {error && <div className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}
