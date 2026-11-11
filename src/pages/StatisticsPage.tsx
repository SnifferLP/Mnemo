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
import { Progress } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "3 months" },
  { value: "365", label: "1 year" },
];

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
          <div className="flex items-center gap-2.5">
            <span className="h-px w-7 bg-primary" />
            <span className="eyebrow">{t("Statistics")}</span>
          </div>
          <h1 className="display mt-3 text-[38px] leading-[1.04]">{t("Your learning, measured")}</h1>
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
        <div className="border-y border-border py-16 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {loading ? t("Crunching your history…") : t("No statistics available yet.")}
        </div>
      )}

      {data && totals && (
        <div>
          <section className="grid gap-x-10 gap-y-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Reviews · {days}d", { days: range })}</span>
                <BookOpenCheck className="size-3.5 text-muted-foreground/60" strokeWidth={1.75} />
              </div>
              <div className="metric mt-2 text-[30px] font-medium leading-none">
                {totalReviews.toLocaleString()}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("{count} today", { count: totals.reviewsToday })}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Success rate · 7d")}</span>
                <TrendingUp className="size-3.5 text-success" strokeWidth={1.75} />
              </div>
              <div className="metric mt-2 text-[30px] font-medium leading-none">
                {totals.reviews7d > 0 ? pct(totals.accuracy7d, 1) : "—"}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("{count} reviews last week", { count: totals.reviews7d })}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Study time · 7d")}</span>
                <Clock className="size-3.5 text-primary" strokeWidth={1.75} />
              </div>
              <div className="metric mt-2 text-[30px] font-medium leading-none">
                {formatDuration(totals.studyMinutes7d * 60)}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("{minutes} minutes today", { minutes: Math.round(totals.minutesToday) })}
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Mastered cards")}</span>
                <Target className="size-3.5 text-warning" strokeWidth={1.75} />
              </div>
              <div className="metric mt-2 text-[30px] font-medium leading-none">
                {totals.mastered}
                <span className="text-[16px] font-normal text-muted-foreground"> / {totals.cards}</span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {totals.cards
                  ? t("{percent}% of your library", {
                      percent: Math.round((totals.mastered / totals.cards) * 100),
                    })
                  : t("No cards yet")}
              </p>
            </div>
          </section>

          <section className="border-b border-border py-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="eyebrow">{t("Daily rhythm")}</div>
                <h2 className="display mt-1.5 text-[24px] leading-tight">{t("Reviews per day")}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                <Flame className="size-3.5 text-warning" />
                {t("{count} day streak", { count: totals.streakDays })}
                {totals.longestStreak > 0 && (
                  <span className="text-muted-foreground/60">
                    · {t("Best {count} days", { count: totals.longestStreak })}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-6">
              <ActivityChart data={data.daily} height={190} valueLabel="reviews" />
            </div>
          </section>

          <div className="grid gap-10 border-b border-border py-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:divide-x lg:divide-border">
            <section className="min-w-0 lg:pr-10">                <div className="eyebrow">{t("Consistency")}</div>
                <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Last 30 weeks")}</h2>
              <div className="mt-5">
                {calendar.length > 0 ? (
                  <Heatmap data={calendar} />
                ) : (
                  <p className="text-[12px] text-muted-foreground">{t("No activity recorded yet.")}</p>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <span>{t("Less")}</span>
                {[0.15, 0.4, 0.65, 1].map((intensity) => (
                  <span
                    key={intensity}
                    className="size-2.5 rounded-[2px]"
                    style={{
                      background: `color-mix(in oklch, var(--primary) ${intensity * 100}%, var(--muted))`,
                    }}
                  />
                ))}
                <span>{t("More")}</span>
              </div>
            </section>

            <section className="lg:pl-10">
              <div className="eyebrow">{t("Recall quality")}</div>
              <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Mastery distribution")}</h2>
              <div className="mt-5 space-y-5">
                <MasteryBar buckets={data.masteryBuckets} />
                <div className="flex items-center gap-6 border-t border-border pt-5">
                  <Ring
                    value={totals.cards ? (totals.mastered / totals.cards) * 100 : 0}
                    size={92}
                    stroke={7}
                  >
                    <span className="metric text-[17px] font-medium">
                      {totals.cards ? Math.round((totals.mastered / totals.cards) * 100) : 0}%
                    </span>
                    <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-muted-foreground">
                      {t("mastered")}
                    </span>
                  </Ring>
                  <div className="flex-1 space-y-2 text-[11.5px]">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-primary" />
                      <span className="text-muted-foreground">{t("Due today")}</span>
                      <span className="ml-auto font-mono text-[10.5px] tabular-nums">{totals.dueToday}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-success" />
                      <span className="text-muted-foreground">{t("Mastered")}</span>
                      <span className="ml-auto font-mono text-[10.5px] tabular-nums">{totals.mastered}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                      <span className="text-muted-foreground">{t("Total cards")}</span>
                      <span className="ml-auto font-mono text-[10.5px] tabular-nums">{totals.cards}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="grid gap-10 border-b border-border py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:divide-x lg:divide-border">
            <section className="min-w-0 lg:pr-10">
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
            </section>

            <section className="min-w-0 lg:pl-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="eyebrow">{t("By collection")}</div>
                  <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Progress by study set")}</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/sets")}>
                  {t("All sets")} <ArrowRight className="size-3.5" />
                </Button>
              </div>
              <div className="mt-3 divide-y divide-border border-t border-border">
                {data.sets.length === 0 ? (
                  <EmptyState
                    icon={Layers}
                    title={t("No study sets yet")}
                    description={t("Create a set and review a few cards to see progress here.")}
                    action={<Button onClick={() => navigate("/create")}>{t("Create a set")}</Button>}
                  />
                ) : (
                  data.sets.map((set) => (
                    <Link
                      key={set.setId}
                      to={`/sets/${set.setId}`}
                      className="group flex items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[12.5px] font-medium transition-colors group-hover:text-primary">
                            {set.title}
                          </span>
                          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                            {set.mastered}/{set.cards}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <Progress
                            value={set.cards ? (set.mastered / set.cards) * 100 : 0}
                            className="h-[2px] rounded-none"
                            indicatorClassName="rounded-none"
                          />
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {t("{count} reviews", { count: set.reviews })}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`metric w-9 shrink-0 text-right text-[12px] font-medium ${
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
            </section>
          </div>

          <p className="max-w-2xl py-6 text-[10.5px] leading-relaxed text-muted-foreground">
            {t(
              "Accuracy counts correct and half-credit answers. Mastered means an interval of 21+ days with at least two correct reviews.",
            )}
          </p>
        </div>
      )}
    </div>
  );
}
