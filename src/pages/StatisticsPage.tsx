import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpenCheck,
  Clock,
  Flame,
  Layers,
  Target,
  TrendingUp,
} from "lucide-react";

import { api } from "@/lib/api";
import type { DayActivity, StatisticsData } from "@/lib/types";
import { errorMessage, formatDuration, pct } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { ActivityChart, Heatmap, MasteryBar, ModeBars, Ring } from "@/components/charts";
import { EmptyState, ErrorPanel } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "3 months" },
  { value: "365", label: "1 year" },
];

function Stat({
  label,
  icon: Icon,
  iconClass,
  value,
  hint,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClass: string;
  value: React.ReactNode;
  hint: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${iconClass}`}>
          <Icon className="size-[15px]" strokeWidth={1.8} />
        </span>
      </div>
      <div className="metric mt-3 text-[30px] font-semibold leading-none">{value}</div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">{hint}</p>
    </Card>
  );
}

export function StatisticsPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [range, setRange] = useState("30");
  const [data, setData] = useState<StatisticsData | null>(null);
  const [calendar, setCalendar] = useState<DayActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = Number(range);
      const [stats, activity] = await Promise.all([
        api.insights.statistics(days),
        api.insights.calendar(210),
      ]);
      setData(stats);
      setCalendar(activity);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = data?.totals;
  const totalReviews = data?.daily.reduce((sum, day) => sum + day.reviews, 0) ?? 0;

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="eyebrow">{t("Statistics")}</div>
          <h1 className="display mt-2.5 text-[32px] leading-[1.06] sm:text-[38px]">
            {t("Your learning, measured")}
          </h1>
          <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {t("Everything is computed locally from your review history and study sessions.")}
          </p>
        </div>
        <Tabs value={range} onValueChange={setRange}>
          <TabsList>
            {RANGES.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {t(item.label)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      {error && <ErrorPanel message={error} onRetry={() => void load()} />}

      {!error && !data && (
        <div className="rounded-2xl bg-card py-20 text-center text-[12px] text-muted-foreground shadow-soft">
          {loading ? t("Crunching your history…") : t("No statistics available yet.")}
        </div>
      )}

      {data && totals && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={t("Reviews · {days}d", { days: range })}
              icon={BookOpenCheck}
              iconClass="bg-secondary text-muted-foreground"
              value={totalReviews.toLocaleString()}
              hint={t("{count} today", { count: totals.reviewsToday })}
            />
            <Stat
              label={t("Success rate · 7d")}
              icon={TrendingUp}
              iconClass="bg-success/12 text-success"
              value={totals.reviews7d > 0 ? pct(totals.accuracy7d, 1) : "—"}
              hint={t("{count} reviews last week", { count: totals.reviews7d })}
            />
            <Stat
              label={t("Study time · 7d")}
              icon={Clock}
              iconClass="bg-primary-soft text-primary"
              value={formatDuration(totals.studyMinutes7d * 60)}
              hint={t("{minutes} minutes today", { minutes: Math.round(totals.minutesToday) })}
            />
            <Stat
              label={t("Mastered cards")}
              icon={Target}
              iconClass="bg-warning/16 text-warning"
              value={
                <>
                  {totals.mastered}
                  <span className="text-[15px] font-normal text-muted-foreground"> / {totals.cards}</span>
                </>
              }
              hint={
                totals.cards
                  ? t("{percent}% of your library", {
                      percent: Math.round((totals.mastered / totals.cards) * 100),
                    })
                  : t("No cards yet")
              }
            />
          </section>

          <Card className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="eyebrow">{t("Daily rhythm")}</div>
                <h2 className="display mt-1.5 text-[23px] leading-tight">{t("Reviews per day")}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-full bg-secondary/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                <Flame className="size-3.5 text-warning" strokeWidth={1.8} />
                {t("{count} day streak", { count: totals.streakDays })}
                {totals.longestStreak > 0 && (
                  <span className="text-muted-foreground/70">
                    · {t("Best {count} days", { count: totals.longestStreak })}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-6">
              <ActivityChart data={data.daily} height={190} valueLabel="reviews" />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card className="p-6">
              <div className="eyebrow">{t("Consistency")}</div>
              <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Last 30 weeks")}</h2>
              <div className="mt-5">
                {calendar.length > 0 ? (
                  <Heatmap data={calendar} />
                ) : (
                  <p className="text-[12px] text-muted-foreground">{t("No activity recorded yet.")}</p>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
                <span>{t("Less")}</span>
                {[0.15, 0.4, 0.65, 1].map((intensity) => (
                  <span
                    key={intensity}
                    className="size-2.5 rounded-[3px]"
                    style={{
                      background: `color-mix(in oklch, var(--primary) ${intensity * 100}%, var(--secondary))`,
                    }}
                  />
                ))}
                <span>{t("More")}</span>
              </div>
            </Card>

            <Card className="p-6">
              <div className="eyebrow">{t("Recall quality")}</div>
              <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Mastery distribution")}</h2>
              <div className="mt-5 space-y-5">
                <MasteryBar buckets={data.masteryBuckets} />
                <div className="flex items-center gap-5 rounded-xl bg-secondary/60 p-4">
                  <Ring
                    value={totals.cards ? (totals.mastered / totals.cards) * 100 : 0}
                    size={88}
                    stroke={8}
                  >
                    <span className="metric text-[17px] font-semibold">
                      {totals.cards ? Math.round((totals.mastered / totals.cards) * 100) : 0}%
                    </span>
                    <span className="text-[9px] font-medium text-muted-foreground">
                      {t("mastered")}
                    </span>
                  </Ring>
                  <div className="flex-1 space-y-2 text-[11.5px]">
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-primary" />
                      <span className="text-muted-foreground">{t("Due today")}</span>
                      <span className="ml-auto font-semibold tabular-nums">{totals.dueToday}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-success" />
                      <span className="text-muted-foreground">{t("Mastered")}</span>
                      <span className="ml-auto font-semibold tabular-nums">{totals.mastered}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full bg-muted-foreground/40" />
                      <span className="text-muted-foreground">{t("Total cards")}</span>
                      <span className="ml-auto font-semibold tabular-nums">{totals.cards}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card className="p-6">
              <div className="eyebrow">{t("Method")}</div>
              <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Study modes")}</h2>
              <div className="mt-5">
                {data.modes.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">{t("No reviews in this range.")}</p>
                ) : (
                  <ModeBars
                    data={data.modes.map((mode) => ({ key: mode.mode, value: mode.reviews }))}
                    labels={{
                      flashcards: t("Flashcards"),
                      adaptive: t("Adaptive learning"),
                      write: t("Writing"),
                      spaced: t("Spaced repetition"),
                      test: t("Practice test"),
                      matching: t("Matching game"),
                      review: t("Review"),
                    }}
                  />
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="eyebrow">{t("By collection")}</div>
                  <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Progress by study set")}</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/sets")}>
                  {t("All sets")} <ArrowRight className="size-3.5" />
                </Button>
              </div>
              <div className="mt-3 space-y-1">
                {data.sets.length === 0 ? (
                  <EmptyState
                    icon={Layers}
                    title={t("No study sets yet")}
                    description={t("Create a set and review a few cards to see progress here.")}
                    action={<Button onClick={() => navigate("/create")}>{t("Create a set")}</Button>}
                    className="shadow-none"
                  />
                ) : (
                  data.sets.map((set) => (
                    <Link
                      key={set.setId}
                      to={`/sets/${set.setId}`}
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[12.5px] font-medium transition-colors group-hover:text-primary">
                            {set.title}
                          </span>
                          <span className="shrink-0 text-[10.5px] font-medium text-muted-foreground">
                            {set.mastered}/{set.cards}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <Progress value={set.cards ? (set.mastered / set.cards) * 100 : 0} className="h-1" />
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {t("{count} reviews", { count: set.reviews })}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`metric w-10 shrink-0 text-right text-[12px] font-semibold ${
                          set.accuracy >= 80
                            ? "text-success"
                            : set.accuracy >= 60
                              ? "text-warning"
                              : "text-muted-foreground"
                        }`}
                      >
                        {set.reviews > 0 ? `${Math.round(set.accuracy)}%` : t("new")}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </Card>
          </div>

          <p className="max-w-2xl px-1 text-[10.5px] leading-relaxed text-muted-foreground">
            {t(
              "Accuracy counts correct and half-credit answers. Mastered means an interval of 21+ days with at least two correct reviews.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
