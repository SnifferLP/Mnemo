import type { ReactElement } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  FolderTree,
  LayoutDashboard,
  Library,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Sparkles,
} from "lucide-react";

import logoUrl from "../../../assets/icon.png";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSettings } from "@/context/SettingsContext";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const GROUPS = [
  {
    label: "Library",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/sets", label: "Study Sets", icon: Library },
      { to: "/folders", label: "Folders", icon: FolderTree, also: "/archive" },
      { to: "/create", label: "Create", icon: Plus },
    ],
  },
  {
    label: "Studio",
    items: [
      { to: "/assistant", label: "AI Assistant", icon: Sparkles },
      { to: "/magic-notes", label: "Magic Notes", icon: NotebookPen },
    ],
  },
  {
    label: "Review",
    items: [{ to: "/statistics", label: "Statistics", icon: BarChart3 }],
  },
] as const;

/**
 * One item shape for both sidebar states. Collapsed items are a fixed 36px
 * square centred with `mx-auto`, so every icon lands on the same vertical axis
 * no matter how long its label is or which group it belongs to.
 */
function itemClasses(collapsed: boolean, active: boolean) {
  return cn(
    "group flex items-center rounded-lg font-medium transition-colors",
    collapsed ? "mx-auto size-9 justify-center text-[13px]" : "gap-2.5 px-3 py-2 text-[12.5px]",
    active
      ? "bg-primary-soft text-primary"
      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
  );
}

/**
 * NavLink resolves this from the router; the collapsed tooltip clones the link,
 * which would stringify a function className, so it is computed here instead.
 */
function isItemActive(pathname: string, to: string, end: boolean) {
  if (end || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Collapsed controls need a label; expanded ones would only add noise. */
function MaybeTooltip({
  collapsed,
  label,
  children,
}: {
  collapsed: boolean;
  label: string;
  children: ReactElement;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const collapsed = settings.sidebarCollapsed;

  return (
    <aside
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-border/70 bg-card transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div
        className={cn(
          "flex h-[78px] shrink-0 items-center",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        <button
          className={cn(
            "focus-ring flex items-center rounded-xl",
            collapsed ? "justify-center" : "gap-2.5",
          )}
          onClick={() => navigate("/")}
          aria-label={t("Mnemo home")}
        >
          <img
            src={logoUrl}
            alt={t("Mnemo logo")}
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-[9px] object-contain"
          />
          {!collapsed && (
            <span className="display text-[21px] leading-none text-foreground">Mnemo</span>
          )}
        </button>
      </div>

      <div className={cn("pb-5", collapsed ? "flex justify-center" : "px-3")}>
        <MaybeTooltip collapsed={collapsed} label={t("New study set")}>
          <Button
            className={cn(collapsed ? "size-9" : "w-full")}
            onClick={() => navigate("/create")}
            size={collapsed ? "icon" : "default"}
            aria-label={t("New study set")}
          >
            <Plus />
            {!collapsed && <span>{t("New study set")}</span>}
          </Button>
        </MaybeTooltip>
      </div>

      <nav
        className={cn("flex-1 overflow-y-auto pb-4 no-scrollbar", collapsed ? "px-0" : "px-2.5")}
      >
        {GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && (collapsed ? "mt-4" : "mt-5"))}>
            {!collapsed ? (
              <div className="mb-1.5 px-3 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/70">
                {t(group.label)}
              </div>
            ) : (
              groupIndex > 0 && <div className="mx-auto mb-3 h-px w-6 bg-border" />
            )}
            <div className={collapsed ? "space-y-1" : "space-y-0.5"}>
              {group.items.map((item) => {
                const Icon = item.icon;
                const label = t(item.label);
                const alsoActive =
                  "also" in item && item.also ? location.pathname === item.also : false;

                // A plain string className keeps the item styling intact when
                // the collapsed tooltip clones the link as its trigger.
                const active = isItemActive(location.pathname, item.to, "end" in item && item.end) || alsoActive;
                const link = (
                  <NavLink
                    to={item.to}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    className={itemClasses(collapsed, active)}
                  >
                    <Icon
                      className={cn(
                        "size-[17px] shrink-0",
                        active ? "text-primary" : "text-muted-foreground/85",
                      )}
                      strokeWidth={1.8}
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                );

                return (
                  <MaybeTooltip key={item.to} collapsed={collapsed} label={label}>
                    {link}
                  </MaybeTooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={cn("pb-3", collapsed ? "flex flex-col items-center gap-1" : "px-2.5")}>
        <MaybeTooltip collapsed={collapsed} label={t("Settings")}>
          <NavLink
            to="/settings"
            aria-label={t("Settings")}
            aria-current={isItemActive(location.pathname, "/settings", false) ? "page" : undefined}
            className={itemClasses(collapsed, isItemActive(location.pathname, "/settings", false))}
          >
            <Settings
              className={cn(
                "size-[17px] shrink-0",
                isItemActive(location.pathname, "/settings", false)
                  ? "text-primary"
                  : "text-muted-foreground/85",
              )}
              strokeWidth={1.8}
            />
            {!collapsed && <span>{t("Settings")}</span>}
          </NavLink>
        </MaybeTooltip>

        <MaybeTooltip collapsed={collapsed} label={t("Expand sidebar")}>
          <button
            onClick={() => update({ sidebarCollapsed: !collapsed })}
            aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            className={cn(
              "flex items-center rounded-lg text-[11.5px] text-muted-foreground/80 transition-colors hover:bg-secondary/70 hover:text-foreground",
              collapsed ? "size-9 justify-center" : "mt-1 w-full gap-2.5 px-3 py-2",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" strokeWidth={1.8} />
            ) : (
              <>
                <PanelLeftClose className="size-4" strokeWidth={1.8} />
                <span>{t("Collapse")}</span>
              </>
            )}
          </button>
        </MaybeTooltip>
      </div>
    </aside>
  );
}
