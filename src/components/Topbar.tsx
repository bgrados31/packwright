import { ChevronRight, Keyboard, Moon, Plus, Search, Sun } from "lucide-react";
import { useI18n, type TranslationKey } from "../i18n";
import type { SidebarView } from "./Sidebar";

type Props = {
  view: SidebarView;
  packName?: string | null;
  workspace: string;
  theme: "light" | "dark";
  onCommands: () => void;
  onShortcuts: () => void;
  onToggleTheme: () => void;
  onNewPack: () => void;
};

const VIEW_LABELS: Partial<Record<SidebarView, TranslationKey>> = {
  home: "nav.home",
  packs: "nav.modpacks",
  servers: "nav.servers",
  launcher: "nav.launcher",
  settings: "setup.settingsTitle",
  create: "nav.newPack",
  editor: "editor.files",
};

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

/** Barra superior global: migas de pan, búsqueda y acciones rápidas. */
export default function Topbar({
  view,
  packName,
  workspace,
  theme,
  onCommands,
  onShortcuts,
  onToggleTheme,
  onNewPack,
}: Props) {
  const { t } = useI18n();
  const folder = workspace.split(/[\\/]/).filter(Boolean).pop() ?? workspace;

  const crumbs: Array<{ label: string; muted?: boolean }> = [
    { label: folder || t("nav.workspace"), muted: true },
  ];
  if (view === "editor") {
    crumbs.push({ label: t("nav.modpacks"), muted: true });
    if (packName) crumbs.push({ label: packName, muted: true });
    crumbs.push({ label: t(VIEW_LABELS.editor ?? "editor.files") });
  } else if (view === "create") {
    crumbs.push({ label: t("nav.modpacks"), muted: true });
    crumbs.push({ label: t("nav.newPack") });
  } else {
    const key = VIEW_LABELS[view];
    crumbs.push({ label: key ? t(key) : t("app.name") });
  }

  return (
    <header className="topbar">
      <nav className="topbar-crumbs" aria-label={t("nav.workspace")}>
        <img src="/packwright-mark.png" alt="" className="topbar-mark" />
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="topbar-crumb-group">
            {index > 0 && <ChevronRight size={12} className="topbar-sep" />}
            <span className={`topbar-crumb ${crumb.muted ? "muted" : "current"}`} title={crumb.label}>
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <button className="topbar-search" onClick={onCommands} title={t("palette.title")}>
        <Search size={14} className="topbar-search-icon" />
        <span className="topbar-search-label">{t("topbar.search")}</span>
        <kbd>{MOD} K</kbd>
      </button>

      <div className="topbar-actions">
        <button
          className="topbar-icon"
          onClick={onToggleTheme}
          title={t("nav.toggleTheme")}
          aria-label={t("nav.toggleTheme")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="topbar-icon"
          onClick={onShortcuts}
          title={t("shortcuts.title")}
          aria-label={t("shortcuts.title")}
        >
          <Keyboard size={16} />
        </button>
        <button className="btn btn-primary topbar-new" onClick={onNewPack}>
          <Plus size={14} />
          <span>{t("nav.newPack")}</span>
        </button>
      </div>
    </header>
  );
}
