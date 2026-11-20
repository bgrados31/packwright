import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, FileArchive, FolderOpen, Loader2, RotateCcw, Terminal, X, XCircle } from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import type { ExportResult, OpLine } from "../lib/types";

type Props = {
  dir: string;
  packName: string;
  onClose: () => void;
};

type RunState = "running" | "success" | "error";

const BLOCKS = 12;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function ExportModal({ dir, packName, onClose }: Props) {
  const { t } = useI18n();
  const [lines, setLines] = useState<OpLine[]>([]);
  const [state, setState] = useState<RunState>("running");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = `export-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    setLines([]);
    setState("running");
    setResult(null);
    setError(null);

    listen<OpLine>("operation://line", (event) => {
      if (!disposed && event.payload.id === id) {
        setLines((previous) => [...previous.slice(-199), event.payload]);
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    invoke<ExportResult>("pack_export", { dir, id })
      .then((exported) => {
        if (disposed) return;
        setResult(exported);
        setState("success");
      })
      .catch((cause) => {
        if (disposed) return;
        const text = messageOf(cause);
        setError(text);
        setState("error");
        setLines((previous) => [...previous, { id, stream: "stderr", line: text }]);
      });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [dir, attempt]);

  useEffect(() => {
    const element = consoleRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  const joined = lines.map((line) => line.line).join(" ").toLowerCase();
  const stage: TranslationKey =
    state === "success"
      ? "export.done"
      : joined.includes("exported")
        ? "export.stagePacking"
        : joined.includes("reading external") || joined.includes("retrieving")
          ? "export.stageMods"
          : joined.includes("refreshing") || joined.includes("index")
            ? "export.stageIndex"
            : joined.includes("loading")
              ? "export.stageLoading"
              : "export.stagePreparing";

  const progress = state === "success"
    ? BLOCKS
    : Math.max(lines.length > 0 ? 1 : 0, Math.min(BLOCKS - 1, Math.ceil(lines.length / 2)));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("export.title")}>
      <div className="modal-card export-modal">
        <div className="modal-header">
          <span className={`modal-icon ${state}`}>
            {state === "running" ? (
              <Loader2 size={18} className="spin" />
            ) : state === "success" ? (
              <CheckCircle2 size={18} />
            ) : (
              <XCircle size={18} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("export.title")}</h2>
            <p className="truncate text-[11px] text-muted">{packName}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}>
            <X size={16} />
          </button>
        </div>

        <div className="export-progress">
          <div className="export-blocks">
            {Array.from({ length: BLOCKS }, (_, index) => (
              <span
                key={index}
                className={`export-block ${index < progress ? "on" : ""} ${state === "running" && index === progress ? "next" : ""}`}
                style={{ animationDelay: `${index * 45}ms` }}
              />
            ))}
          </div>
          <div className={`export-status ${state}`}>
            <span>{t(stage)}</span>
            <span className="font-mono text-[10px] opacity-70">{Math.round((progress / BLOCKS) * 100)}%</span>
          </div>
        </div>

        <div className="export-console-wrap">
          <div className="export-console-head">
            <span className="flex items-center gap-1.5"><Terminal size={12} /> {t("export.consoleTitle")}</span>
            <span className="font-mono text-[9px] opacity-60">{lines.length}</span>
          </div>
          <div className="console-box export-console" ref={consoleRef}>
            {lines.length === 0 ? (
              <div className="console-placeholder">
                <Terminal size={13} /> {t("output.empty")}
              </div>
            ) : (
              lines.map((line, index) => (
                <div key={index} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>
                  {line.line}
                </div>
              ))
            )}
            {state === "running" && <div className="console-line cursor">▍</div>}
          </div>
        </div>

        {result && (
          <div className="export-result">
            <FileArchive size={18} className="shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium">{result.name}</p>
              <p className="font-mono text-[10px] text-muted">{formatSize(result.size)} · .mrpack</p>
            </div>
            <CheckCircle2 size={15} className="shrink-0 text-ok" />
          </div>
        )}

        {error && <div className="modal-message error">{error}</div>}

        <div className="modal-footer">
          {state === "error" ? (
            <button className="btn btn-secondary" onClick={() => setAttempt((current) => current + 1)}>
              <RotateCcw size={14} /> {t("settings.retry")}
            </button>
          ) : state === "success" ? (
            <button
              className="btn btn-secondary"
              onClick={() => void invoke("open_path", { path: result?.output_dir ?? "" })}
            >
              <FolderOpen size={14} /> {t("export.viewFolder")}
            </button>
          ) : (
            <span className="text-[11px] text-muted">{t("export.working")}</span>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            {state === "success" ? t("export.done") : t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
