import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileArchive, FolderOpen, Globe2, Loader2, Search, X } from "lucide-react";
import { useI18n } from "../i18n";
import type { ModpackHit, PackInfo } from "../lib/types";

type Props = {
  onClose: () => void;
  onImported: (pack: PackInfo) => void;
};

type Mode = "file" | "modrinth" | "url";

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function compact(number: number): string {
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`;
  return String(number);
}

export default function ImportModal({ onClose, onImported }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("file");
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ModpackHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = async () => {
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
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setHits(await invoke<ModpackHit[]>("modpack_search", { query, limit: 12 }));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSearching(false);
    }
  };

  const pickHit = (hit: ModpackHit) => {
    setSource(`https://modrinth.com/modpack/${hit.slug || hit.id}`);
    setName(hit.title);
  };

  const onLink = (value: string) => {
    setSource(value.trim() || null);
    if (!name.trim()) {
      const last = value.trim().split("/").filter(Boolean).pop() ?? "";
      setName(last.replace(/\.mrpack$/i, ""));
    }
  };

  const run = async () => {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const pack = await invoke<PackInfo>("modpack_import_source", {
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

  const tabs: Array<[Mode, string, typeof FileArchive]> = [
    ["file", t("import.tabFile"), FileArchive],
    ["modrinth", t("import.tabModrinth"), Search],
    ["url", t("import.tabLink"), Globe2],
  ];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("import.title")}>
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-icon running"><FileArchive size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("import.title")}</h2>
            <p className="text-[11px] text-muted">{t("import.subtitle")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div className="flex gap-1 border-b border-line px-4">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] transition-colors ${mode === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}
              onClick={() => { setMode(id); setError(null); }}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <div style={{ padding: "16px 18px 0" }}>
          {mode === "file" && (
            <button className="export-platform w-full" onClick={() => void chooseFile()} disabled={busy}>
              <FolderOpen size={17} className="shrink-0 text-accent" />
              <span className="min-w-0 text-left">
                <span className="block truncate text-[12px] font-medium">{source ?? t("import.choose")}</span>
                <span className="block truncate text-[10px] text-muted">{t("import.hint")}</span>
              </span>
            </button>
          )}

          {mode === "modrinth" && (
            <div>
              <div className="flex gap-2">
                <input
                  className="field text-[12px]"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void search(); }}
                  placeholder={t("import.searchPlaceholder")}
                />
                <button className="btn btn-secondary shrink-0" disabled={searching || !query.trim()} onClick={() => void search()}>
                  {searching ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
                </button>
              </div>
              <div className="mt-3 flex max-h-56 flex-col gap-1 overflow-auto">
                {hits.map((hit) => (
                  <button
                    key={hit.id}
                    className={`flex items-center gap-2.5 rounded-lg p-2 text-left transition-colors ${source === `https://modrinth.com/modpack/${hit.slug || hit.id}` ? "bg-accent-soft" : "hover:bg-subtle"}`}
                    onClick={() => pickHit(hit)}
                  >
                    {hit.icon_url ? (
                      <img src={hit.icon_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-subtle text-accent"><FileArchive size={14} /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium">{hit.title}</span>
                      <span className="block truncate text-[10px] text-muted">{hit.description}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">{compact(hit.downloads)}</span>
                  </button>
                ))}
                {!hits.length && !searching && <p className="text-[11px] text-muted">{t("import.searchHint")}</p>}
              </div>
            </div>
          )}

          {mode === "url" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">{t("import.linkLabel")}</span>
              <input
                className="field font-mono text-[11px]"
                value={source ?? ""}
                onChange={(event) => onLink(event.target.value)}
                placeholder="https://modrinth.com/modpack/… o https://…/pack.mrpack"
                spellCheck={false}
              />
              <span className="text-[10px] text-muted">{t("import.linkHint")}</span>
            </label>
          )}

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
