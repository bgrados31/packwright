import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  badge?: string;
};

type Props = {
  id?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
};

type Position = { top: number; left: number; width: number };

export default function Select({
  id,
  options,
  value,
  onChange,
  placeholder = "",
  searchable = false,
  searchPlaceholder = "Search…",
  emptyLabel = "No results",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0, width: 0 });
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter(
      (option) => option.label.toLowerCase().includes(term) || option.value.toLowerCase().includes(term),
    );
  }, [options, query]);

  const selected = options.find((option) => option.value === value);

  const updatePosition = useCallback(() => {
    const element = trigger.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const estimatedHeight = searchable ? 296 : 250;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setPosition({
      top: placeAbove ? Math.max(8, rect.top - estimatedHeight - 6) : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [searchable]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    if (searchable) searchInput.current?.focus();
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, searchable, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const index = filtered.findIndex((option) => option.value === value);
    setActive(index >= 0 ? index : 0);
  }, [open, filtered, value]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open && ["Enter", " ", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[active];
      if (option) commit(option.value);
    }
  };

  return (
    <div className="select-root" ref={root}>
      <button
        ref={trigger}
        type="button"
        id={id}
        className={`select-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "truncate" : "select-placeholder truncate"}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          className={`select-chevron ${open ? "open" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            ref={panel}
            className="select-panel"
            style={{ top: position.top, left: position.left, width: position.width }}
            role="listbox"
          >
            {searchable && (
              <div className="select-search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-4-4" />
                </svg>
                <input
                  ref={searchInput}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={searchPlaceholder}
                />
              </div>
            )}

            <div className="select-list" ref={list} role="presentation">
              {filtered.length === 0 && <div className="select-empty">{emptyLabel}</div>}
              {filtered.map((option, index) => (
                <button
                  type="button"
                  key={option.value}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  className={`select-option ${index === active ? "active" : ""} ${option.value === value ? "selected" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(option.value)}
                >
                  <span className="truncate">{option.label}</span>
                  {option.badge && <span className="select-badge">{option.badge}</span>}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
