import { ArrowRight, Boxes, Compass, FolderOpen, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import type { PackInfo } from "../lib/types";
import MinecraftScene from "./MinecraftScene";

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

  const highlights = [
    { icon: LayoutGrid, title: t("welcome.feature1Title"), body: t("welcome.feature1Body") },
    { icon: Boxes, title: t("welcome.feature2Title"), body: t("welcome.feature2Body") },
    { icon: Compass, title: t("welcome.feature3Title"), body: t("welcome.feature3Body") },
  ];

  return (
    <div className="view-enter">
      {/* Hero inmersivo */}
      <section className="mc-hero">
        <MinecraftScene />
        <div className="mc-hero-scrim" />
        <div className="mc-hero-content">
          <span className="mc-hero-badge">
            <Sparkles size={12} /> {t("home.heroBadge")}
          </span>
          <h1 className="mt-3 max-w-xl text-[32px] font-semibold leading-[1.15] tracking-tight drop-shadow-sm">
            {t("welcome.title")}
          </h1>
          <p className="mt-3 max-w-lg text-[13px] leading-6 text-muted">{t("welcome.subtitle")}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" onClick={onNew}>
              <Plus size={15} /> {t("nav.newPack")}
            </button>
            <button className="btn btn-secondary" onClick={onGoPacks}>
              <LayoutGrid size={15} /> {t("home.explore")}
            </button>
            <button className="btn btn-quiet text-[11px]" onClick={onOpenWorkspace}>
              <FolderOpen size={13} /> {t("home.openWorkspace")}
            </button>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <div className="mt-6 grid grid-cols-3 gap-3">
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

      {/* Novedades */}
      <div className="mt-8">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-accent" />
          <h2 className="text-sm font-semibold">{t("home.whatsNew")}</h2>
          <span className="chip chip-accent">{t("home.heroBadge")}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {highlights.map((item) => (
            <div key={item.title} className="card p-4">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
                <item.icon size={15} strokeWidth={1.8} />
              </span>
              <h3 className="mt-3 text-[13px] font-medium">{item.title}</h3>
              <p className="mt-1 text-[11px] leading-5 text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recientes */}
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
