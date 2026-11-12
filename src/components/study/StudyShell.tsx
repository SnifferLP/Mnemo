import { X } from "lucide-react";

import { cn, pct } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function StudyShell({
  title,
  subtitle,
  onExit,
  right,
  children,
  width = "max-w-4xl",
}: {
  title: string;
  subtitle?: string;
  onExit: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  width?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex app-viewport w-full flex-col bg-background">
      <header className="flex h-[68px] shrink-0 items-center gap-3 px-5">
        <div className="flex w-full items-center gap-3 rounded-xl bg-card px-3 py-2 shadow-soft">
          <Button variant="ghost" size="icon-sm" onClick={onExit} aria-label={t("Leave session")}>
            <X />
          </Button>
          <div className="min-w-0">
            <div className="display truncate text-[15px] leading-tight text-foreground">{title}</div>
            {subtitle && (
              <div className="mt-0.5 truncate text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                {subtitle}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">{right}</div>
        </div>
      </header>
      <div className="flex-1 scroll-pb-6 overflow-y-auto">
        <div className={cn("mx-auto w-full px-6 pb-10 pt-4", width)}>{children}</div>
      </div>
    </div>
  );
}

export function StudyResults({
  title,
  description,
  accuracy,
  metrics,
  actions,
}: {
  title: string;
  description?: string;
  accuracy: number;
  metrics: { label: string; value: string | number }[];
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl animate-scale-in">
      <Card className="overflow-hidden rounded-2xl">
        <div className="px-8 pb-8 pt-10 text-center">
          <span className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-primary">
            {t("Session complete")}
          </span>
          <h2 className="display mt-4 text-[30px] leading-tight text-foreground">{title}</h2>
          {description && (
            <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          <div className="metric mt-7 font-display text-[58px] leading-none text-primary">
            {pct(accuracy, 0)}
          </div>
          <div className="mt-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t("accuracy")}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl bg-secondary/60 px-3 py-4 text-center">
              <div className="metric text-[19px] font-semibold">{metric.value}</div>
              <div className="mt-1 text-[10.5px] font-medium text-muted-foreground">
                {metric.label}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
