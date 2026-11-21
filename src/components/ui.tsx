import { useEffect, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, LayoutGrid, List, Search, X } from "lucide-react";
import { useI18n } from "../i18n";

/** Campo de búsqueda con icono, botón limpiar y sugerencia de atajo. */
export function SearchField({
  value,
  onChange,
  placeholder,
  inputRef,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        className="field field-icon"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
      />
      {value ? (
        <button
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-ink"
          onClick={() => onChange("")}
          title={t("common.clear")}
          aria-label={t("common.clear")}
        >
          <X size={13} />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-muted">
          /
        </kbd>
      )}
    </div>
  );
}

export type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
};

/** Menú contextual reutilizable, anclado al cursor y cerrado al hacer clic fuera. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);

  const left = Math.max(4, Math.min(x, window.innerWidth - 210));
  const top = Math.max(4, Math.min(y, window.innerHeight - items.length * 34 - 16));

  return createPortal(
    <div className="context-menu" style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
      {items.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          className={`context-item ${item.danger ? "danger" : ""}`}
          disabled={item.disabled}
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          {item.icon}
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          {item.shortcut && <kbd>{item.shortcut}</kbd>}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/** Checkbox con apariencia propia, accesible y reutilizable. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  size = "md",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <label className={`ui-checkbox ${size === "sm" ? "sm" : ""} ${disabled ? "disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <span className="ui-checkbox-box">
        <Check size={size === "sm" ? 11 : 12} strokeWidth={3} />
      </span>
      {label && <span className="ui-checkbox-label">{label}</span>}
    </label>
  );
}

export type FilterOption = {
  value: string;
  label: string;
  count?: number;
};

/** Grupo de chips de filtro de selección única. */
export function FilterChips({
  options,
  value,
  onChange,
}: {
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          className={`filter-chip ${value === option.value ? "active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="filter-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

const TAG_TONES = 8;

function tagIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % TAG_TONES;
}

/** Etiqueta con color determinista a partir de una semilla (categoría, loader, etc.). */
export function Tag({ children, seed, tone }: { children: ReactNode; seed?: string; tone?: string }) {
  const className = tone ?? `tag-${(seed ? tagIndex(seed) : 0) + 1}`;
  return <span className={`ui-tag ${className}`}>{children}</span>;
}

/** Alternador cuadrícula / lista reutilizable. */
export function ViewToggle({
  value,
  onChange,
  labels,
}: {
  value: "grid" | "list";
  onChange: (value: "grid" | "list") => void;
  labels: { grid: string; list: string };
}) {
  return (
    <div className="view-toggle">
      <button
        className={value === "grid" ? "active" : ""}
        onClick={() => onChange("grid")}
        title={labels.grid}
        aria-label={labels.grid}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        className={value === "list" ? "active" : ""}
        onClick={() => onChange("list")}
        title={labels.list}
        aria-label={labels.list}
      >
        <List size={14} />
      </button>
    </div>
  );
}
