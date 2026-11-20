import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  Download,
  Loader2,
  Pin,
  PinOff,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Terminal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { ModOperation, OpLine } from "../lib/types";

type Props = {
  operation: ModOperation;
  onClose: () => void;
  onSuccess: () => void;
};

type RunState = "running" | "success" | "error";

const BLOCKS = 10;

const ICONS = {
  add: Download,
  remove: Trash2,
  pin: Pin,
  unpin: PinOff,
  update: RefreshCw,
  refresh: RotateCw,
};

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function OperationModal({ operation, onClose, onSuccess }: Props) {
  const { t } = useI18n();
  const [lines, setLines] = useState<OpLine[]>([]);
  const [state, setState] = useState<RunState>("running");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const consoleRef = useRef<HTMLDivElement>(null);
  const Icon = ICONS[operation.kind];

  useEffect(() => {
    const id = `mod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    setLines([]);
    setState("running");
    setError(null);

    listen<OpLine>("operation://line", (event) => {
      if (!disposed && event.payload.id === id) {
        setLines((previous) => [...previous.slice(-199), event.payload]);
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    const call = operation.kind === "add"
      ? invoke("mods_add", {
          dir: operation.dir,
          projectId: operation.projectId,
          versionId: operation.versionId,
          id,
        })
      : invoke("mods_command", {
          dir: operation.dir,
          action: operation.kind,
          name: operation.name,
          id,
        });

    call
      .then(() => {
        if (disposed) return;
        setState("success");
        onSuccess();
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
  }, [operation, attempt]);

  useEffect(() => {
    const element = consoleRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  const progress = state === "success"
    ? BLOCKS
    : Math.max(lines.length > 0 ? 1 : 0, Math.min(BLOCKS - 1, Math.ceil(lines.length / 2)));

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={operation.label}>
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
            <h2 className="text-sm font-semibold">{operation.label}</h2>
            <p className="truncate text-[11px] text-muted">
              {operation.modName ?? operation.name ?? t("mods.operationRunning")}
            </p>
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
            <span className="flex items-center gap-1.5">
              <Icon size={12} />
              {state === "success" ? t("mods.operationDone") : t("output.empty")}
            </span>
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

        {error && <div className="modal-message error">{error}</div>}

        <div className="modal-footer">
          {state === "error" ? (
            <button className="btn btn-secondary" onClick={() => setAttempt((current) => current + 1)}>
              <RotateCcw size={14} /> {t("settings.retry")}
            </button>
          ) : (
            <span className="text-[11px] text-muted">
              {state === "running" ? t("export.working") : t("mods.operationDone")}
            </span>
          )}
          <button className="btn btn-primary" onClick={onClose}>
            {state === "success" ? t("export.done") : t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
