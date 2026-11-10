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
        "relative flex h-full shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[244px]",
      )}
    >
      <div className={cn("flex h-[76px] items-center px-4", collapsed && "justify-center px-0")}>
        <button
          className="focus-ring flex items-center gap-3 rounded-sm"
          onClick={() => navigate("/")}
          aria-label={t("Mnemo home")}
        >
          <span className="relative grid size-8 shrink-0 place-items-center border border-border bg-card">
            <span className="flex flex-col items-start gap-[3px]">
              <span className="h-px w-4 bg-primary" />
              <span className="h-px w-4 bg-foreground/65" />
              <span className="h-px w-2.5 bg-foreground/30" />
            </span>
          </span>
          {!collapsed && (
            <span className="flex flex-col items-start leading-none">
              <span className="display text-[23px] leading-none text-foreground">Mnemo</span>
              <span className="mt-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">
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
              <div className="mb-1.5 px-2.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-muted-foreground/65">
                {t(group.label)}
              </div>
            ) : (
              groupIndex > 0 && <div className="mx-2 mb-3 border-t border-border" />
            )}
            <div className="space-y-px">
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
                        "group relative flex items-center gap-2.5 rounded-sm py-2 text-[12.5px] transition-colors",
                        collapsed ? "justify-center px-0" : "pl-3 pr-2",
                        isActive
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary transition-opacity",
                            isActive ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <Icon
                          className={cn(
                            "size-[16px] shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground/80",
                          )}
                          strokeWidth={1.75}
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

      <div className="border-t border-border p-2.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "group relative flex items-center gap-2.5 rounded-sm py-2 text-[12.5px] transition-colors",
              collapsed ? "justify-center px-0" : "pl-3 pr-2",
              isActive
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  "absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-primary transition-opacity",
                  isActive ? "opacity-100" : "opacity-0",
                )}
              />
              <Settings
                className={cn(
                  "size-[16px] shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground/80",
                )}
                strokeWidth={1.75}
              />
              {!collapsed && <span>{t("Settings")}</span>}
            </>
          )}
        </NavLink>

        <button
          onClick={() => update({ sidebarCollapsed: !collapsed })}
          className={cn(
            "mt-0.5 flex w-full items-center gap-2.5 rounded-sm py-2 text-[11.5px] text-muted-foreground/70 transition-colors hover:bg-secondary/60 hover:text-foreground",
            collapsed ? "justify-center px-0" : "pl-3 pr-2",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose className="size-4" strokeWidth={1.75} />
              <span>{t("Collapse")}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
