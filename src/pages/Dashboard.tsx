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
import { Progress, Skeleton } from "@/components/ui/misc";

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
          <div className="flex items-center gap-2.5">
            <span className="h-px w-7 bg-primary" />
            <span className="eyebrow">{today}</span>
          </div>
          <h1 className="display mt-3 text-[42px] leading-[1.02] text-foreground">
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
        <div className="flex shrink-0 items-center gap-2 pb-0.5">
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
        <div className="grid gap-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[92px]" />
          ))}
        </div>
      )}

      {data && totals && totals.sets === 0 && (
        <EmptyState
          icon={Brain}
          title={t("Your library is empty")}
          description={t(
            "Create a study set or import your notes to start learning. Reviews, sessions and progress stay at zero until you add cards.",
          )}
          action={
            <div className="flex gap-2">
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

      {data && totals && totals.sets > 0 && (
        <div>
          <section className="grid gap-x-10 gap-y-6 border-y border-border py-6 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Ready to review")}</span>
                <CalendarCheck className="size-3.5 text-primary" strokeWidth={1.75} />
              </div>
              <div className="mt-1.5 flex items-end gap-2">
                <span className="metric font-display text-[54px] leading-[0.9] text-foreground">
                  {totals.dueToday}
                </span>
                <span className="pb-1.5 text-[11.5px] text-muted-foreground">
                  {t(totals.dueToday === 1 ? "card due" : "cards due")}
                </span>
              </div>
              <Button
                size="sm"
                className="mt-4"
                onClick={() =>
                  nextSet ? navigate(`/sets/${nextSet.id}/study/adaptive`) : navigate("/sets")
                }
              >
                <Play /> {t(nextSet ? "Continue studying" : "Choose a set")}
              </Button>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Today")}</span>
                <Target className="size-3.5 text-muted-foreground/60" strokeWidth={1.75} />
              </div>
              <div className="metric mt-2 text-[30px] font-medium leading-none">
                {totals.reviewsToday}
                <span className="text-[16px] font-normal text-muted-foreground"> / {totals.dailyGoal}</span>
              </div>
              <Progress value={totals.goalProgress} className="mt-3 h-[2px] rounded-none" indicatorClassName="rounded-none" />
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("{percent}% of your daily reviews", { percent: Math.round(totals.goalProgress) })}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Streak")}</span>
                <Flame className="size-3.5 text-warning" strokeWidth={1.75} />
              </div>
              <div className="metric mt-2 text-[30px] font-medium leading-none">
                {totals.streakDays}
                <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                  {t(totals.streakDays === 1 ? "day" : "days")}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t(totals.streakDays > 0 ? "Keep it alive today." : "Study once to begin.")}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="eyebrow">{t("Accuracy · 7d")}</span>
                <TrendingUp className="size-3.5 text-success" strokeWidth={1.75} />
              </div>
              <div className="metric mt-2 text-[30px] font-medium leading-none">
                {totals.reviews7d > 0 ? pct(totals.accuracy7d, 1) : "—"}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("{reviews} reviews · {minutes} min", {
                  reviews: totals.reviews7d,
                  minutes: Math.round(totals.studyMinutes7d),
                })}
              </p>
            </div>
          </section>

          <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:divide-x lg:divide-border">
            <section className="min-w-0 lg:pr-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="eyebrow">{t("The last two weeks")}</div>
                  <h2 className="display mt-1.5 text-[24px] leading-tight">{t("Learning activity")}</h2>
                </div>
                <Link
                  to="/statistics"
                  className="group flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("Full statistics")}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <div className="mt-6">
                <ActivityChart data={data.activity} height={158} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
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
            </section>

            <section className="lg:pl-10">
              <div className="eyebrow">{t("Daily goal")}</div>
              <div className="mt-4 flex items-center gap-5">
                <Ring value={totals.goalProgress} size={104} stroke={7}>
                  <span className="metric text-[21px] font-medium leading-none">
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
                  <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                    {t("{current} of {goal} cards", {
                      current: totals.reviewsToday,
                      goal: totals.dailyGoal,
                    })}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-5 border-t border-border pt-4">
                <div>
                  <div className="eyebrow">{t("Minutes")}</div>
                  <div className="metric mt-1 text-[18px] font-medium">{Math.round(totals.minutesToday)}</div>
                </div>
                <div>
                  <div className="eyebrow">{t("Study sets")}</div>
                  <div className="metric mt-1 text-[18px] font-medium">{totals.sets}</div>
                </div>
              </div>

              <Button
                variant="outline"
                className="mt-5 w-full justify-between"
                onClick={() => navigate("/statistics")}
              >
                {t("View your progress")}
                <ArrowRight className="size-3.5" />
              </Button>
            </section>
          </div>

          <section className="mt-2">
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
                  <div className="flex gap-2">
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

          <div className="mt-10 grid gap-10 border-t border-border pt-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:divide-x lg:divide-border">
            <section className="min-w-0 lg:pr-10">
              <div className="mb-1 flex items-end justify-between gap-4">
                <div>
                  <div className="eyebrow">{t("Recently opened")}</div>
                  <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Study sets")}</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/sets")}>
                  {t("Library")} <ArrowRight className="size-3.5" />
                </Button>
              </div>
              <div className="divide-y divide-border">
                {data.recentSets.length === 0 && (
                  <p className="py-8 text-center text-[12px] text-muted-foreground">
                    {t("Nothing studied yet.")}
                  </p>
                )}
                {data.recentSets.map((set) => (
                  <Link
                    key={set.id}
                    to={`/sets/${set.id}`}
                    className="group flex items-center gap-3 py-3.5 transition-colors"
                  >
                    <Layers className="size-3.5 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="truncate text-[13px] font-medium transition-colors group-hover:text-primary">
                          {set.title}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                          {set.masteredCount}/{set.cardCount}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Progress
                          value={set.cardCount ? (set.masteredCount / set.cardCount) * 100 : 0}
                          className="h-[2px] rounded-none"
                          indicatorClassName="rounded-none"
                        />
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {set.cardCount ? Math.round((set.masteredCount / set.cardCount) * 100) : 0}%
                        </span>
                      </div>
                    </div>
                    {set.dueCount > 0 && (
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-primary">
                        {t("{count} due", { count: set.dueCount })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </section>

            <section className="lg:pl-10">
              <div className="eyebrow">{t("Self-assessment")}</div>
              <h2 className="display mt-1.5 text-[22px] leading-tight">{t("Recent tests")}</h2>
              <div className="mt-4 divide-y divide-border border-t border-border">
                {data.recentTests.length === 0 && (
                  <p className="py-8 text-center text-[12px] text-muted-foreground">
                    {t("No test results yet.")}
                  </p>
                )}
                {data.recentTests.map((test) => (
                  <div key={test.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium">
                        {test.setTitle ?? t("Study set")}
                      </div>
                      <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
                        {new Date(test.createdAt).toLocaleDateString(locale)}
                      </div>
                    </div>
                    <span
                      className={`metric shrink-0 text-[15px] font-medium ${
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
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
