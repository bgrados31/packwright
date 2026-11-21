import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useI18n } from "../i18n";
import { onBackdropClick, useDialogKeyboard } from "../lib/useDialog";

export type PaletteAction = {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  hint?: string;
  run: () => void;
};

export default function CommandPalette({
  actions,
  onClose,
}: {
  actions: PaletteAction[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useDialogKeyboard(onClose);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) =>
      `${action.label} ${action.group}`.toLowerCase().includes(needle),
    );
  }, [actions, query]);

  useEffect(() => { setSelected(0); }, [query]);

  const run = (action?: PaletteAction) => {
    if (!action) return;
    action.run();
    onClose();
  };

  return createPortal(
    <div
      className="modal-backdrop palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("palette.title")}
      onClick={onBackdropClick(onClose)}
    >
      <div className="command-palette">
        <div className="command-palette-search">
          <Search size={16} className="text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((value) => Math.min(value + 1, filtered.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((value) => Math.max(value - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                run(filtered[selected]);
              }
              if (event.key === "Escape") onClose();
            }}
            placeholder={t("palette.placeholder")}
          />
          <button className="icon-btn !h-6 !w-6" onClick={onClose} title={t("palette.close")} aria-label={t("palette.close")}><X size={14} /></button>
        </div>
        <div className="command-palette-list">
          {filtered.length === 0 && <p className="p-4 text-center text-[12px] text-muted">{t("palette.empty")}</p>}
          {filtered.map((action, index) => (
            <button
              key={action.id}
              className={`command-item ${index === selected ? "active" : ""}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => run(action)}
            >
              <span className="text-accent">{action.icon}</span>
              <span className="min-w-0 flex-1 truncate text-left">
                <span className="block text-[12px]">{action.label}</span>
                <span className="block text-[10px] text-muted">{action.group}</span>
              </span>
              {action.hint && <kbd>{action.hint}</kbd>}
            </button>
          ))}
        </div>
        <div className="command-palette-foot">
          <span>↑↓ {t("palette.navigate")}</span>
          <span>↵ {t("palette.select")}</span>
          <span>esc {t("palette.close")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
