import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  CalendarCheck,
  Flame,
  Layers,
  Play,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import { api } from "@/lib/api";
import type { DashboardData, FolderNode } from "@/lib/types";
import { greeting, pct } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { useI18n } from "@/i18n";
import { ActivityChart, Ring } from "@/components/charts";
import { EmptyState, ErrorPanel, SectionTitle } from "@/components/common";
import { StudySetCard } from "@/components/StudySetCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress, Skeleton } from "@/components/ui/misc";

function MetricTile({
  label,
  icon: Icon,
  iconClass,
  value,
  suffix,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClass: string;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${iconClass}`}>
          <Icon className="size-[15px]" strokeWidth={1.8} />
        </span>
      </div>
      <div className="metric mt-3 flex items-baseline gap-1.5 text-[30px] font-semibold leading-none">
        {value}
        {suffix && <span className="text-[13px] font-normal text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-auto pt-3">{children}</div>
    </Card>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { t, tp, locale } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, folderList] = await Promise.all([
        api.insights.dashboard(),
        api.folders.list(),
      ]);
      setData(dashboard);
      setFolders(folderList);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not load your dashboard."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const name = settings.displayName.trim();
  const totals = data?.totals;
  const nextSet = data?.continueSets[0];
  const today = new Date().toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="eyebrow">{today}</div>
          <h1 className="display mt-2.5 text-[34px] leading-[1.05] text-foreground sm:text-[40px]">
            {greeting()}
            {name && <em className="not-italic text-muted-foreground">, {name}</em>}
          </h1>
          <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {totals && totals.dueToday > 0
              ? tp(
                  totals.dueToday,
                  "1 card is ready for review. A short session keeps the archive alive.",
                  "{count} cards are ready for review. A short session keeps the archive alive.",
                )
              : t("Nothing is due right now. Add new material or revisit an old set.")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-1">
          <Button variant="outline" onClick={() => navigate("/assistant")}>
            <Sparkles /> {t("Ask the tutor")}
          </Button>
          <Button onClick={() => navigate("/create")}>
            <Plus /> {t("New study set")}
          </Button>
        </div>
      </header>

      {error && <ErrorPanel message={error} onRetry={() => void load()} />}

      {loading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[152px]" />
          ))}
        </div>
      )}

      {data && totals && totals.sets === 0 && totals.reviews7d === 0 && totals.longestStreak === 0 && (
        <EmptyState
          icon={Brain}
          title={t("Your library is empty")}
          description={t(
            "Create a study set or import your notes to start learning. Reviews, sessions and progress stay at zero until you add cards.",
          )}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => navigate("/sets")}>
                {t("Browse library")}
              </Button>
              <Button onClick={() => navigate("/create")}>
                <Plus /> {t("New study set")}
              </Button>
            </div>
          }
        />
      )}

      {data && totals && (totals.sets > 0 || totals.reviews7d > 0 || totals.longestStreak > 0) && (
        <div className="space-y-6">
          <section>
            <SectionTitle
              title={t("Continue where you left off")}
              description={t("Sets with cards waiting for review")}
              action={
                <Button variant="ghost" size="sm" onClick={() => navigate("/sets")}>
                  {t("All sets")} <ArrowRight className="size-3.5" />
                </Button>
              }
            />
            {data.continueSets.length === 0 && data.recentSets.length === 0 ? (
              <EmptyState
                icon={Brain}
                title={t("No study sets yet")}
                description={t(
                  "Create your first set, paste existing flashcards, or let AI build them from your notes.",
                )}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => navigate("/create")}>
                      <Plus /> {t("Create a set")}
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/magic-notes")}>
                      <Sparkles /> {t("Use Magic Notes")}
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(data.continueSets.length > 0 ? data.continueSets : data.recentSets)
                  .slice(0, 3)
                  .map((set) => (
                    <StudySetCard key={set.id} set={set} folders={folders} onChanged={load} />
                  ))}
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_1fr_1fr]">
            <Card className="relative flex flex-col overflow-hidden bg-primary p-5 text-primary-foreground shadow-lift">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11.5px] font-medium text-primary-foreground/80">
                  {t("Ready to review")}
                </span>
                <span className="grid size-8 place-items-center rounded-lg bg-primary-foreground/15">
                  <CalendarCheck className="size-[15px]" strokeWidth={1.8} />
                </span>
              </div>
              <div className="metric mt-3 flex items-end gap-2 text-[44px] font-semibold leading-[0.9]">
                {totals.dueToday}
                <span className="pb-1.5 text-[12px] font-normal text-primary-foreground/75">
                  {t(totals.dueToday === 1 ? "card due" : "cards due")}
                </span>
              </div>
              <Button
                size="sm"
                className="mt-auto self-start bg-primary-foreground text-primary shadow-none hover:bg-primary-foreground/90"
                onClick={() =>
                  nextSet ? navigate(`/sets/${nextSet.id}/study/adaptive`) : navigate("/sets")
                }
              >
                <Play /> {t(nextSet ? "Continue studying" : "Choose a set")}
              </Button>
            </Card>

            <MetricTile
              label={t("Today")}
              icon={Target}
              iconClass="bg-secondary text-muted-foreground"
              value={totals.reviewsToday}
              suffix={`/ ${totals.dailyGoal}`}
            >
              <Progress value={totals.goalProgress} className="h-1.5" />
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                {t("{percent}% of your daily reviews", { percent: Math.round(totals.goalProgress) })}
              </p>
            </MetricTile>

            <MetricTile
              label={t("Streak")}
              icon={Flame}
              iconClass="bg-warning/16 text-warning"
              value={totals.streakDays}
              suffix={t(totals.streakDays === 1 ? "day" : "days")}
            >
              <p className="text-[11.5px] text-muted-foreground">
                {t(
                  totals.studiedToday
                    ? "Today counts."
                    : totals.streakDays > 0
                      ? "Study today to keep it going."
                      : "Study once to begin.",
                )}
              </p>
              {totals.longestStreak > 0 && (
                <p className="mt-1 text-[10.5px] text-muted-foreground/80">
                  {t("Best {count} days", { count: totals.longestStreak })}
                </p>
              )}
            </MetricTile>

            <MetricTile
              label={t("Accuracy · 7d")}
              icon={TrendingUp}
              iconClass="bg-success/12 text-success"
              value={totals.reviews7d > 0 ? pct(totals.accuracy7d, 1) : "—"}
            >
              <p className="text-[11.5px] text-muted-foreground">
                {t("{reviews} reviews · {minutes} min", {
                  reviews: totals.reviews7d,
                  minutes: Math.round(totals.studyMinutes7d),
                })}
              </p>
            </MetricTile>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <Card className="p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="eyebrow">{t("The last two weeks")}</div>
                  <h2 className="display mt-1.5 text-[23px] leading-tight">{t("Learning activity")}</h2>
                </div>
                <Link
                  to="/statistics"
                  className="group flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  {t("Full statistics")}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div className="mt-6">
                <ActivityChart data={data.activity} height={158} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                <span>
                  {t("{average} reviews per day on average", {
                    average: (data.activity.reduce((sum, day) => sum + day.reviews, 0) / 14).toFixed(1),
                  })}
                </span>
                <span>
                  {t("{minutes} min studied this week", {
                    minutes: Math.round(totals.studyMinutes7d),
                  })}
                </span>
              </div>
            </Card>

            <Card className="flex flex-col p-6">
              <div className="eyebrow">{t("Daily goal")}</div>
              <div className="mt-4 flex items-center gap-5">
                <Ring value={totals.goalProgress} size={104} stroke={8}>
                  <span className="metric text-[22px] font-semibold leading-none">
                    {Math.round(totals.goalProgress)}%
                  </span>
                </Ring>
                <div className="min-w-0">
                  <p className="text-[13px] leading-snug text-foreground">
                    {totals.reviewsToday >= totals.dailyGoal
                      ? t("Goal reached. Anything else is a bonus.")
                      : t("{count} more reviews to close the day.", {
                          count: totals.dailyGoal - totals.reviewsToday,
                        })}
                  </p>
                  <p className="mt-1.5 text-[10.5px] font-medium text-muted-foreground">
                    {t("{current} of {goal} cards", {
                      current: totals.reviewsToday,
                      goal: totals.dailyGoal,
                    })}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-secondary/60 px-3.5 py-3">
                  <div className="text-[10.5px] font-medium text-muted-foreground">{t("Minutes")}</div>
                  <div className="metric mt-1 text-[19px] font-semibold">{Math.round(totals.minutesToday)}</div>
                </div>
                <div className="rounded-xl bg-secondary/60 px-3.5 py-3">
                  <div className="text-[10.5px] font-medium text-muted-foreground">{t("Study sets")}</div>
                  <div className="metric mt-1 text-[19px] font-semibold">{totals.sets}</div>
                </div>
              </div>

              <Button
                variant="outline"
                className="mt-4 w-full justify-between"
                onClick={() => navigate("/statistics")}
              >
                {t("View your progress")}
                <ArrowRight className="size-3.5" />
              </Button>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card className="p-6">
              <div className="mb-3 flex items-end justify-between gap-4">
                <div>
                  <div className="eyebrow">{t("Recently opened")}</div>
                  <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Study sets")}</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/sets")}>
                  {t("Library")} <ArrowRight className="size-3.5" />
                </Button>
              </div>
              {data.recentSets.length === 0 && (
                <p className="rounded-xl bg-secondary/50 py-8 text-center text-[12px] text-muted-foreground">
                  {t("Nothing studied yet.")}
                </p>
              )}
              <div className="space-y-1">
                {data.recentSets.map((set) => (
                  <Link
                    key={set.id}
                    to={`/sets/${set.id}`}
                    className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-secondary/60"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-primary-soft group-hover:text-primary">
                      <Layers className="size-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="truncate text-[13px] font-medium transition-colors group-hover:text-primary">
                          {set.title}
                        </span>
                        <span className="shrink-0 text-[10.5px] font-medium text-muted-foreground">
                          {set.masteredCount}/{set.cardCount}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress
                          value={set.cardCount ? (set.masteredCount / set.cardCount) * 100 : 0}
                          className="h-1"
                        />
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {set.cardCount ? Math.round((set.masteredCount / set.cardCount) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                    {set.dueCount > 0 && (
                      <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-medium text-primary">
                        {t("{count} due", { count: set.dueCount })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <div className="eyebrow">{t("Self-assessment")}</div>
              <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Recent tests")}</h2>
              {data.recentTests.length === 0 && (
                <p className="mt-4 rounded-xl bg-secondary/50 py-8 text-center text-[12px] text-muted-foreground">
                  {t("No test results yet.")}
                </p>
              )}
              <div className="mt-3 space-y-1">
                {data.recentTests.map((test) => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium">
                        {test.setTitle ?? t("Study set")}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                        {new Date(test.createdAt).toLocaleDateString(locale)}
                      </div>
                    </div>
                    <span
                      className={`metric shrink-0 text-[15px] font-semibold ${
                        test.score >= 80
                          ? "text-success"
                          : test.score >= 50
                            ? "text-warning"
                            : "text-destructive"
                      }`}
                    >
                      {Math.round(test.score)}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
