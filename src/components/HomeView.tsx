import { ArrowRight, Boxes, FolderOpen, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import type { PackInfo } from "../lib/types";

type Props = {
  packs: PackInfo[];
  workspace: string;
  launchersCount: number;
  onNew: () => void;
  onGoPacks: () => void;
  onOpenPack: (dir: string) => void;
  onOpenWorkspace: () => void;
};

export default function HomeView({ packs, workspace, launchersCount, onNew, onGoPacks, onOpenPack, onOpenWorkspace }: Props) {
  const { t } = useI18n();
  const totalMods = packs.reduce((sum, pack) => sum + pack.mod_count, 0);
  const recent = [...packs].slice(0, 4);

  return (
    <div className="view-enter">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">{t("home.eyebrow")}</p>
      <h1 className="mt-2 max-w-2xl text-[30px] font-semibold leading-tight tracking-tight">
        {t("home.title")}
      </h1>
      <p className="mt-2 text-sm text-muted">{t("home.subtitle")}</p>

      <div className="mt-7 grid grid-cols-3 gap-3">
        {[
          { icon: LayoutGrid, label: t("packs.statPacks"), value: String(packs.length) },
          { icon: Boxes, label: t("packs.statMods"), value: String(totalMods) },
          { icon: Sparkles, label: t("settings.launchers"), value: String(launchersCount) },
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

      <div className="mt-7">
        <h2 className="text-sm font-semibold">{t("home.quickActions")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <button className="card flex items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5" onClick={onNew}>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">
              <Plus size={16} />
            </span>
            <span className="text-sm font-medium">{t("nav.newPack")}</span>
          </button>
          <button className="card flex items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5" onClick={onGoPacks}>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-soft text-accent">
              <LayoutGrid size={16} />
            </span>
            <span className="text-sm font-medium">{t("nav.modpacks")}</span>
          </button>
          <button className="card flex items-center gap-3 p-4 text-left transition-transform hover:-translate-y-0.5" onClick={onOpenWorkspace}>
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-subtle text-muted">
              <FolderOpen size={16} />
            </span>
            <span className="truncate text-sm font-medium">{t("home.openWorkspace")}</span>
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("home.recent")}</h2>
          <button className="flex items-center gap-1 text-xs text-muted hover:text-ink" onClick={onGoPacks}>
            {t("packs.open")} <ArrowRight size={13} />
          </button>
        </div>

        {recent.length === 0 ? (
          <div className="card mt-3 grid place-items-center py-14">
            <div className="text-center">
              <img src="/packwright-mark.png" alt="" className="mx-auto h-10 w-10 opacity-60" />
              <p className="mt-4 text-sm text-muted">{t("home.noPacks")}</p>
            </div>
          </div>
        ) : (
          <div className="card mt-3 divide-y divide-line">
            {recent.map((pack) => (
              <button
                key={pack.dir}
                className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-subtle"
                onClick={() => onOpenPack(pack.dir)}
              >
                <img src="/packwright-mark.png" alt="" className="h-8 w-8 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pack.name}</p>
                  <p className="truncate font-mono text-[10px] text-muted">
                    MC {pack.minecraft_version ?? "—"} · {pack.loader ?? "—"}
                  </p>
                </div>
                <span className="chip">{pack.mod_count} mods</span>
                <ArrowRight size={14} className="text-muted" />
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 truncate font-mono text-[10px] text-muted/70">{workspace}</p>
    </div>
  );
}
