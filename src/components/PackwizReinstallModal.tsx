import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, Loader2, RotateCcw, Terminal, X, XCircle } from "lucide-react";
import { useI18n } from "../i18n";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";
import type { OpLine, PackwizStatus } from "../lib/types";

type Props = {
  onClose: () => void;
  onInstalled: (status: PackwizStatus) => void;
};

type RunState = "running" | "success" | "error";

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function PackwizReinstallModal({ onClose, onInstalled }: Props) {
  useDialogKeyboard(onClose);
  const { t } = useI18n();
  const [lines, setLines] = useState<OpLine[]>([]);
  const [state, setState] = useState<RunState>("running");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const consoleRef = useRef<HTMLDivElement>(null);
  const onInstalledRef = useRef(onInstalled);
  const tRef = useRef(t);
  onInstalledRef.current = onInstalled;
  tRef.current = t;

  useEffect(() => {
    const id = `reinstall-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    setLines([]);
    setState("running");
    setMessage("");

    listen<OpLine>("operation://line", (event) => {
      if (!disposed && event.payload.id === id) {
        setLines((previous) => [...previous.slice(-199), event.payload]);
      }
    }).then((unlisten) => {
      // El efecto puede desmontarse antes de que `listen` resuelva: cancelar
      // aquí evita dejar un listener huérfano para siempre.
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    });

    invoke<PackwizStatus>("packwiz_reinstall", { id })
      .then((status) => {
        if (disposed) return;
        setState("success");
        setMessage(tRef.current("settings.packwizSuccess"));
        onInstalledRef.current(status);
      })
      .catch((error) => {
        if (disposed) return;
        const text = errorMessage(error);
        setState("error");
        setMessage(text);
        setLines((previous) => [...previous, { id, stream: "stderr", line: text }]);
      });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [attempt]);

  useEffect(() => {
    const element = consoleRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines]);

  return (
    <div className="modal-backdrop" onClick={onBackdropClick(() => { if (state !== "running") onClose(); })} role="dialog" aria-modal="true" aria-label={t("settings.packwizReinstallTitle")}>
      <div className="modal-card modal-console">
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
            <h2 className="text-sm font-semibold">{t("settings.packwizReinstallTitle")}</h2>
            <p className="text-[11px] text-muted">{t("settings.packwizReinstallSubtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")} disabled={state === "running"}>
            <X size={16} />
          </button>
        </div>

        <div className="console-box" ref={consoleRef}>
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

        {message && <div className={`modal-message ${state}`}>{message}</div>}

        <div className="modal-footer">
          {state === "error" ? (
            <button className="btn btn-secondary" onClick={() => setAttempt((current) => current + 1)}>
              <RotateCcw size={14} /> {t("settings.retry")}
            </button>
          ) : (
            <span className="text-[11px] text-muted">
              {state === "running" ? t("settings.installing") : t("settings.packwizReady")}
            </span>
          )}
          <button className="btn btn-primary" onClick={onClose} disabled={state === "running"}>
            {state === "running" ? t("settings.installing") : t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
