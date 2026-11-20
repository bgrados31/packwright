import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ExternalLink, KeyRound, Loader2, Play, Save, Square, Wifi, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useI18n } from "../i18n";
import type { OpLine } from "../lib/types";

type PlayitStatus = {
  installed: boolean;
  path: string;
  has_secret: boolean;
  running: boolean;
};

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export default function PlayitModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<PlayitStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [lines, setLines] = useState<OpLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    invoke<PlayitStatus>("playit_status").then(setStatus).catch((cause) => setError(messageOf(cause)));
  };

  useEffect(() => {
    refresh();
    invoke<string>("playit_get_secret").then(setSecret).catch(() => undefined);
    let unlisten: (() => void) | undefined;
    listen<OpLine>("operation://line", (event) => {
      if (event.payload.id.startsWith("playit")) {
        setLines((previous) => [...previous.slice(-99), event.payload]);
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("playit.title")}>
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className={`modal-icon ${status?.running ? "success" : "running"}`}><Wifi size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("playit.title")}</h2>
            <p className="text-[11px] text-muted">{t("playit.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          <div className="flex flex-wrap gap-1.5">
            <span className={`chip ${status?.installed ? "chip-accent" : ""}`}>
              {status?.installed ? t("playit.agentReady") : t("playit.agentMissing")}
            </span>
            <span className={`chip ${status?.has_secret ? "chip-accent" : ""}`}>
              {status?.has_secret ? t("playit.secretReady") : t("playit.secretMissing")}
            </span>
            <span className={`chip ${status?.running ? "chip-accent" : ""}`}>
              {status?.running ? t("playit.running") : t("playit.stopped")}
            </span>
          </div>

          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs text-muted">{t("playit.secret")}</span>
            <div className="flex gap-2">
              <input
                className="field font-mono text-[11px]"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="••••••••••••••••"
                autoComplete="off"
              />
              <button className="btn btn-secondary shrink-0" disabled={busy || !secret.trim()} onClick={() => void run(() => invoke("playit_set_secret", { secret }))}>
                <Save size={14} /> {t("common.save")}
              </button>
            </div>
          </label>

          <button className="btn btn-ghost mt-2 text-[11px]" onClick={() => void openUrl("https://playit.gg/account/setup/wizard") }>
            <ExternalLink size={12} /> {t("playit.getSecret")}
          </button>

          <div className="mt-4 flex items-center gap-2">
            <button className="btn btn-secondary flex-1" disabled={busy || status?.installed} onClick={() => void run(() => invoke("playit_install_agent", { id: `playit-install-${Date.now()}` }))}>
              {busy ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />}
              {status?.installed ? t("playit.installed") : t("playit.install")}
            </button>
            {status?.running ? (
              <button className="btn btn-secondary" disabled={busy} onClick={() => void run(() => invoke("playit_stop"))}>
                <Square size={14} /> {t("servers.stop")}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy || !status?.installed || !status?.has_secret} onClick={() => void run(() => invoke("playit_start", { id: `playit-start-${Date.now()}` }))}>
                <Play size={14} /> {t("servers.start")}
              </button>
            )}
          </div>

          {lines.length > 0 && (
            <div className="mt-4 max-h-32 overflow-auto rounded-lg bg-subtle p-2">
              {lines.slice(-10).map((line, index) => (
                <div key={index} className={`console-line ${line.stream === "stderr" ? "err" : ""}`}>{line.line}</div>
              ))}
            </div>
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
