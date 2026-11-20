import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  FileArchive,
  FolderOpen,
  Loader2,
  Package,
  RotateCcw,
  Server,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import type { ExportResult, ExportValidation, OpLine } from "../lib/types";

type Props = {
  dir: string;
  packName: string;
  onClose: () => void;
};

type Phase = "select" | "checking" | "review" | "running" | "success" | "error";
type Format = "modrinth" | "curseforge";

const BLOCKS = 10;

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
  const [phase, setPhase] = useState<Phase>("select");
  const [format, setFormat] = useState<Format>("modrinth");
  const [side, setSide] = useState<"client" | "server">("client");
  const [validation, setValidation] = useState<ExportValidation | null>(null);
  const [lineCount, setLineCount] = useState(0);
  const [lastLine, setLastLine] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const validate = () => {
    setPhase("checking");
    setValidation(null);
    setError(null);
    setResult(null);
    invoke<ExportValidation>("export_validate", { dir })
      .then((value) => {
        setValidation(value);
        setPhase(value.ok ? "running" : "review");
      })
      .catch(() => {
        setValidation({ ok: true, issues: [] });
        setPhase("running");
      });
  };

  useEffect(() => {
    if (phase !== "running") return;
    const id = `export-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    setLineCount(0);
    setLastLine("");

    listen<OpLine>("operation://line", (event) => {
      if (disposed || event.payload.id !== id) return;
      setLineCount((value) => value + 1);
      setLastLine(event.payload.line);
    }).then((fn) => { unlisten = fn; });

    invoke<ExportResult>("pack_export", { dir, id, format, side })
      .then((exported) => {
        if (disposed) return;
        setResult(exported);
        setPhase("success");
      })
      .catch((cause) => {
        if (disposed) return;
        setError(messageOf(cause));
        setPhase("error");
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [phase, dir, format, side, attempt]);

  const stage: TranslationKey =
    phase === "success"
      ? "export.done"
      : lastLine.toLowerCase().includes("exported")
        ? "export.stagePacking"
        : lastLine.toLowerCase().includes("retriev")
          ? "export.stageMods"
          : lastLine.toLowerCase().includes("index")
            ? "export.stageIndex"
            : "export.stagePreparing";

  const progress = phase === "success"
    ? BLOCKS
    : Math.max(lineCount > 0 ? 1 : 0, Math.min(BLOCKS - 1, Math.ceil(lineCount / 2)));

  const busy = phase === "checking" || phase === "running";
  const showPicker = phase === "select" || phase === "review" || phase === "checking";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("export.title")}>
      <div className="modal-card export-modal">
        <div className="modal-header">
          <span className={`modal-icon ${phase === "success" ? "success" : phase === "error" || phase === "review" ? "error" : "running"}`}>
            {busy ? (
              <Loader2 size={18} className="spin" />
            ) : phase === "success" ? (
              <CheckCircle2 size={18} />
            ) : phase === "error" || phase === "review" ? (
              <XCircle size={18} />
            ) : (
              <Package size={18} />
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

        {showPicker && (
          <div className="export-picker">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("export.stepPlatform")}</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "modrinth" as const, icon: Package, label: t("export.formatModrinth"), hint: t("export.hintModrinth") },
                { id: "curseforge" as const, icon: FileArchive, label: t("export.formatCurseforge"), hint: t("export.hintCurseforge") },
              ]).map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    className={`export-platform ${format === option.id ? "active" : ""}`}
                    onClick={() => setFormat(option.id)}
                    disabled={busy}
                  >
                    <Icon size={18} className="shrink-0 text-accent" />
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[12px] font-medium">{option.label}</span>
                      <span className="block truncate text-[10px] text-muted">{option.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {format === "curseforge" && (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("export.stepSide")}</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: "client" as const, label: t("mods.envClient") },
                    { id: "server" as const, label: t("mods.envServer") },
                  ]).map((option) => (
                    <button
                      key={option.id}
                      className={`export-side ${side === option.id ? "active" : ""}`}
                      onClick={() => setSide(option.id)}
                      disabled={busy}
                    >
                      <Server size={13} className="shrink-0" /> {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phase === "review" && validation && (
              <div className="mod-analysis warn" style={{ margin: "14px 0 0" }}>
                <div className="flex w-full items-start gap-2">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t("export.issuesTitle", { count: validation.issues.length })}</p>
                    <ul className="mt-1 list-disc pl-4 text-[11px] opacity-90">
                      {validation.issues.map((issue, index) => <li key={index}>{issue}</li>)}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {(phase === "running" || phase === "success" || phase === "error") && (
          <div className="export-progress">
            <div className="export-blocks">
              {Array.from({ length: BLOCKS }, (_, index) => (
                <span
                  key={index}
                  className={`export-block ${index < progress ? "on" : ""} ${phase === "running" && index === progress ? "next" : ""}`}
                  style={{ animationDelay: `${index * 45}ms` }}
                />
              ))}
            </div>
            <div className={`export-status ${phase === "success" ? "success" : phase === "error" ? "error" : ""}`}>
              <span>{t(stage)}</span>
              <span className="font-mono text-[10px] opacity-70">{Math.round((progress / BLOCKS) * 100)}%</span>
            </div>
            {result && (
              <div className="export-result" style={{ margin: "14px 0 0" }}>
                <FileArchive size={18} className="shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">{result.name}</p>
                  <p className="font-mono text-[10px] text-muted">{formatSize(result.size)} · {format === "curseforge" ? "zip" : "mrpack"}</p>
                </div>
                <CheckCircle2 size={15} className="shrink-0 text-ok" />
              </div>
            )}
            {error && <div className="modal-message error" style={{ margin: "12px 0 0" }}>{error}</div>}
          </div>
        )}

        <div className="modal-footer">
          <div className="flex min-w-0 items-center gap-2">
            {phase === "error" ? (
              <button className="btn btn-secondary" onClick={() => setAttempt((value) => value + 1)}>
                <RotateCcw size={14} /> {t("settings.retry")}
              </button>
            ) : phase === "success" ? (
              <button className="btn btn-secondary" onClick={() => void invoke("open_path", { path: result?.output_dir ?? "" })}>
                <FolderOpen size={14} /> {t("export.viewFolder")}
              </button>
            ) : phase === "select" || phase === "review" ? (
              <button className="btn btn-primary" onClick={validate} disabled={busy}>
                {phase === "review" ? t("export.exportAnyway") : t("export.start")}
              </button>
            ) : (
              <span className="text-[11px] text-muted">{t("export.working")}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {phase === "success" && (
              <button className="btn btn-ghost" onClick={() => { setPhase("select"); setAttempt((value) => value + 1); }}>
                {t("export.another")}
              </button>
            )}
            <button className={`btn ${phase === "success" ? "btn-primary" : "btn-secondary"}`} onClick={onClose} disabled={busy}>
              {phase === "success" ? t("export.done") : t("common.close")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
