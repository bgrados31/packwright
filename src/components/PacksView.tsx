import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  Compass,
  Eye,
  FileArchive,
  FolderOpen,
  LayoutGrid,
  Loader2,
  PackageOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { PackInfo } from "../lib/types";
import MinecraftScene from "./MinecraftScene";
import PackImage from "./PackImage";
import Select from "./Select";
import { ViewToggle } from "./ui";

type Props = {
  packs: PackInfo[];
  workspace: string;
  onOpen: (dir: string) => void;
  onReveal: (dir: string) => void;
  onExport: (dir: string) => void;
  exporting: string | null;
  onNew: () => void;
  onImport: () => void;
  onDelete: (dir: string) => void;
};

type SortMode = "name" | "recent" | "mods";
type ViewMode = "grid" | "list";

const LOADER_TONES: Record<string, string> = {
  fabric: "tone-fabric",
  forge: "tone-forge",
  neoforge: "tone-neoforge",
  quilt: "tone-quilt",
  purpur: "tone-purpur",
};

export default function PacksView({ packs, workspace, onOpen, onReveal, onExport, exporting, onNew, onImport, onDelete }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");
  const [loaderFilter, setLoaderFilter] = useState("all");
  const [view, setView] = useState<ViewMode>("grid");

  const loaders = useMemo(() => {
    const counts = new Map<string, number>();
    packs.forEach((pack) => {
      if (pack.loader) counts.set(pack.loader, (counts.get(pack.loader) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [packs]);

  const totalMods = useMemo(
    () => packs.reduce((total, pack) => total + pack.mod_count, 0),
    [packs],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = packs.filter((pack) => {
      const matchesTerm =
        !term ||
        [pack.name, pack.description ?? "", pack.loader ?? "", pack.minecraft_version ?? ""]
          .some((value) => value.toLowerCase().includes(term));
      const matchesLoader = loaderFilter === "all" || pack.loader === loaderFilter;
      return matchesTerm && matchesLoader;
    });
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "mods") sorted.sort((a, b) => b.mod_count - a.mod_count);
    if (sort === "recent") sorted.reverse();
    return sorted;
  }, [packs, search, sort, loaderFilter]);

  const resetFilters = () => {
    setSearch("");
    setLoaderFilter("all");
  };

  return (
    <div className="view-enter">
      {/* Banner */}
      <section className="mc-hero mc-hero-compact">
        <MinecraftScene variant="nether" />
        <div className="mc-hero-scrim" />
        <div className="mc-hero-content">
          <span className="mc-hero-badge">
            <Sparkles size={12} /> {t("packs.heroBadge")}
          </span>
          <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight drop-shadow-sm">
            {t("packs.title")}
          </h1>
          <p className="mt-2 text-[13px] text-muted">{t("packs.subtitle", { count: packs.length })}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="hero-pill">
              <LayoutGrid size={12} /> {packs.length} {t("packs.statPacks")}
            </span>
            <span className="hero-pill">
              <Boxes size={12} /> {totalMods} {t("packs.statMods")}
            </span>
            <span className="hero-pill max-w-[280px] truncate font-mono text-[10px]">{workspace}</span>
          </div>
        </div>
        <div className="hero-cta flex items-center gap-2">
          <button className="btn btn-secondary" onClick={onImport} title={t("import.title")}>
            <FileArchive size={15} />
            {t("import.start")}
          </button>
          <button className="btn btn-primary" onClick={onNew}>
            <Plus size={15} strokeWidth={2} />
            {t("nav.newPack")}
          </button>
        </div>
      </section>

      {/* Barra de herramientas */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="field field-icon"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("packs.search")}
          />
        </div>
        <div className="w-44">
          <Select
            value={sort}
            onChange={(value) => setSort(value as SortMode)}
            options={[
              { value: "name", label: t("packs.sortName") },
              { value: "recent", label: t("packs.sortRecent") },
              { value: "mods", label: t("packs.sortMods") },
            ]}
          />
        </div>
        <ViewToggle
          value={view}
          onChange={setView}
          labels={{ grid: t("packs.viewGrid"), list: t("packs.viewList") }}
        />
      </div>

      {/* Filtros por loader */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SlidersHorizontal size={13} className="text-muted" />
        <button
          className={`filter-chip ${loaderFilter === "all" ? "active" : ""}`}
          onClick={() => setLoaderFilter("all")}
        >
          {t("packs.filterAll")} <span className="filter-count">{packs.length}</span>
        </button>
        {loaders.map(([loader, count]) => (
          <button
            key={loader}
            className={`filter-chip ${loaderFilter === loader ? "active" : ""}`}
            onClick={() => setLoaderFilter(loader)}
          >
            <span className={`loader-dot ${LOADER_TONES[loader] ?? ""}`} />
            {loader} <span className="filter-count">{count}</span>
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-muted">
          {t("packs.showing", { count: visible.length })}
        </span>
      </div>

      {/* Resultados */}
      {visible.length === 0 ? (
        <div className="card mt-5 grid place-items-center py-20">
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-accent-soft text-accent">
              <Compass size={22} strokeWidth={1.7} />
            </div>
            <p className="mt-4 font-mono text-xs text-muted">
              {packs.length === 0 ? t("packs.emptyTitle") : t("packs.noResults")}
            </p>
            <p className="mt-1 text-xs text-muted">
              {packs.length === 0 ? t("packs.emptySubtitle") : t("packs.noResultsHint")}
            </p>
            {packs.length === 0 ? (
              <button className="btn btn-primary mt-5" onClick={onNew}>
                <Plus size={14} /> {t("nav.newPack")}
              </button>
            ) : (
              <button className="btn btn-secondary mt-5" onClick={resetFilters}>
                {t("packs.clearFilters")}
              </button>
            )}
          </div>
        </div>
      ) : view === "grid" ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
          {visible.map((pack, index) => (
            <article
              key={pack.dir}
              className="card pack-card-v2 stagger pack-clickable"
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => onOpen(pack.dir)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(pack.dir);
                }
              }}
              role="button"
              tabIndex={0}
              title={t("packs.view")}
            >
              {pack.banner && (
                <div className="pack-card-banner">
                  <PackImage dir={pack.dir} path={pack.banner} className="h-full w-full object-cover" />
                  <div className="pack-card-banner-fade" />
                </div>
              )}
              <div className="p-5">
                <div className={`flex items-start justify-between ${pack.banner ? "-mt-8" : ""}`}>
                  <div className="relative">
                    <PackImage
                      dir={pack.dir}
                      path={pack.icon}
                      className="pack-card-icon h-9 w-9 rounded-lg object-cover"
                    />
                    <span
                      className={`loader-dot absolute -bottom-0.5 -right-0.5 ring-2 ring-surface ${LOADER_TONES[pack.loader ?? ""] ?? ""}`}
                    />
                  </div>
                  <span className="rounded-md bg-subtle px-2 py-1 font-mono text-[10px] text-muted">
                    v{pack.version ?? "—"}
                  </span>
                </div>

                <h2 className="mt-4 truncate text-[15px] font-semibold tracking-tight">{pack.name}</h2>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-5 text-muted">
                  {pack.description || t("packs.noDescription")}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="chip">
                    <Boxes size={11} /> MC {pack.minecraft_version ?? "—"}
                  </span>
                  <span className={`chip chip-loader ${LOADER_TONES[pack.loader ?? ""] ?? ""}`}>
                    {pack.loader ?? "—"}
                  </span>
                  {pack.issues.length > 0 && (
                    <span className="chip chip-issue">
                      <TriangleAlert size={11} /> {pack.issues.length}
                    </span>
                  )}
                </div>

                {pack.mod_count > 0 ? (
                  <div className="mt-4 flex items-center gap-1">
                    {Array.from({ length: 8 }, (_, block) => (
                      <span
                        key={block}
                        className={`pack-block ${block < Math.min(8, Math.ceil(pack.mod_count / 5)) ? "filled" : ""}`}
                      />
                    ))}
                    <span className="ml-auto font-mono text-[9px] text-muted">{t("packs.modCount", { count: pack.mod_count })}</span>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-[11px] text-muted">
                    <Boxes size={12} /> {t("packs.noModsYet")}
                  </div>
                )}

                {pack.issues.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-bad/5 px-3 py-2 text-[11px] text-bad">
                    <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{pack.issues[0]}</span>
                  </div>
                )}

                <div className="mt-5 flex items-center gap-2">
                  <button
                    className="btn btn-ghost px-3 mr-auto"
                    onClick={(event) => { event.stopPropagation(); onOpen(pack.dir); }}
                    title={t("packs.view")}
                    aria-label={t("packs.view")}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    className="btn btn-ghost px-3"
                    onClick={(event) => { event.stopPropagation(); onExport(pack.dir); }}
                    disabled={exporting === pack.dir}
                    title={t("export.button")}
                  >
                    {exporting === pack.dir ? <Loader2 size={15} className="spin" /> : <PackageOpen size={15} />}
                  </button>
                  <button
                    className="btn btn-ghost px-3"
                    onClick={(event) => { event.stopPropagation(); onReveal(pack.dir); }}
                    title={t("packs.folder")}
                    aria-label={t("packs.folder")}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                  <button
                    className="btn btn-ghost px-3 text-bad"
                    onClick={(event) => { event.stopPropagation(); onDelete(pack.dir); }}
                    title={t("delete.deletePack")}
                    aria-label={t("delete.deletePack")}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          {visible.map((pack, index) => (
            <article
              key={pack.dir}
              className="pack-row pack-clickable stagger"
              style={{ animationDelay: `${index * 25}ms` }}
              onClick={() => onOpen(pack.dir)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(pack.dir);
                }
              }}
              role="button"
              tabIndex={0}
              title={t("packs.view")}
            >
              <PackImage dir={pack.dir} path={pack.icon} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-medium">{pack.name}</h3>
                  <span className={`loader-dot ${LOADER_TONES[pack.loader ?? ""] ?? ""}`} />
                </div>
                <p className="truncate text-[11px] text-muted">
                  {pack.description || t("packs.noDescription")}
                </p>
              </div>
              <span className="chip">MC {pack.minecraft_version ?? "—"}</span>
              <span className={`chip chip-loader ${LOADER_TONES[pack.loader ?? ""] ?? ""}`}>
                {pack.loader ?? "—"}
              </span>
              <span className="w-16 text-right font-mono text-[11px] text-muted">{t("packs.modCount", { count: pack.mod_count })}</span>
              <button
                className="btn btn-ghost px-3"
                onClick={(event) => { event.stopPropagation(); onExport(pack.dir); }}
                disabled={exporting === pack.dir}
                title={t("export.button")}
              >
                {exporting === pack.dir ? <Loader2 size={14} className="spin" /> : <PackageOpen size={14} />}
              </button>
              <button
                className="btn btn-ghost px-3"
                onClick={(event) => { event.stopPropagation(); onReveal(pack.dir); }}
                title={t("packs.folder")}
                aria-label={t("packs.folder")}
              >
                <FolderOpen size={14} />
              </button>
              <button
                className="btn btn-ghost px-3"
                onClick={(event) => { event.stopPropagation(); onOpen(pack.dir); }}
                title={t("packs.view")}
                aria-label={t("packs.view")}
              >
                <Eye size={15} />
              </button>
              <button
                className="btn btn-ghost px-3 text-bad"
                onClick={(event) => { event.stopPropagation(); onDelete(pack.dir); }}
                title={t("delete.deletePack")}
                aria-label={t("delete.deletePack")}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
