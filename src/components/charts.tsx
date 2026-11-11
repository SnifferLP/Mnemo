import { useMemo } from "react";
import { cn, shortDate } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { DayActivity, MasteryBucket } from "@/lib/types";

export function Ring({
  value,
  size = 128,
  stroke = 8,
  className,
  trackClassName,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  trackClassName?: string;
  children?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={cn("stroke-secondary", trackClassName)}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("stroke-primary transition-[stroke-dashoffset] duration-700 ease-out", className)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function ActivityChart({
  data,
  height = 200,
  valueLabel = "reviews",
}: {
  data: DayActivity[];
  height?: number;
  valueLabel?: string;
}) {
  const { t } = useI18n();
  const max = Math.max(1, ...data.map((d) => d.reviews));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="w-full">
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((day, index) => {
          const ratio = day.reviews / max;
          const barHeight = day.reviews === 0 ? 3 : Math.max(6, ratio * height);
          return (
            <div key={day.date} className="group relative flex h-full flex-1 items-end">
              <div
                className={cn(
                  "w-full max-w-[22px] rounded-[5px] transition-all duration-300",
                  day.reviews === 0
                    ? "bg-secondary"
                    : "bg-primary/70 group-hover:bg-primary",
                )}
                style={{ height: barHeight }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[10.5px] text-background shadow-lift group-hover:block">
                <div className="font-semibold">{shortDate(day.date)}</div>
                <div className="text-background/70">
                  {t("{reviews} {label} · {minutes}m", {
                    reviews: day.reviews,
                    label: t(valueLabel),
                    minutes: day.minutes,
                  })}
                </div>
              </div>
              {index % labelEvery === 0 && (
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-medium text-muted-foreground/70">
                  {shortDate(day.date)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="h-6" />
    </div>
  );
}

export function Heatmap({ data }: { data: DayActivity[] }) {
  const max = Math.max(1, ...data.map((d) => d.reviews));
  const weeks = useMemo(() => {
    const chunks: DayActivity[][] = [];
    const first = data[0];
    if (!first) return chunks;
    const firstDate = new Date(`${first.date}T00:00:00`);
    const weekdayIndex = (firstDate.getDay() + 6) % 7;
    const padded: (DayActivity | null)[] = Array.from({ length: weekdayIndex }, () => null);
    padded.push(...data);
    for (let i = 0; i < padded.length; i += 7) {
      chunks.push(padded.slice(i, i + 7).filter(Boolean) as DayActivity[]);
    }
    return chunks;
  }, [data]);

  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between py-0.5 text-[8px] font-medium text-muted-foreground/60">
        {["M", "W", "F"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="flex flex-1 gap-[3px] overflow-hidden">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-[3px]">
            {week.map((day) => {
              const intensity = day.reviews === 0 ? 0 : Math.max(0.18, Math.min(1, day.reviews / max));
              return (
                <div
                  key={day.date}
                  title={`${day.date} — ${day.reviews} reviews, ${day.minutes} min`}
                  className="size-[11px] rounded-[3px] transition-transform hover:scale-125"
                  style={{
                    background:
                      intensity === 0
                        ? "var(--secondary)"
                        : `color-mix(in oklch, var(--primary) ${Math.round(intensity * 100)}%, var(--secondary))`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const BUCKET_STYLES: Record<string, string> = {
  muted: "bg-muted-foreground/40",
  warning: "bg-warning",
  destructive: "bg-destructive",
  success: "bg-success",
  primary: "bg-primary",
};

export function MasteryBar({ buckets }: { buckets: MasteryBucket[] }) {
  const { t } = useI18n();
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0) || 1;
  return (
    <div className="space-y-4">
      <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className={cn("h-full rounded-full transition-all", BUCKET_STYLES[bucket.color] ?? "bg-primary")}
            style={{ width: `${(bucket.count / total) * 100}%` }}
            title={`${bucket.label}: ${bucket.count}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex items-center gap-2 text-[12px]">
            <span className={cn("size-2 rounded-full", BUCKET_STYLES[bucket.color] ?? "bg-primary")} />
            <span className="flex-1 text-muted-foreground">{t(bucket.label)}</span>
            <span className="text-[11.5px] font-semibold tabular-nums">{bucket.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ModeBars({
  data,
  labels,
}: {
  data: { key: string; value: number }[];
  labels: Record<string, string>;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-4">
      {data.map((item) => (
        <div key={item.key} className="space-y-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">{labels[item.key] ?? item.key}</span>
            <span className="text-[11.5px] font-semibold tabular-nums">{Math.round(item.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
