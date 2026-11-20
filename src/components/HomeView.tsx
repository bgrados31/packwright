import { ArrowRight, Boxes, Compass, FolderOpen, LayoutGrid, Plus, Sparkles } from "lucide-react";
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

const COLUMNS = Array.from({ length: 50 }, (_, index) => index * 20);
const DIRT_ROWS = [250, 270, 290];

/** Paisaje pixelado estilo Minecraft, dibujado con SVG para que escale nítido. */
function MinecraftScene() {
  return (
    <svg className="mc-scene" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="1000" height="300" style={{ fill: "var(--mc-sky-top)" }} />
      <rect y="180" width="1000" height="120" style={{ fill: "var(--mc-sky-bottom)" }} />

      {/* sol en bloque */}
      <rect x="838" y="38" width="36" height="36" style={{ fill: "var(--mc-sun)" }} />
      <rect x="846" y="46" width="20" height="20" style={{ fill: "var(--mc-cloud)" }} />

      {/* nubes */}
      {[
        [120, 52, 90],
        [232, 68, 60],
        [520, 44, 110],
        [690, 76, 70],
      ].map(([x, y, width], index) => (
        <g key={index} style={{ fill: "var(--mc-cloud)" }}>
          <rect x={x} y={y} width={width} height="14" />
          <rect x={x + 16} y={y - 12} width={width - 40} height="12" />
          <rect x={x + 34} y={y - 22} width={width - 78} height="12" />
        </g>
      ))}

      {/* montañas escalonadas */}
      <path
        d="M0 230 V186 H60 V166 H84 V142 H132 V166 H156 V186 H236 V206 H320 V230 Z"
        style={{ fill: "var(--mc-hill-far)" }}
      />
      <path
        d="M560 230 V196 H620 V172 H648 V150 H704 V172 H732 V196 H812 V214 H900 V230 Z"
        style={{ fill: "var(--mc-hill)" }}
      />

      {/* árboles */}
      {[100, 858].map((x) => (
        <g key={x}>
          <rect x={x + 24} y="192" width="14" height="38" style={{ fill: "var(--mc-trunk)" }} />
          <rect x={x} y="168" width="62" height="24" style={{ fill: "var(--mc-leaf)" }} />
          <rect x={x + 12} y="150" width="38" height="20" style={{ fill: "var(--mc-leaf)" }} />
          <rect x={x + 22} y="138" width="18" height="14" style={{ fill: "var(--mc-leaf)" }} />
        </g>
      ))}

      {/* césped y tierra en bloques */}
      {COLUMNS.map((x, index) => (
        <g key={x}>
          <rect x={x} y="230" width="20" height="20" style={{ fill: index % 2 ? "var(--mc-grass)" : "var(--mc-grass-dark)" }} />
          {DIRT_ROWS.map((y, row) => (
            <rect
              key={y}
              x={x}
              y={y}
              width="20"
              height="20"
              style={{ fill: (index + row) % 3 === 0 ? "var(--mc-dirt-dark)" : "var(--mc-dirt)" }}
            />
          ))}
        </g>
      ))}

      {/* pequeño creeper decorativo */}
      <g transform="translate(460 196)" opacity="0.9">
        <rect width="32" height="32" style={{ fill: "var(--mc-leaf)" }} />
        <rect x="6" y="8" width="6" height="7" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="20" y="8" width="6" height="7" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="12" y="18" width="8" height="8" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="10" y="26" width="4" height="6" style={{ fill: "var(--mc-dirt-dark)" }} />
        <rect x="18" y="26" width="4" height="6" style={{ fill: "var(--mc-dirt-dark)" }} />
      </g>
    </svg>
  );
}

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
