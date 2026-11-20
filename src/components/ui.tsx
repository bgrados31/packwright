import type { ReactNode, RefObject } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";

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
          title="Clear"
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
