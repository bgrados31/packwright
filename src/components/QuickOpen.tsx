import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search } from "lucide-react";
import { useI18n } from "../i18n";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";

export type QuickFile = { root: string; path: string; name: string };

const ROOT_LABELS: Record<string, string> = {
  pack: "PACK",
  packwiz: "PACKWIZ",
  packwright: "PW",
  instance: "GAME",
};

/** Apertura rápida de cualquier archivo del pack o de la instancia (Ctrl+P). */
export default function QuickOpen({
  files,
  onClose,
  onOpen,
}: {
  files: QuickFile[];
  onClose: () => void;
  onOpen: (root: string, path: string, name: string) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useDialogKeyboard(onClose);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return files.slice(0, 60);
    const scored = files
      .map((file) => {
        const haystack = `${file.name} ${file.path}`.toLowerCase();
        const index = haystack.indexOf(needle);
        if (index >= 0) return { file, score: index };
        // Coincidencia por subsecuencia: "opttx" encuentra "options.txt".
        let cursor = 0;
        for (const char of needle) {
          cursor = haystack.indexOf(char, cursor);
          if (cursor < 0) return null;
          cursor += 1;
        }
        return { file, score: 1000 };
      })
      .filter((item): item is { file: QuickFile; score: number } => item !== null)
      .sort((a, b) => a.score - b.score || a.file.path.localeCompare(b.file.path));
    return scored.slice(0, 60).map((item) => item.file);
  }, [files, query]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const open = (file?: QuickFile) => {
    if (!file) return;
    onOpen(file.root, file.path, file.name);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onBackdropClick(onClose)} role="dialog" aria-modal="true" aria-label={t("editor.quickOpen")}>
      <div className="quick-open">
        <div className="quick-open-search">
          <Search size={16} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((value) => Math.min(value + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                open(results[selected]);
              }
            }}
            placeholder={t("editor.quickOpenPlaceholder")}
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="quick-open-list" ref={listRef}>
          {results.length === 0 && <p className="p-4 text-center text-xs text-muted">{t("editor.quickOpenEmpty")}</p>}
          {results.map((file, index) => (
            <button
              key={`${file.root}:${file.path}`}
              data-index={index}
              className={`quick-open-item ${index === selected ? "active" : ""}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => open(file)}
            >
              <FileText size={14} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[12px]">{file.name}</span>
                <span className="block truncate font-mono text-[10px] text-muted">{file.path}</span>
              </span>
              <span className={`quick-root quick-root-${file.root}`}>{ROOT_LABELS[file.root] ?? file.root.toUpperCase()}</span>
            </button>
          ))}
        </div>
        <div className="quick-open-foot">
          <span>↑↓ {t("palette.navigate")}</span>
          <span>↵ {t("palette.select")}</span>
          <span className="ml-auto font-mono">{results.length} {t("palette.results")}</span>
        </div>
      </div>
    </div>
  );
}
