import {
  CircleAlert,
  CircleCheck,
  Languages,
  LayoutGrid,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useI18n, type Locale } from "../i18n";

export type SidebarView = "packs" | "create" | "settings" | "editor";

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  active: SidebarView;
  onPacks: () => void;
  onCreate: () => void;
  onSettings: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  locale: Locale;
  onToggleLocale: () => void;
  packwizFound: boolean;
  packsCount: number;
};

type ItemProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick: () => void;
  badge?: string;
};

function NavItem({ icon: Icon, label, active = false, collapsed, onClick, badge }: ItemProps) {
  return (
    <button
      className={`sidebar-item ${active ? "active" : ""}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <Icon size={17} strokeWidth={1.8} className="sidebar-item-icon" />
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {badge && <span className="sidebar-badge">{badge}</span>}
        </>
      )}
    </button>
  );
}

export default function Sidebar(props: Props) {
  const { t } = useI18n();

  return (
    <aside className={`sidebar ${props.collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <img src="/packwright-mark.png" alt="" className="h-8 w-8 shrink-0" />
        {!props.collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">{t("app.name")}</p>
            <p className="truncate font-mono text-[9px] uppercase tracking-wider text-muted">
              {t("welcome.eyebrow")}
            </p>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        <NavItem
          icon={LayoutGrid}
          label={t("nav.modpacks")}
          active={props.active === "packs" || props.active === "editor"}
          collapsed={props.collapsed}
          onClick={props.onPacks}
          badge={props.collapsed ? undefined : String(props.packsCount)}
        />
        <NavItem
          icon={Plus}
          label={t("nav.newPack")}
          active={props.active === "create"}
          collapsed={props.collapsed}
          onClick={props.onCreate}
        />
        <NavItem
          icon={Settings2}
          label={t("setup.settingsTitle")}
          active={props.active === "settings"}
          collapsed={props.collapsed}
          onClick={props.onSettings}
        />
      </nav>

      <div className="sidebar-footer">
        <NavItem
          icon={props.theme === "light" ? Moon : Sun}
          label={t("nav.toggleTheme")}
          collapsed={props.collapsed}
          onClick={props.onToggleTheme}
        />
        <NavItem
          icon={Languages}
          label={t("nav.language")}
          collapsed={props.collapsed}
          onClick={props.onToggleLocale}
          badge={props.collapsed ? undefined : props.locale.toUpperCase()}
        />

        <div className={`sidebar-status ${props.collapsed ? "collapsed" : ""}`} title={props.packwizFound ? t("workspace.ready") : t("workspace.notReady")}>
          {props.packwizFound ? <CircleCheck size={14} /> : <CircleAlert size={14} />}
          {!props.collapsed && <span className="truncate">{props.packwizFound ? t("workspace.ready") : t("workspace.notReady")}</span>}
        </div>

        <button
          className="sidebar-item sidebar-collapse"
          onClick={props.onToggleCollapse}
          title={props.collapsed ? t("nav.expand") : t("nav.collapse")}
        >
          {props.collapsed ? <PanelLeftOpen size={17} strokeWidth={1.8} /> : <PanelLeftClose size={17} strokeWidth={1.8} />}
          {!props.collapsed && <span>{t("nav.collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}
