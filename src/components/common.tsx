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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="eyebrow mb-2.5">{eyebrow}</div>}
        <h1 className="display truncate text-[34px] leading-[1.05] text-foreground">{title}</h1>
        {description && (
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pb-0.5">{actions}</div>}
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
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  };

  return (
    <div className={cn("border-t border-border pt-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow">{label}</div>
        {Icon && <Icon className={cn("size-3.5", accents[accent])} />}
      </div>
      <div className="metric mt-2 text-[26px] font-medium leading-none text-foreground">{value}</div>
      {hint && <div className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</div>}
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
        "flex flex-col items-center justify-center gap-3 border-y border-border px-6 py-14 text-center",
        className,
      )}
    >
      {Icon && <Icon className="size-5 text-muted-foreground/60" strokeWidth={1.5} />}
      <div className="space-y-1.5">
        <div className="display text-[22px] leading-tight text-foreground">{title}</div>
        {description && (
          <p className="mx-auto max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingPanel({ label = "Loading" }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2.5 py-20">
      <Loader2 className="size-3.5 animate-spin text-primary" />
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {t(label)}…
      </span>
    </div>
  );
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-4 border-l-2 border-destructive bg-destructive/[0.04] px-5 py-5">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
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
    <kbd className="rounded-[3px] border border-border bg-card px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-muted-foreground">
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
    <div className="mb-3.5 flex items-end justify-between gap-4 border-b border-border pb-2.5">
      <div className="min-w-0">
        <h2 className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-[12px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
