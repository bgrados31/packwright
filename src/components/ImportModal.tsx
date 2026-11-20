import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileArchive, FolderOpen, Loader2, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { PackInfo } from "../lib/types";

type Props = {
  onClose: () => void;
  onImported: (pack: PackInfo) => void;
};

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function ImportModal({ onClose, onImported }: Props) {
  const { t } = useI18n();
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(true);

  const chooseFile = async () => {
    setSelecting(true);
    setError(null);
    try {
      const path = await invoke<string | null>("pick_file");
      if (path) {
        setSource(path);
        const file = path.split(/[\\/]/).pop() ?? "pack";
        setName(file.replace(/\.mrpack$/i, ""));
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSelecting(false);
    }
  };

  useEffect(() => {
    void chooseFile();
  }, []);

  const run = async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const pack = await invoke<PackInfo>("pack_import", {
        source,
        name: name.trim() || null,
        id: `import-${Date.now()}`,
      });
      onImported(pack);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("import.title")}>
      <div className="modal-card" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-icon running"><FileArchive size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("import.title")}</h2>
            <p className="text-[11px] text-muted">{t("import.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          <button className="export-platform" onClick={() => void chooseFile()} disabled={busy}>
            <FolderOpen size={17} className="shrink-0 text-accent" />
            <span className="min-w-0 text-left">
              <span className="block truncate text-[12px] font-medium">{source ?? t("import.choose")}</span>
              <span className="block truncate text-[10px] text-muted">
                {selecting ? t("import.selecting") : t("import.hint")}
              </span>
            </span>
          </button>

          {source && (
            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("form.name")}</span>
              <input
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("form.namePlaceholder")}
              />
            </label>
          )}

          {error && <div className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>{t("common.close")}</button>
          <button className="btn btn-primary" onClick={() => void run()} disabled={!source || busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <FileArchive size={14} />}
            {busy ? t("import.importing") : t("import.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
