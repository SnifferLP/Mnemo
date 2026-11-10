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
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex h-[62px] shrink-0 items-center gap-3 border-b border-border bg-background/90 px-5 backdrop-blur-md">
        <Button variant="ghost" size="icon-sm" onClick={onExit} aria-label={t("Leave session")} className="-ml-1">
          <X />
        </Button>
        <div className="min-w-0">
          <div className="display truncate text-[16px] leading-tight text-foreground">{title}</div>
          {subtitle && (
            <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">{right}</div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className={cn("mx-auto w-full px-6 py-9", width)}>{children}</div>
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
      <Card className="overflow-hidden rounded-xl">
        <div className="border-b border-border px-8 py-10 text-center">
          <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-primary">
            {t("Session complete")}
          </div>
          <h2 className="display mt-3 text-[30px] leading-tight text-foreground">{title}</h2>
          {description && (
            <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          <div className="metric mt-7 font-display text-[56px] leading-none text-primary">
            {pct(accuracy, 0)}
          </div>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("accuracy")}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {metrics.map((metric) => (
            <div key={metric.label} className="px-4 py-5 text-center">
              <div className="metric text-[18px] font-medium">{metric.value}</div>
              <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground">
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
