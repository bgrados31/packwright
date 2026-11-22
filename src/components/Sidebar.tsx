import {
  Command,
  Gamepad2,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Settings2,
  House,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "../i18n";

export type SidebarView = "home" | "packs" | "servers" | "launcher" | "create" | "editor" | "settings";

type Props = {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCommands: () => void;
  active: SidebarView;
  onHome: () => void;
  onPacks: () => void;
  onSettings: () => void;
  onServers: () => void;
  onLauncher: () => void;
  packsCount: number;
  packwizReady?: boolean;
};

type ItemProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
};

function NavItem({ icon: Icon, label, active = false, collapsed, onClick, disabled = false, badge }: ItemProps) {
  return (
    <button
      className={`sidebar-item ${active ? "active" : ""}`}
      onClick={onClick}
      disabled={disabled}
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
          icon={House}
          label={t("nav.home")}
          active={props.active === "home"}
          collapsed={props.collapsed}
          onClick={props.onHome}
        />
        <NavItem
          icon={LayoutGrid}
          label={t("nav.modpacks")}
          active={props.active === "packs" || props.active === "create" || props.active === "editor"}
          collapsed={props.collapsed}
          onClick={props.onPacks}
          badge={props.collapsed ? undefined : String(props.packsCount)}
        />
        <NavItem
          icon={Server}
          label={t("nav.servers")}
          active={props.active === "servers"}
          collapsed={props.collapsed}
          onClick={props.onServers}
        />
        <NavItem
          icon={Gamepad2}
          label={t("nav.launcher")}
          active={props.active === "launcher"}
          collapsed={props.collapsed}
          onClick={props.onLauncher}
        />
      </nav>

      <div
        className={`sidebar-status ${props.collapsed ? "collapsed" : ""}`}
        title={props.packwizReady ? t("workspace.ready") : t("workspace.notReady")}
      >
        <span
          className={`status-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full ${props.packwizReady ? "bg-ok" : "bg-bad"}`}
        />
        {!props.collapsed && (
          <span className="truncate">{props.packwizReady ? t("workspace.ready") : t("workspace.notReady")}</span>
        )}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-item" onClick={props.onCommands} title={t("palette.title")}>
          <Command size={17} strokeWidth={1.8} className="sidebar-item-icon" />
          {!props.collapsed && (
            <>
              <span className="truncate">{t("palette.title")}</span>
              <span className="sidebar-badge">
                {/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}
              </span>
            </>
          )}
        </button>
        <NavItem
          icon={Settings2}
          label={t("setup.settingsTitle")}
          active={props.active === "settings"}
          collapsed={props.collapsed}
          onClick={props.onSettings}
        />
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
