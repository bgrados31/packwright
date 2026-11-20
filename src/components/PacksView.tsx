import { useMemo, useState } from "react";
import { ArrowUpRight, Boxes, LayoutGrid, Plus, Search, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n";
import type { PackInfo } from "../lib/types";
import Select from "./Select";

type Props = {
  packs: PackInfo[];
  workspace: string;
  onOpen: (dir: string) => void;
  onReveal: (dir: string) => void;
  onNew: () => void;
};

type SortMode = "name" | "recent" | "mods";

export default function PacksView({ packs, workspace, onOpen, onReveal, onNew }: Props) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("name");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? packs.filter((pack) =>
          [pack.name, pack.description ?? "", pack.loader ?? "", pack.minecraft_version ?? ""]
            .some((value) => value.toLowerCase().includes(term)),
        )
      : packs;
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "mods") sorted.sort((a, b) => b.mod_count - a.mod_count);
    if (sort === "recent") sorted.reverse();
    return sorted;
  }, [packs, search, sort]);

  const totalMods = useMemo(
    () => packs.reduce((total, pack) => total + pack.mod_count, 0),
    [packs],
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{t("nav.workspace")}</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight">{t("packs.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("packs.subtitle", { count: packs.length })}</p>
          <p className="mt-1 max-w-lg truncate font-mono text-[11px] text-muted/70">{workspace}</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          <Plus size={15} strokeWidth={2} />
          {t("nav.newPack")}
        </button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-3">
        {[
          { icon: LayoutGrid, label: t("packs.statPacks"), value: String(packs.length) },
          { icon: Boxes, label: t("packs.statMods"), value: String(totalMods) },
        ].map((stat) => (
          <div key={stat.label} className="card flex items-center gap-3 p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent">
              <stat.icon size={16} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-muted">{stat.label}</p>
              <p className="truncate text-lg font-semibold leading-6">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

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
        <div className="w-48">
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
      </div>

      {visible.length === 0 ? (
        <div className="card mt-5 grid place-items-center py-20">
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent-soft text-accent">
              <Search size={20} strokeWidth={1.7} />
            </div>
            <p className="mt-4 font-mono text-xs text-muted">
              {packs.length === 0 ? t("packs.emptyTitle") : t("packs.noResults")}
            </p>
            <p className="mt-1 text-xs text-muted">{t("packs.emptySubtitle")}</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
          {visible.map((pack) => (
            <article key={pack.dir} className="pack-card p-5">
              <div className="flex items-start justify-between">
                <img src="/packwright-mark.png" alt="" className="h-9 w-9 rounded-lg" />
                <span className="rounded-md bg-subtle px-2 py-1 font-mono text-[10px] text-muted">
                  v{pack.version ?? "—"}
                </span>
              </div>

              <h2 className="mt-4 truncate text-[15px] font-semibold tracking-tight">{pack.name}</h2>
              <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-5 text-muted">
                {pack.description || t("packs.noDescription")}
              </p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="chip">MC {pack.minecraft_version ?? "—"}</span>
                <span className="chip">{pack.loader ?? "—"}</span>
                <span className="chip">{t("packs.modCount", { count: pack.mod_count })}</span>
              </div>

              {pack.issues.length > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-bad/5 px-3 py-2 text-[11px] text-bad">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{pack.issues[0]}</span>
                </div>
              )}

              <div className="mt-5 flex items-center gap-2">
                <button className="btn btn-primary flex-1" onClick={() => onOpen(pack.dir)}>
                  {t("packs.open")}
                </button>
                <button className="btn btn-secondary px-3" onClick={() => onReveal(pack.dir)} title={t("packs.folder")}>
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
