import { NavLink, useNavigate } from "react-router-dom";
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
      { to: "/folders", label: "Folders", icon: FolderTree },
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

export function Sidebar() {
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const { t } = useI18n();
  const collapsed = settings.sidebarCollapsed;

  return (
    <aside
      className={cn(
        "relative m-3 mr-0 flex h-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl bg-card shadow-soft transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex h-[78px] items-center px-4", collapsed && "justify-center px-0")}>
        <button
          className="focus-ring flex items-center gap-3 rounded-xl"
          onClick={() => navigate("/")}
          aria-label={t("Mnemo home")}
        >
          <span className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_1px_2px_oklch(0.28_0.04_265/0.2)]">
            <span className="flex flex-col items-start gap-[3px]">
              <span className="h-[1.5px] w-4 rounded-full bg-primary-foreground" />
              <span className="h-[1.5px] w-4 rounded-full bg-primary-foreground/70" />
              <span className="h-[1.5px] w-2.5 rounded-full bg-primary-foreground/40" />
            </span>
          </span>
          {!collapsed && (
            <span className="flex flex-col items-start leading-none">
              <span className="display text-[22px] leading-none text-foreground">Mnemo</span>
              <span className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.13em] text-muted-foreground">
                {t("A quiet archive")}
              </span>
            </span>
          )}
        </button>
      </div>

      <div className={cn("px-3 pb-5", collapsed && "px-2.5")}>
        <Button
          className={cn("w-full", collapsed && "px-0")}
          onClick={() => navigate("/create")}
          size={collapsed ? "icon" : "default"}
        >
          <Plus />
          {!collapsed && <span>{t("New study set")}</span>}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 no-scrollbar">
        {GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && "mt-5")}>
            {!collapsed ? (
              <div className="mb-1.5 px-3 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/70">
                {t(group.label)}
              </div>
            ) : (
              groupIndex > 0 && <div className="mx-2 mb-3 h-px bg-border" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const label = t(item.label);
                const link = (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={"end" in item ? item.end : false}
                    className={({ isActive }) =>
                      cn(
                        "group relative flex items-center gap-2.5 rounded-lg py-2 text-[12.5px] font-medium transition-all",
                        collapsed ? "justify-center px-0" : "px-3",
                        isActive
                          ? "bg-primary-soft text-primary"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={cn(
                            "size-[17px] shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground/85",
                          )}
                          strokeWidth={1.8}
                        />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </>
                    )}
                  </NavLink>
                );

                if (!collapsed) return link;
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-2.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-2.5 rounded-lg py-2 text-[12.5px] font-medium transition-all",
              collapsed ? "justify-center px-0" : "px-3",
              isActive
                ? "bg-primary-soft text-primary"
                : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Settings
                className={cn(
                  "size-[17px] shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground/85",
                )}
                strokeWidth={1.8}
              />
              {!collapsed && <span>{t("Settings")}</span>}
            </>
          )}
        </NavLink>

        <button
          onClick={() => update({ sidebarCollapsed: !collapsed })}
          className={cn(
            "mt-1 flex w-full items-center gap-2.5 rounded-lg py-2 text-[11.5px] text-muted-foreground/80 transition-colors hover:bg-secondary/70 hover:text-foreground",
            collapsed ? "justify-center px-0" : "px-3",
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
      </div>
    </aside>
  );
}
