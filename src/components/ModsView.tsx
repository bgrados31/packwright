import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Box,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Heart,
  Image as ImageIcon,
  Loader2,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import type {
  InstalledMod,
  ModHealth,
  ModOperation,
  ModProject,
  ModSearchHit,
  ModVersion,
} from "../lib/types";
import Select from "./Select";

type Props = {
  dir: string;
  minecraftVersion: string | null;
  loader: string | null;
  revision: number;
  onOperation: (operation: ModOperation) => void;
};

const LOADER_TAGS = new Set([
  "fabric", "quilt", "forge", "neoforge", "liteloader", "rift",
  "datapack", "plugin", "mod", "minecraft", "client", "server",
]);

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function prettyCategory(value: string): string {
  const clean = value.replace(/-/g, " ").replace(/^\w/, (char) => char.toUpperCase());
  return clean;
}

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function releaseChip(type: string) {
  return <span className={`release-badge ${type}`}>{type}</span>;
}

/** Ficha de un mod: banner, galería, descripción, versiones agrupadas e instalación. */
function ModDetail({
  hit,
  minecraftVersion,
  loader,
  installed,
  onClose,
  onInstall,
}: {
  hit: ModSearchHit;
  minecraftVersion: string | null;
  loader: string | null;
  installed: boolean;
  onClose: () => void;
  onInstall: (version: ModVersion) => void;
}) {
  const { t } = useI18n();
  const [project, setProject] = useState<ModProject | null>(null);
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [section, setSection] = useState<"description" | "versions">("description");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<ModProject>("mods_project", { projectId: hit.project_id }),
      invoke<ModVersion[]>("mods_versions", {
        projectId: hit.project_id,
        mcVersion: minecraftVersion,
        loader,
      }),
    ])
      .then(([details, list]) => {
        if (cancelled) return;
        setProject(details);
        setVersions(list);
        const preferred = list.find((version) => version.release_type === "release") ?? list[0];
        setSelected(preferred?.id ?? null);
      })
      .catch((cause) => { if (!cancelled) setError(messageOf(cause)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hit.project_id, minecraftVersion, loader]);

  const groups = useMemo(() => {
    const map = new Map<string, ModVersion[]>();
    for (const version of versions) {
      const key = version.game_versions.length ? version.game_versions.join(", ") : t("mods.otherVersions");
      map.set(key, [...(map.get(key) ?? []), version]);
    }
    return [...map.entries()];
  }, [versions, t]);

  const banner = project?.gallery?.[0] ?? hit.featured_gallery ?? hit.gallery?.[0] ?? null;
  const images = project?.gallery ?? hit.gallery ?? [];
  const chosen = versions.find((version) => version.id === selected) ?? null;

  useEffect(() => {
    if (lightbox === null || images.length < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
      if (event.key === "ArrowLeft") setLightbox((index) => ((index ?? 0) - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setLightbox((index) => ((index ?? 0) + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, images.length]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("mods.detailTitle")}>
      <div className="modal-card mod-detail">
        <div className="modal-header">
          <span className="modal-icon running"><Box size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{project?.name ?? hit.name}</h2>
            <p className="truncate text-[11px] text-muted">{t("mods.byAuthor", { author: project?.author || hit.author || "—" })}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div className="mod-detail-body">
          {loading && (
            <div className="grid place-items-center py-16 text-muted">
              <Loader2 size={22} className="spin" />
            </div>
          )}
          {error && <div className="modal-message error" style={{ margin: "12px 16px 0" }}>{error}</div>}

          {!loading && (
            <>
              <div className="mod-detail-banner">
                {banner ? (
                  <img src={banner} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                ) : (
                  <div className="mod-detail-banner-fallback" />
                )}
                <div className="mod-detail-banner-fade" />
                {images.length > 1 && (
                  <button className="mod-banner-gallery" onClick={() => setLightbox(0)}>
                    <ImageIcon size={12} /> {t("mods.gallery")} · {images.length}
                  </button>
                )}
              </div>

              <div className="mod-detail-head">
                <div className="mod-detail-icon">
                  {project?.icon_url || hit.icon_url ? (
                    <img
                      src={project?.icon_url ?? hit.icon_url ?? ""}
                      alt=""
                      onError={(event) => { event.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <span>{(project?.name ?? hit.name)?.[0] ?? "?"}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[17px] font-semibold">{project?.name ?? hit.name}</h3>
                    {installed && <span className="chip chip-accent"><Check size={11} /> {t("catalog.installed")}</span>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-muted">
                    {project?.description || hit.description}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1"><Download size={12} /> {formatCount(project?.downloads ?? hit.downloads)}</span>
                    <span className="inline-flex items-center gap-1"><Heart size={12} /> {formatCount(project?.followers ?? hit.follows)}</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {formatDate(hit.date_modified)}</span>
                  </div>
                </div>
              </div>

              {images.length > 1 && (
                <div className="mod-thumbs">
                  {images.slice(0, 8).map((image, index) => (
                    <button key={index} className="mod-thumb" onClick={() => setLightbox(index)}>
                      <img src={image} alt="" />
                    </button>
                  ))}
                </div>
              )}

              <div className="mod-detail-tabs">
                {([
                  ["description", t("mods.description")],
                  ["versions", `${t("mods.versions")} (${versions.length})`],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    className={section === id ? "active" : ""}
                    onClick={() => setSection(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {section === "description" ? (
                <div className="mod-detail-section">
                  {project?.body ? (
                    <p className="whitespace-pre-line text-[12px] leading-6 text-muted">{project.body.slice(0, 2200)}</p>
                  ) : (
                    <p className="text-[12px] text-muted">{project?.description || hit.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(project?.categories ?? hit.categories).filter((c) => !LOADER_TAGS.has(c)).slice(0, 8).map((category) => (
                      <span key={category} className="chip">{prettyCategory(category)}</span>
                    ))}
                  </div>
                  {(hit.client_side === "unsupported" || hit.server_side === "unsupported") && (
                    <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                      <TriangleAlert size={13} />
                      {hit.client_side === "unsupported" ? t("catalog.server") : t("catalog.client")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mod-detail-section mod-versions">
                  {groups.length === 0 && <p className="text-[12px] text-muted">{t("mods.noVersions")}</p>}
                  {groups.map(([key, list]) => (
                    <div key={key} className="mod-version-group">
                      <div className="mod-version-group-head">
                        <ChevronDown size={13} />
                        <span className="min-w-0 flex-1 truncate">{key}</span>
                        <span className="chip">{list.length}</span>
                      </div>
                      {list.map((version) => (
                        <button
                          key={version.id}
                          className={`mod-version-row ${selected === version.id ? "selected" : ""}`}
                          onClick={() => setSelected(version.id)}
                        >
                          <span className={`mod-radio ${selected === version.id ? "on" : ""}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium">{version.name || version.version_number}</span>
                            <span className="block truncate font-mono text-[10px] text-muted">{version.loaders.join(" · ")}</span>
                          </span>
                          {releaseChip(version.release_type)}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <div className="min-w-0 flex-1">
            {chosen ? (
              <p className="truncate text-[11px] text-muted">
                <span className="font-medium text-ink">{chosen.version_number}</span> · {formatDate(chosen.date_published)}
              </p>
            ) : (
              <span className="text-[11px] text-muted">{t("mods.filteredFor", { mc: minecraftVersion ?? "—", loader: loader ?? "—" })}</span>
            )}
            {project?.source_url && (
              <button className="btn btn-quiet text-[10px]" onClick={() => void openUrl(project.source_url!)}>
                <ExternalLink size={11} /> {t("mods.source")}
              </button>
            )}
          </div>
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
          <button className="btn btn-primary" disabled={!chosen} onClick={() => chosen && onInstall(chosen)}>
            <Download size={14} />
            {installed ? t("mods.reinstall") : t("mods.add")}
          </button>
        </div>
      </div>

      {lightbox !== null && images[lightbox] && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={images[lightbox]} alt="" onClick={(event) => event.stopPropagation()} />
          <button className="lightbox-arrow left" onClick={() => setLightbox((index) => ((index ?? 0) - 1 + images.length) % images.length)}>
            <ChevronLeft size={22} />
          </button>
          <button className="lightbox-arrow right" onClick={() => setLightbox((index) => ((index ?? 0) + 1) % images.length)}>
            <ChevronRight size={22} />
          </button>
          <button className="lightbox-close" onClick={() => setLightbox(null)}><X size={18} /></button>
        </div>
      )}
    </div>
  );
}

export default function ModsView({ dir, minecraftVersion, loader, revision, onOperation }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"discover" | "installed">("discover");
  const [installed, setInstalled] = useState<InstalledMod[]>([]);
  const [health, setHealth] = useState<ModHealth | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("relevance");
  const [environment, setEnvironment] = useState("any");
  const [category, setCategory] = useState("all");
  const [hits, setHits] = useState<ModSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ModSearchHit | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [installedQuery, setInstalledQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<InstalledMod[]>("mods_list", { dir }),
      invoke<ModHealth>("mods_health", { dir }),
    ])
      .then(([list, status]) => { if (!cancelled) { setInstalled(list); setHealth(status); } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [dir, revision]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        let result = await invoke<ModSearchHit[]>("mods_search", {
          query,
          mcVersion: minecraftVersion,
          loader,
        });
        if (environment === "client") result = result.filter((hit) => hit.server_side === "unsupported");
        if (environment === "server") result = result.filter((hit) => hit.client_side === "unsupported");
        if (sort === "downloads") result = [...result].sort((a, b) => b.downloads - a.downloads);
        if (sort === "follows") result = [...result].sort((a, b) => b.follows - a.follows);
        if (sort === "newest") result = [...result].sort((a, b) => b.date_modified.localeCompare(a.date_modified));
        if (!cancelled) setHits(result);
      } catch (cause) {
        if (!cancelled) setSearchError(messageOf(cause));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, query ? 300 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, sort, environment, minecraftVersion, loader]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag ?? "")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const installedIds = useMemo(
    () => new Set(installed.map((mod) => mod.project_id).filter(Boolean) as string[]),
    [installed],
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    hits.forEach((hit) => hit.categories.forEach((value) => {
      if (!LOADER_TAGS.has(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [hits]);

  const visibleHits = useMemo(
    () => (category === "all" ? hits : hits.filter((hit) => hit.categories.includes(category))),
    [hits, category],
  );

  const visibleInstalled = useMemo(() => {
    const needle = installedQuery.trim().toLowerCase();
    return installed.filter((mod) => {
      if (needle && !`${mod.name} ${mod.filename} ${mod.id}`.toLowerCase().includes(needle)) return false;
      if (installedFilter === "pinned" && !mod.pinned) return false;
      if (installedFilter === "manual" && mod.source !== "manual") return false;
      return true;
    });
  }, [installed, installedQuery, installedFilter]);

  const run = (kind: ModOperation["kind"], mod?: InstalledMod) =>
    onOperation({
      kind,
      dir,
      label: t(`mods.action.${kind}` as TranslationKey),
      name: mod?.id,
      modName: mod?.name,
    });

  const bulk = (kind: "remove" | "pin" | "unpin" | "update") => {
    const names = selected.filter((id) => visibleInstalled.some((mod) => mod.id === id));
    if (!names.length) return;
    onOperation({
      kind,
      dir,
      label: t(`mods.action.${kind}` as TranslationKey),
      names,
      modName: t("mods.selected", { count: names.length }),
    });
    setSelected([]);
  };

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const allSelected = visibleInstalled.length > 0 && visibleInstalled.every((mod) => selected.includes(mod.id));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("mods.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("mods.subtitle", { count: health?.total ?? installed.length })}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => run("refresh")} title={t("mods.action.refresh")}>
            <RefreshCw size={14} /> {t("mods.refresh")}
          </button>
          <button className="btn btn-secondary" onClick={() => run("update")} title={t("mods.action.update")}>
            <Download size={14} /> {t("mods.updateAll")}
          </button>
        </div>
      </div>

      <div className="mt-5 flex gap-1 border-b border-line">
        {([
          ["discover", t("mods.discover"), null],
          ["installed", t("mods.installed"), installed.length],
        ] as const).map(([id, label, count]) => (
          <button
            key={id}
            className={`border-b-2 px-3 pb-2 text-sm transition-colors ${
              tab === id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
            onClick={() => setTab(id)}
          >
            {label}
            {count !== null && <span className="ml-2 font-mono text-[10px] opacity-60">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "discover" ? (
        <div className="mt-5">
          <div className="surface-soft flex flex-wrap items-center gap-2.5 p-2.5">
            <div className="relative min-w-[220px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                className="field field-icon"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("mods.searchPlaceholder")}
                spellCheck={false}
              />
              {query ? (
                <button className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-subtle hover:text-ink" onClick={() => setQuery("")}>
                  <X size={13} />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-muted">/</kbd>
              )}
            </div>
            <div className="w-40">
              <Select
                value={sort}
                onChange={setSort}
                options={[
                  { value: "relevance", label: t("mods.sortRelevance") },
                  { value: "downloads", label: t("mods.sortDownloads") },
                  { value: "follows", label: t("mods.sortFollows") },
                  { value: "newest", label: t("mods.sortNewest") },
                ]}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="hero-pill"><ShieldCheck size={12} /> {t("mods.filteredFor", { mc: minecraftVersion ?? "—", loader: loader ?? "—" })}</span>
            {([
              ["any", t("mods.envAny")],
              ["client", t("mods.envClient")],
              ["server", t("mods.envServer")],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                className={`filter-chip ${environment === id ? "active" : ""}`}
                onClick={() => setEnvironment(id)}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto font-mono text-[10px] text-muted">
              {searching ? t("mods.searching") : t("catalog.results", { count: visibleHits.length })}
            </span>
          </div>

          {categories.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button className={`filter-chip ${category === "all" ? "active" : ""}`} onClick={() => setCategory("all")}>
                {t("packs.filterAll")}
              </button>
              {categories.map(([name, count]) => (
                <button key={name} className={`filter-chip ${category === name ? "active" : ""}`} onClick={() => setCategory(name)}>
                  {prettyCategory(name)} <span className="filter-count">{count}</span>
                </button>
              ))}
            </div>
          )}

          {searchError && (
            <div className="modal-message error mt-4" style={{ margin: "16px 0 0" }}>
              {searchError}
              <button className="btn btn-quiet ml-2 text-[10px]" onClick={() => setQuery((value) => `${value} `)}>
                <RefreshCw size={11} /> {t("settings.retry")}
              </button>
            </div>
          )}

          {searching && hits.length === 0 ? (
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton-card" />)}
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              {visibleHits.map((hit) => {
                const isInstalled = installedIds.has(hit.project_id);
                const banner = hit.featured_gallery ?? hit.gallery?.[0] ?? null;
                return (
                  <article
                    key={hit.project_id}
                    className="card mod-hit stagger"
                    onClick={() => setDetail(hit)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => { if (event.key === "Enter") setDetail(hit); }}
                  >
                    <div className="mod-hit-banner">
                      {banner ? <img src={banner} alt="" loading="lazy" /> : <div className="mod-hit-banner-fallback" />}
                      <div className="mod-hit-banner-fade" />
                      <span className="mod-hit-pill">{t("catalog.types.mod")}</span>
                      {isInstalled && <span className="mod-hit-installed"><Check size={11} /> {t("catalog.installed")}</span>}
                    </div>
                    <div className="mod-hit-body">
                      <div className="mod-hit-icon">
                        {hit.icon_url ? (
                          <img src={hit.icon_url} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                        ) : (
                          <span>{hit.name?.[0] ?? "?"}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[13px] font-semibold">{hit.name}</h3>
                        <p className="truncate text-[11px] text-muted">{t("mods.byAuthor", { author: hit.author || "—" })}</p>
                      </div>
                    </div>
                    <p className="mx-4 mt-3 line-clamp-2 min-h-[2.5rem] text-[12px] leading-5 text-muted">
                      {hit.description || t("packs.noDescription")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 px-4">
                      {hit.categories.filter((c) => !LOADER_TAGS.has(c)).slice(0, 3).map((category) => (
                        <span key={category} className="chip">{prettyCategory(category)}</span>
                      ))}
                      {hit.client_side === "unsupported" && <span className="chip">{t("catalog.server")}</span>}
                      {hit.server_side === "unsupported" && <span className="chip">{t("catalog.client")}</span>}
                    </div>
                    <div className="mt-3 flex items-center gap-3 border-t border-line px-4 py-2.5 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1"><Download size={11} /> {formatCount(hit.downloads)}</span>
                      <span className="inline-flex items-center gap-1"><Heart size={11} /> {formatCount(hit.follows)}</span>
                      <span className="ml-auto">{formatDate(hit.date_modified)}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <div className="surface-soft flex flex-wrap items-center gap-2.5 p-2.5">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="field field-icon"
                value={installedQuery}
                onChange={(event) => setInstalledQuery(event.target.value)}
                placeholder={t("mods.searchInstalled")}
              />
            </div>
            {([
              ["all", t("packs.filterAll")],
              ["pinned", t("mods.pinnedOnly")],
              ["manual", t("mods.manualOnly")],
            ] as const).map(([id, label]) => (
              <button key={id} className={`filter-chip ${installedFilter === id ? "active" : ""}`} onClick={() => setInstalledFilter(id)}>
                {label}
              </button>
            ))}
          </div>

          <div className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 ${selected.length ? "border-accent/40 bg-accent-soft" : "border-line bg-surface"}`}>
            <label className="flex cursor-pointer items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                className="accent-accent"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? [] : visibleInstalled.map((mod) => mod.id))}
              />
              <span>{t("mods.selectAll")}</span>
            </label>
            {selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-l border-line pl-3">
                <button className="btn btn-ghost" onClick={() => bulk("update")}><RefreshCw size={13} /> {t("mods.action.update")}</button>
                <button className="btn btn-ghost" onClick={() => bulk("pin")}><Pin size={13} /> {t("mods.action.pin")}</button>
                <button className="btn btn-ghost" onClick={() => bulk("unpin")}><PinOff size={13} /> {t("mods.action.unpin")}</button>
                <button className="btn btn-ghost btn-danger" onClick={() => bulk("remove")}><Trash2 size={13} /> {t("mods.action.remove")}</button>
                <button className="btn btn-quiet text-[11px]" onClick={() => setSelected([])}>{t("mods.cancelSelection")}</button>
              </div>
            )}
            <span className="ml-auto font-mono text-[10px] text-muted">
              {t("mods.shown", { shown: visibleInstalled.length, total: installed.length })}
            </span>
          </div>

          {health && (health.duplicates.length > 0 || health.unmanaged > 0) && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad/5 px-4 py-3 text-[12px] text-bad">
              <TriangleAlert size={15} className="mt-0.5 shrink-0" />
              <div>
                {health.duplicates.length > 0 && <p>{t("mods.healthDuplicates", { names: health.duplicates.join(", ") })}</p>}
                {health.unmanaged > 0 && <p>{t("mods.healthUnmanaged", { count: health.unmanaged })}</p>}
              </div>
            </div>
          )}

          {visibleInstalled.length === 0 ? (
            <div className="card mt-5 grid place-items-center py-16">
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent"><Box size={20} /></div>
                <p className="mt-4 text-sm font-medium">{t("mods.noInstalled")}</p>
                <p className="mt-1 text-xs text-muted">{t("mods.noInstalledHint")}</p>
                <button className="btn btn-primary mt-5" onClick={() => setTab("discover")}><Search size={14} /> {t("mods.discover")}</button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
              {visibleInstalled.map((mod) => (
                <article key={mod.id} className="card mod-installed-card stagger">
                  <div className="flex items-start gap-3 p-4">
                    <input type="checkbox" className="mt-1 accent-accent" checked={selected.includes(mod.id)} onChange={() => toggle(mod.id)} aria-label={t("mods.selectAll")} />
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                      <Box size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[13px] font-semibold">{mod.name}</h3>
                        {mod.pinned && <Pin size={11} className="shrink-0 text-accent" />}
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{mod.filename || mod.id}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-4">
                    <span className="chip">{mod.side}</span>
                    <span className="chip">{mod.source}</span>
                    {mod.optional && <span className="chip">{t("mods.optional")}</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 border-t border-line px-3 py-2.5">
                    <button className="btn btn-ghost px-2" onClick={() => run(mod.pinned ? "unpin" : "pin", mod)} title={t(mod.pinned ? "mods.action.unpin" : "mods.action.pin")}>
                      {mod.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    </button>
                    <button className="btn btn-ghost px-2" onClick={() => run("update", mod)} title={t("mods.action.update")}><RefreshCw size={14} /></button>
                    {mod.project_id && (
                      <button className="btn btn-ghost px-2" onClick={() => void openUrl(`https://modrinth.com/mod/${mod.project_id}`)} title={t("mods.openModrinth")}>
                        <ExternalLink size={14} />
                      </button>
                    )}
                    <button className="btn btn-ghost btn-danger ml-auto px-2" onClick={() => run("remove", mod)} title={t("mods.action.remove")}><Trash2 size={14} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {detail && (
        <ModDetail
          hit={detail}
          minecraftVersion={minecraftVersion}
          loader={loader}
          installed={installedIds.has(detail.project_id)}
          onClose={() => setDetail(null)}
          onInstall={(version) => {
            onOperation({
              kind: "add",
              dir,
              label: t("mods.action.add"),
              projectId: detail.project_id,
              versionId: version.id,
              modName: detail.name,
            });
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}
