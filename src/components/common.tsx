import type { LucideIcon } from "lucide-react";
import { Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="display min-w-0 truncate text-[32px] leading-[1.06] text-foreground sm:text-[36px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "primary",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  accent?: "primary" | "success" | "warning" | "destructive" | "muted";
  className?: string;
}) {
  const accents: Record<string, string> = {
    primary: "bg-primary-soft text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/16 text-warning",
    destructive: "bg-destructive/12 text-destructive",
    muted: "bg-secondary text-muted-foreground",
  };

  return (
    <div
      className={cn(
        "rounded-xl bg-card p-5 shadow-soft transition-shadow hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11.5px] font-medium leading-snug text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", accents[accent])}>
            <Icon className="size-[15px]" strokeWidth={1.8} />
          </span>
        )}
      </div>
      <div className="metric mt-3 text-[30px] font-semibold leading-none text-foreground">{value}</div>
      {hint && <div className="mt-2 text-[11.5px] leading-snug text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl bg-card px-8 py-16 text-center shadow-soft",
        className,
      )}
    >
      {Icon && (
        <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="size-5" strokeWidth={1.7} />
        </span>
      )}
      <div className="space-y-2">
        <div className="display text-[22px] leading-tight text-foreground">{title}</div>
        {description && (
          <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function LoadingPanel({ label = "Loading" }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2.5 py-24">
      <Loader2 className="size-4 animate-spin text-primary" />
      <span className="text-[11.5px] font-medium text-muted-foreground">{t(label)}…</span>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3.5 rounded-xl bg-destructive/[0.07] p-5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/12 text-destructive">
        <TriangleAlert className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed text-foreground">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            {t("Try again")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function SectionTitle({
  title,
  action,
  description,
}: {
  title: string;
  action?: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-[12.5px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
