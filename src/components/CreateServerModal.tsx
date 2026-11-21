import { useEffect, useState } from "react";
import { messageOf } from "../lib/error";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useI18n } from "../i18n";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";
import type { ServerVersion } from "../lib/types";
import Select from "./Select";
import { Checkbox } from "./ui";

type Props = {
  detectedJava: string;
  detectedJavaMajor: number;
  onClose: () => void;
  onCreated: () => void;
};

const TEMPLATES = [
  "vanilla", "paper", "purpur", "fabric", "forge", "neoforge", "velocity",
];

function requiredJava(version: string): number {
  const parts = version.split(".").map(Number);
  const major = parts[0] ?? 0;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  if (major >= 26) return 25;
  if (major === 1 && minor >= 21) return 21;
  if (major === 1 && minor === 20 && patch >= 5) return 21;
  if (major === 1 && minor >= 18) return 17;
  if (major === 1 && minor === 17) return 16;
  return 8;
}

export default function CreateServerModal({ detectedJava, detectedJavaMajor, onClose, onCreated }: Props) {
  useDialogKeyboard(onClose);
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("paper");
  const [version, setVersion] = useState("");
  const [versions, setVersions] = useState<ServerVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [port, setPort] = useState(25565);
  const [java, setJava] = useState(detectedJava || "java");
  const [memory, setMemory] = useState(2048);
  const [motd, setMotd] = useState("Packwright server");
  const [onlineMode, setOnlineMode] = useState(true);
  const [jarUrl, setJarUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detectedJava) setJava(detectedJava);
  }, [detectedJava]);

  useEffect(() => {
    let cancelled = false;
    setVersionsLoading(true);
    invoke<ServerVersion[]>("server_versions", { template })
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        setVersion(list.find((item) => item.stable)?.id ?? list[0]?.id ?? "1.21.1");
      })
      .catch(() => {
        if (cancelled) return;
        setVersions([]);
        setVersion("1.21.1");
      })
      .finally(() => { if (!cancelled) setVersionsLoading(false); });
    return () => { cancelled = true; };
  }, [template, refreshKey]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await invoke("server_create", {
        name,
        template,
        version,
        port,
        java,
        jarUrl: jarUrl.trim() || null,
        memory,
        motd: motd.trim() || null,
        onlineMode,
      });
      onCreated();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onBackdropClick(() => { if (!busy) onClose(); })} role="dialog" aria-modal="true" aria-label={t("servers.new")}>
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-icon running"><Plus size={18} /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{t("servers.new")}</h2><p className="text-[11px] text-muted">{t("servers.newHint")}</p></div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="grid gap-3.5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("form.name")}</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="My server" /></label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("servers.template")}</span>
              <Select
                id="server-template"
                value={template}
                onChange={setTemplate}
                options={TEMPLATES.map((item) => ({ value: item, label: item.charAt(0).toUpperCase() + item.slice(1) }))}
              />
            </label>
          </div>
          <div className="grid grid-cols-[1fr_112px] gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="flex h-5 items-center justify-between text-xs text-muted">
                <span>{template === "velocity" ? t("servers.version") : t("form.minecraft")}</span>
                <button type="button" className="icon-btn !h-5 !w-5" onClick={() => setRefreshKey((value) => value + 1)} title={t("servers.refreshVersions")}>
                  <RefreshCw size={12} className={versionsLoading ? "spin" : ""} />
                </button>
              </span>
              {versions.length > 0 ? (
                <Select
                  id="server-version"
                  value={version}
                  onChange={setVersion}
                  searchable
                  searchPlaceholder={t("form.search")}
                  emptyLabel={t("form.noResults")}
                  options={versions.map((item) => ({
                    value: item.id,
                    label: item.id,
                    badge: item.stable && item.id === versions.find((candidate) => candidate.stable)?.id ? t("servers.latest") : undefined,
                  }))}
                />
              ) : (
                <input className="field" value={version} onChange={(event) => setVersion(event.target.value)} placeholder={versionsLoading ? t("servers.versionsLoading") : "1.21.1"} />
              )}
            </label>
            <label className="flex flex-col gap-1.5"><span className="flex h-5 items-center text-xs text-muted">{t("servers.port")}</span><input className="field" type="number" min={1} max={65535} value={port} onChange={(event) => setPort(Number(event.target.value))} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("servers.memory")} (MB)</span>
              <input className="field" type="number" min={512} max={16384} step={512} value={memory} onChange={(event) => setMemory(Number(event.target.value))} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("servers.java")}</span>
              <input className="field font-mono text-[11px]" value={java} onChange={(event) => setJava(event.target.value)} />
              {!java.trim() && <span className="text-[10px] text-[var(--pw-bad)]">{t("servers.javaMissing")}</span>}
              {detectedJavaMajor > 0 && detectedJavaMajor < requiredJava(version) && (
                <span className="text-[10px] text-[var(--pw-bad)]">
                  {t("servers.javaIncompatible", { need: requiredJava(version), have: detectedJavaMajor })}
                </span>
              )}
            </label>
          </div>
          <label className="flex flex-col gap-1.5"><span className="text-xs text-muted">{t("servers.motd")}</span><input className="field" value={motd} onChange={(event) => setMotd(event.target.value)} /></label>
          <Checkbox checked={onlineMode} onChange={setOnlineMode} label={t("servers.online")} size="sm" />
          <p className="-mt-1 text-[11px] leading-4 text-muted">{t("servers.versionHint", { provider: template })}</p>
          <details className="group text-sm" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
            <summary className="flex cursor-pointer items-center gap-1.5 py-1 text-xs text-muted transition-colors hover:text-ink">{t("servers.advanced")}</summary>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{t("servers.jarUrl")}</span>
                <input className="field font-mono text-[11px]" value={jarUrl} onChange={(event) => setJarUrl(event.target.value)} placeholder="https://…/server.jar" spellCheck={false} />
              </label>
              <button className="btn btn-ghost text-[11px]" onClick={() => void openUrl(`https://papermc.io/downloads/${template}`)}>
                <Download size={12} /> {t("servers.getJar")}
              </button>
            </div>
          </details>
          {error && <div className="modal-message error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
          <button className="btn btn-primary" onClick={() => void create()} disabled={busy || !name.trim() || !version.trim()}>
            {busy ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}{t("servers.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
