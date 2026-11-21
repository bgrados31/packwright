import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n";
import { messageOf } from "../lib/error";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";

type Props = {
  kind: "pack" | "server";
  name: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

/** Confirmación destructiva: requiere escribir el nombre exacto para habilitar. */
export default function ConfirmDeleteModal({ kind, name, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useDialogKeyboard(() => { if (!busy) onCancel(); });
  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = typed.trim() === name;

  const confirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  };

  const title = kind === "pack" ? t("delete.packTitle") : t("delete.serverTitle");

  return createPortal(
    <div className="modal-backdrop" onClick={onBackdropClick(() => { if (!busy) onCancel(); })} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-card delete-modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <span className="modal-icon error"><AlertTriangle size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-[11px] text-muted">{t("delete.subtitle")}</p>
          </div>
          <button
            className="icon-btn"
            onClick={onCancel}
            disabled={busy}
            title={t("delete.cancel")}
            aria-label={t("delete.cancel")}
          >
            <X size={16} />
          </button>
        </div>

        <div className="delete-modal-body">
          <div className="delete-warning">
            <AlertTriangle size={14} className="shrink-0" />
            <span>{kind === "pack" ? t("delete.packWarning") : t("delete.serverWarning")}</span>
          </div>
          {kind === "server" && (
            <p className="mt-2 text-[11px] text-muted">{t("delete.stopHint")}</p>
          )}

          <p className="mt-4 font-mono text-[11px] text-muted">{name}</p>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("delete.nameLabel")}</span>
            <input
              ref={inputRef}
              className="field font-mono text-[12px]"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void confirm(); }}
              placeholder={t("delete.typeHint", { name })}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
          </label>
          {error && <p className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {t("delete.cancel")}
          </button>
          <button className="btn delete-danger-btn" onClick={() => void confirm()} disabled={!matches || busy}>
            <Trash2 size={14} /> {busy ? t("delete.deleting") : t("delete.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
