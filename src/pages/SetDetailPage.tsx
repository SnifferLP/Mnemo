import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Brain,
  CalendarClock,
  Copy,
  Download,
  Layers,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Play,
  Puzzle,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { SetStatistics, StudySetDetail } from "@/lib/types";
import { cn, errorMessage, formatDuration, formatRelative, pct } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { ActivityChart, Ring } from "@/components/charts";
import { EmptyState, ErrorPanel, LoadingPanel, PageHeader, StatCard } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label, Progress } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MODES = [
  {
    id: "flashcards",
    title: "Flashcards",
    description: "Flip through every card at your own pace.",
    icon: Layers,
    iconClass: "bg-primary-soft text-primary",
  },
  {
    id: "adaptive",
    title: "Adaptive learning",
    description: "Questions adapt to what you already know.",
    icon: Brain,
    iconClass: "bg-warning/16 text-warning",
  },
  {
    id: "write",
    title: "Writing",
    description: "Type the answer and get instant feedback.",
    icon: Pencil,
    iconClass: "bg-success/12 text-success",
  },
  {
    id: "spaced",
    title: "Spaced repetition",
    description: "Review only what is due today (SM-2).",
    icon: CalendarClock,
    iconClass: "bg-primary-soft text-primary",
  },
  {
    id: "test",
    title: "Practice test",
    description: "Mixed question types with scoring.",
    icon: ListChecks,
    iconClass: "bg-warning/16 text-warning",
  },
  {
    id: "matching",
    title: "Matching game",
    description: "Race the clock to connect pairs.",
    icon: Puzzle,
    iconClass: "bg-success/12 text-success",
  },
] as const;

const EXPORT_FORMATS = [
  { value: "csv", label: "CSV spreadsheet", ext: "csv" },
  { value: "tsv", label: "TSV (Quizlet compatible)", ext: "txt" },
  { value: "json", label: "JSON (full data)", ext: "json" },
  { value: "markdown", label: "Markdown", ext: "md" },
  { value: "pdf", label: "PDF (print friendly)", ext: "pdf" },
];

const STATE_LABEL: Record<string, { label: string; variant: "muted" | "warning" | "success" | "destructive" }> = {
  new: { label: "New", variant: "muted" },
  learning: { label: "Learning", variant: "warning" },
  relearning: { label: "Relearning", variant: "destructive" },
  review: { label: "Mature", variant: "success" },
};

export function SetDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, tp, locale } = useI18n();
  const [detail, setDetail] = useState<StudySetDetail | null>(null);
  const [stats, setStats] = useState<SetStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("json");
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detailData, statData] = await Promise.all([
        api.sets.get(id),
        api.insights.setStatistics(id),
      ]);
      setDetail(detailData);
      setStats(statData);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const mastery = detail && detail.cards.length > 0
    ? Math.round((detail.masteredCount / detail.cards.length) * 100)
    : 0;

  const filteredCards = useMemo(() => {
    if (!detail) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return detail.cards;
    return detail.cards.filter(
      (card) =>
        card.card.front.toLowerCase().includes(needle) ||
        card.card.back.toLowerCase().includes(needle),
    );
  }, [detail, search]);

  const playAudio = (path: string) => {
    const audio = new Audio(convertFileSrc(path));
    void audio.play().catch(() => toast.error(t("Could not play this recording")));
  };

  const toggleFavorite = async () => {
    if (!detail) return;
    try {
      await api.sets.favorite(detail.set.id, !detail.set.isFavorite);
      setDetail({ ...detail, set: { ...detail.set, isFavorite: !detail.set.isFavorite } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const duplicate = async () => {
    try {
      const copy = await api.sets.duplicate(id);
      toast.success(t("Study set duplicated"));
      navigate(`/sets/${copy.set.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const changeArchive = async (archived: boolean) => {
    if (!detail) return;
    try {
      await api.sets.setArchived(id, archived);
      setDetail({
        ...detail,
        set: {
          ...detail.set,
          archivedAt: archived ? new Date().toISOString() : null,
        },
      });
      toast.success(t(archived ? "Study set archived" : "Study set restored"));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    if (!detail) return;
    if (
      !window.confirm(
        tp(
          detail.cards.length,
          'Delete "{title}" with 1 card? Progress and test history for this set will be removed.',
          'Delete "{title}" with {count} cards? Progress and test history for this set will be removed.',
          { title: detail.set.title },
        ),
      )
    ) {
      return;
    }
    try {
      await api.sets.delete(id);
      toast.success(t("Study set deleted"));
      navigate("/sets");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const runExport = async () => {
    if (!detail) return;
    const format = EXPORT_FORMATS.find((item) => item.value === exportFormat);
    try {
      const target = await save({
        defaultPath: `${detail.set.title.replace(/[^\w\-. ]+/g, "_")}.${format?.ext ?? "txt"}`,
        filters: [{ name: format ? t(format.label) : t("File"), extensions: [format?.ext ?? "txt"] }],
      });
      if (!target) return;
      setExporting(true);
      await api.transfer.exportSet(id, exportFormat, target);
      toast.success(t("Export saved"), { description: target });
      setExportOpen(false);
    } catch (err) {
      toast.error(t("Export failed"), { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <LoadingPanel label={t("Loading study set")} />;
  if (error || !detail) return <ErrorPanel message={error ?? t("Study set not found")} onRetry={() => void load()} />;

  const isArchived = Boolean(detail.set.archivedAt);

  return (
    <div>
      <Link
        to={isArchived ? "/archive" : "/sets"}
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t(isArchived ? "Back to archive" : "All study sets")}
      </Link>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {detail.set.title}
            <button onClick={() => void toggleFavorite()} className="text-muted-foreground transition-colors hover:text-warning">
              <Star className={cn("size-5", detail.set.isFavorite && "fill-warning text-warning")} />
            </button>
          </span>
        }
        description={
          detail.set.description ||
          t("{count} cards · {front} → {back}", {
            count: detail.cards.length,
            front: detail.set.languageFront,
            back: detail.set.languageBack,
          })
        }
        actions={
          <>
            {isArchived ? (
              <Button onClick={() => void changeArchive(false)}>
                <ArchiveRestore /> {t("Restore")}
              </Button>
            ) : (
              <Button onClick={() => navigate(`/sets/${id}/study/flashcards`)}>
                <Play /> {t("Study")}
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate(`/sets/${id}/edit`)}>
              <Pencil /> {t("Edit")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setExportOpen(true)}>
                  <Download /> {t("Export")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void duplicate()}>
                  <Copy /> {t("Duplicate")}
                </DropdownMenuItem>
                {!isArchived && (
                  <DropdownMenuItem
                    onSelect={() => {
                      if (!window.confirm(t("Reset all progress, reviews and tests for this set?"))) return;
                      api.learning
                        .resetProgress(id)
                        .then(() => {
                          toast.success(t("Progress reset"));
                          void load();
                        })
                        .catch((err) => toast.error(errorMessage(err)));
                    }}
                  >
                    <RefreshCw /> {t("Reset progress")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {isArchived ? (
                  <DropdownMenuItem onSelect={() => void changeArchive(false)}>
                    <ArchiveRestore /> {t("Restore")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => void changeArchive(true)}>
                    <Archive /> {t("Archive")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem destructive onSelect={() => void remove()}>
                  <Trash2 /> {t("Delete set")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{t("{count} cards", { count: detail.cards.length })}</Badge>
        {isArchived && <Badge variant="warning"><Archive className="mr-1 size-3" /> {t("Archived")}</Badge>}
        {detail.folderName && <Badge variant="outline">{t("Folder")} · {detail.folderName}</Badge>}
        {detail.tags.map((tag) => (
          <Badge key={tag} variant="muted">
            #{tag}
          </Badge>
        ))}
      </div>

      <div className="mb-6 grid gap-4 stagger sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t("Mastered")}
          value={`${detail.masteredCount}/${detail.cards.length}`}
          hint={t("{percent}% of the set", { percent: mastery })}
          icon={Layers}
        />
        <StatCard
          label={t("Due for review")}
          value={detail.dueCount}
          hint={t(detail.dueCount > 0 ? "Ready when you are" : "Nothing due right now")}
          icon={CalendarClock}
          accent={detail.dueCount > 0 ? "warning" : "success"}
        />
        <StatCard
          label={t("Accuracy")}
          value={stats && stats.reviews > 0 ? pct(stats.accuracy, 1) : "—"}
          hint={stats ? t("{count} reviews", { count: stats.reviews }) : undefined}
          icon={Brain}
          accent="success"
        />
        <StatCard
          label={t("Study time")}
          value={stats ? formatDuration(stats.minutes * 60) : "—"}
          hint={
            detail.set.lastStudiedAt
              ? t("Last studied {when}", { when: formatRelative(detail.set.lastStudiedAt) })
              : t("Not studied yet")
          }
          icon={CalendarClock}
        />
      </div>

      <section className="mb-7">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">{t("Learning modes")}</div>
            <h2 className="display mt-1.5 text-[25px] leading-tight">{t("Choose how to study")}</h2>
          </div>
          {!isArchived && (
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              {t("{count} cards ready", { count: detail.cards.length })}
            </span>
          )}
        </div>

        {isArchived ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-warning/[0.09] p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning/16 text-warning">
                <Archive className="size-4" />
              </span>
              <div>
                <div className="text-[13px] font-medium">{t("This set is archived")}</div>
                <p className="mt-1 max-w-2xl text-[11.5px] leading-relaxed text-muted-foreground">
                  {t("Its cards, progress and history are preserved. Restore it to use the learning modes again.")}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => void changeArchive(false)}>
              <ArchiveRestore /> {t("Restore")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => navigate(`/sets/${id}/study/${mode.id}`)}
                  className="group flex min-h-[152px] flex-col items-start rounded-xl bg-card p-5 text-left shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <span className={cn("grid size-10 place-items-center rounded-xl", mode.iconClass)}>
                    <Icon className="size-[17px]" strokeWidth={1.75} />
                  </span>
                  <span className="mt-3 text-[14px] font-medium leading-tight">{t(mode.title)}</span>
                  <span className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                    {t(mode.description)}
                  </span>
                  <span className="mt-auto flex items-center gap-1 pt-3 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition-colors group-hover:text-foreground">
                    {t("Start")} <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
          <TabsTrigger value="cards">{t("Cards")}</TabsTrigger>
          <TabsTrigger value="stats">{t("Statistics")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t("Set progress")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-5">
                <Ring value={mastery} size={150} stroke={11}>
                  <span className="text-[27px] font-semibold tabular-nums">{mastery}%</span>
                  <span className="text-[11px] text-muted-foreground">{t("mastered")}</span>
                </Ring>
                <div className="w-full space-y-2.5">
                  {[
                    { label: "Mature", value: stats?.mastered ?? detail.masteredCount, className: "bg-success" },
                    { label: "Learning", value: stats?.learning ?? 0, className: "bg-warning" },
                    { label: "New", value: stats?.newCards ?? detail.cards.length - detail.masteredCount, className: "bg-muted-foreground/40" },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2 text-[12.5px]">
                      <span className={cn("size-2.5 rounded-full", row.className)} />
                      <span className="flex-1 text-muted-foreground">{t(row.label)}</span>
                      <span className="font-medium tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
                {stats?.matchingBest != null && (
                  <div className="w-full rounded-xl bg-secondary/60 px-3 py-2.5 text-center text-[12px] text-muted-foreground">
                    {t("Best matching time")} · <span className="font-medium text-foreground">{stats.matchingBest.toFixed(1)}s</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{t("Last 30 days")}</CardTitle>
                  {stats && (
                    <Badge variant="secondary">
                      {t("{count} reviews", { count: stats.reviews })}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  <ActivityChart data={stats?.daily ?? []} height={150} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("Recent tests")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(!stats || stats.tests.length === 0) && (
                    <p className="py-4 text-center text-[13px] text-muted-foreground">
                      {t("No practice tests taken yet.")}
                    </p>
                  )}
                  {stats?.tests.slice(0, 5).map((test) => (
                    <div key={test.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3.5 py-2.5">
                      <div className="text-[12.5px] text-muted-foreground">
                        {new Date(test.createdAt).toLocaleDateString(locale)} ·{" "}
                        {t("{count} questions", { count: test.total })}
                      </div>
                      <Badge variant={test.score >= 80 ? "success" : test.score >= 50 ? "warning" : "destructive"}>
                        {Math.round(test.score)}%
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cards">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("Search cards…")}
                className="pl-9"
              />
            </div>
            <Badge variant="outline">{t("{count} shown", { count: filteredCards.length })}</Badge>
          </div>

          {filteredCards.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={t(search ? "No cards match" : "No cards yet")}
              description={t(
                search ? "Try a different search term." : "Add your first card in the editor.",
              )}
              action={
                !search ? (
                  <Button onClick={() => navigate(`/sets/${id}/edit`)}>
                    <Pencil /> {t("Open editor")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-2">
              {filteredCards.map((card, index) => {
                const state = STATE_LABEL[card.progress.state] ?? STATE_LABEL.new;
                return (
                  <Card key={card.card.id} className="p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">
                        {index + 1}
                      </span>
                      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                        <div className="min-w-0">
                          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {t("Front")}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-[13.5px]">{card.card.front}</p>
                        </div>
                        <div className="min-w-0 border-t border-border/50 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                          <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                            {t("Back")}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-[13.5px] text-foreground/90">
                            {card.card.back}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {card.card.audioPath && (
                          <Button variant="ghost" size="icon-sm" onClick={() => playAudio(card.card.audioPath!)}>
                            <Volume2 />
                          </Button>
                        )}
                        {card.card.imagePath && (
                          <img
                            src={convertFileSrc(card.card.imagePath)}
                            alt=""
                            className="size-8 rounded-md object-cover"
                          />
                        )}
                        <Badge variant={state.variant}>{t(state.label)}</Badge>
                      </div>
                    </div>
                    {card.progress.correctCount + card.progress.wrongCount > 0 && (
                      <div className="mt-2.5 flex items-center gap-3 pl-9 text-[11px] text-muted-foreground">
                        <span>{t("{percent} mastery", { percent: pct(card.mastery * 100) })}</span>
                        <Progress value={card.mastery * 100} className="h-1 max-w-[140px]" />
                        <span>
                          {t("{correct} correct · {wrong} wrong", {
                            correct: card.progress.correctCount,
                            wrong: card.progress.wrongCount,
                          })}
                        </span>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stats">
          {!stats ? (
            <LoadingPanel />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label={t("Cards studied")} value={stats.reviews} />
                <StatCard label={t("Accuracy")} value={stats.reviews ? pct(stats.accuracy, 1) : "—"} />
                <StatCard label={t("Study time")} value={formatDuration(stats.minutes * 60)} />
                <StatCard label={t("Due now")} value={stats.due} accent={stats.due > 0 ? "warning" : "success"} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>{t("Per-card progress")}</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="pb-2 pr-3 font-medium">{t("Front")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("State")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("Mastery")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("Correct")}</th>
                        <th className="pb-2 pr-3 font-medium">{t("Wrong")}</th>
                        <th className="pb-2 font-medium">{t("Interval")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.cardsDetail.map((card) => (
                        <tr key={card.cardId} className="border-b border-border/50 last:border-0">
                          <td className="max-w-[280px] truncate py-2 pr-3">{card.front}</td>
                          <td className="py-2 pr-3">
                            <Badge variant={(STATE_LABEL[card.state] ?? STATE_LABEL.new).variant}>
                              {t((STATE_LABEL[card.state] ?? STATE_LABEL.new).label)}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{Math.round(card.mastery * 100)}%</td>
                          <td className="py-2 pr-3 tabular-nums text-success">{card.correct}</td>
                          <td className="py-2 pr-3 tabular-nums text-destructive">{card.wrong}</td>
                          <td className="py-2 tabular-nums">{card.intervalDays > 0 ? `${Math.round(card.intervalDays)}d` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Export study set")}</DialogTitle>
            <DialogDescription>
              {t("Everything is written locally — nothing is uploaded.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("Format")}</Label>
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {t(format.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11.5px] text-muted-foreground">
              {t("The PDF export is print-ready and supports Latin scripts.")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void runExport()} disabled={exporting}>
              <Download /> {exporting ? t("Exporting…") : t("Choose location")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
