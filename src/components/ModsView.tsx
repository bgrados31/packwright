import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Box,
  Download,
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
import type { InstalledMod, ModHealth, ModOperation, ModSearchHit, ModVersion } from "../lib/types";

type Props = {
  dir: string;
  minecraftVersion: string | null;
  loader: string | null;
  revision: number;
  onOperation: (operation: ModOperation) => void;
};

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function VersionPicker({
  hit,
  minecraftVersion,
  loader,
  onPick,
  onClose,
}: {
  hit: ModSearchHit;
  minecraftVersion: string | null;
  loader: string | null;
  onPick: (version: ModVersion) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [versions, setVersions] = useState<ModVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<ModVersion[]>("mods_versions", {
      projectId: hit.project_id,
      mcVersion: minecraftVersion,
      loader,
    })
      .then((list) => { if (!cancelled) setVersions(list); })
      .catch((cause) => { if (!cancelled) setError(messageOf(cause)); });
    return () => { cancelled = true; };
  }, [hit.project_id, minecraftVersion, loader]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t("mods.versionsTitle")}>
      <div className="modal-card" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-icon running"><Box size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("mods.versionsTitle")}</h2>
            <p className="truncate text-[11px] text-muted">{hit.name}</p>
          </div>
          <button className="icon-btn" onClick={onClose} title={t("common.close")}><X size={16} /></button>
        </div>

        <div className="select-list" style={{ maxHeight: 380, margin: "12px 16px 0" }}>
          {!versions && !error && (
            <div className="p-6 text-center text-[12px] text-muted">
              <Loader2 size={16} className="spin mx-auto mb-2" />
              {t("mods.loadingVersions")}
            </div>
          )}
          {error && <div className="modal-message error" style={{ margin: 0 }}>{error}</div>}
          {versions?.length === 0 && <div className="select-empty">{t("mods.noVersions")}</div>}
          {versions?.map((version) => (
            <button
              key={version.id}
              className="mod-version-row"
              onClick={() => onPick(version)}
              title={version.name}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[12px] font-medium">{version.version_number}</span>
                  <span className={`release-badge ${version.release_type}`}>{version.release_type}</span>
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-muted">
                  {version.game_versions.slice(-3).join(" · ") || "—"} · {version.loaders.join(" · ")}
                </p>
              </div>
              <Download size={14} className="shrink-0 text-muted" />
            </button>
          ))}
        </div>

        <div className="modal-footer">
          <span className="text-[11px] text-muted">{t("mods.filteredFor", { mc: minecraftVersion ?? "—", loader: loader ?? "—" })}</span>
          <button className="btn btn-secondary" onClick={onClose}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}

export default function ModsView({ dir, minecraftVersion, loader, revision, onOperation }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"installed" | "discover">("installed");
  const [installed, setInstalled] = useState<InstalledMod[]>([]);
  const [health, setHealth] = useState<ModHealth | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ModSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [versionTarget, setVersionTarget] = useState<ModSearchHit | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<InstalledMod[]>("mods_list", { dir }),
      invoke<ModHealth>("mods_health", { dir }),
    ])
      .then(([list, status]) => {
        if (!cancelled) { setInstalled(list); setHealth(status); }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [dir, revision]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const result = await invoke<ModSearchHit[]>("mods_search", {
          query,
          mcVersion: minecraftVersion,
          loader,
        });
        if (!cancelled) setHits(result);
      } catch (cause) {
        if (!cancelled) setSearchError(messageOf(cause));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, minecraftVersion, loader]);

  const run = (kind: ModOperation["kind"], mod?: InstalledMod) => {
    onOperation({
      kind,
      dir,
      label: t(`mods.action.${kind}` as TranslationKey),
      name: mod?.id,
      modName: mod?.name,
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("mods.title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("mods.subtitle", { count: health?.total ?? installed.length })}
          </p>
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
          ["installed", t("mods.installed"), installed.length],
          ["discover", t("mods.discover"), null],
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

      {health && (health.duplicates.length > 0 || health.unmanaged > 0) && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad/5 px-4 py-3 text-[12px] text-bad">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <div>
            {health.duplicates.length > 0 && (
              <p>{t("mods.healthDuplicates", { names: health.duplicates.join(", ") })}</p>
            )}
            {health.unmanaged > 0 && <p>{t("mods.healthUnmanaged", { count: health.unmanaged })}</p>}
          </div>
        </div>
      )}

      {tab === "installed" ? (
        installed.length === 0 ? (
          <div className="card mt-5 grid place-items-center py-16">
            <div className="text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
                <Box size={20} />
              </div>
              <p className="mt-4 text-sm font-medium">{t("mods.noInstalled")}</p>
              <p className="mt-1 text-xs text-muted">{t("mods.noInstalledHint")}</p>
              <button className="btn btn-primary mt-5" onClick={() => setTab("discover")}>
                <Search size={14} /> {t("mods.discover")}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            {installed.map((mod) => (
              <article key={mod.id} className="pack-row stagger">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                  <Box size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{mod.name}</h3>
                    {mod.pinned && <Pin size={11} className="shrink-0 text-accent" />}
                    {mod.optional && <span className="chip">{t("mods.optional")}</span>}
                  </div>
                  <p className="truncate font-mono text-[10px] text-muted">
                    {mod.filename || mod.id} · {mod.source}
                  </p>
                </div>
                <span className="chip">{mod.side}</span>
                <button className="btn btn-ghost px-3" onClick={() => run(mod.pinned ? "unpin" : "pin", mod)} title={t(mod.pinned ? "mods.action.unpin" : "mods.action.pin")}>
                  {mod.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button className="btn btn-ghost px-3" onClick={() => run("update", mod)} title={t("mods.action.update")}>
                  <RefreshCw size={14} />
                </button>
                <button className="btn btn-ghost btn-danger px-3" onClick={() => run("remove", mod)} title={t("mods.action.remove")}>
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                className="field field-icon"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("mods.searchPlaceholder")}
              />
            </div>
            <span className="hero-pill">
              <ShieldCheck size={12} /> {t("mods.filteredFor", { mc: minecraftVersion ?? "—", loader: loader ?? "—" })}
            </span>
          </div>

          {searchError && <div className="modal-message error mt-4" style={{ margin: "16px 0 0" }}>{searchError}</div>}

          {searching && hits.length === 0 ? (
            <div className="card mt-5 grid place-items-center py-16 text-muted">
              <Loader2 size={20} className="spin" />
            </div>
          ) : hits.length === 0 ? (
            <div className="card mt-5 grid place-items-center py-16">
              <p className="text-sm text-muted">{t("mods.noResults")}</p>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {hits.map((hit) => (
                <article key={hit.project_id} className="card mod-card stagger p-4">
                  <div className="flex items-start gap-3">
                    <img
                      src={hit.icon_url ?? "/packwright-mark.png"}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      onError={(event) => { event.currentTarget.src = "/packwright-mark.png"; }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-semibold">{hit.name}</h3>
                      <p className="mt-0.5 font-mono text-[10px] text-muted">{hit.slug}</p>
                    </div>
                    <button
                      className="btn btn-ghost px-2"
                      onClick={() => setVersionTarget(hit)}
                      title={t("mods.add")}
                    >
                      <Download size={15} />
                    </button>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-[12px] leading-5 text-muted">
                    {hit.description || t("packs.noDescription")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {hit.categories.slice(0, 3).map((category) => (
                      <span key={category} className="chip">{category}</span>
                    ))}
                    <span className="ml-auto font-mono text-[10px] text-muted">
                      ↓ {formatCount(hit.downloads)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {versionTarget && (
        <VersionPicker
          hit={versionTarget}
          minecraftVersion={minecraftVersion}
          loader={loader}
          onClose={() => setVersionTarget(null)}
          onPick={(version) => {
            onOperation({
              kind: "add",
              dir,
              label: t("mods.action.add"),
              projectId: versionTarget.project_id,
              versionId: version.id,
              modName: versionTarget.name,
            });
            setVersionTarget(null);
          }}
        />
      )}
    </div>
  );
}
