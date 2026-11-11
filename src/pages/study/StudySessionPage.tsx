import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Lightbulb,
  RotateCcw,
  Shuffle,
  Sparkles,
  Volume2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import {
  pendingCards,
  tallyOutcomes,
  uniqueCards,
  type ReviewOutcome,
} from "@/lib/session";
import type { AnswerFeedback, StudyCard, StudySetDetail } from "@/lib/types";
import { cn, errorMessage, formatClock, pct, shuffleArray } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSettings } from "@/context/SettingsContext";
import { Markdown } from "@/components/Markdown";
import { StudyResults, StudyShell } from "@/components/study/StudyShell";
import { ErrorPanel, Kbd, LoadingPanel } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";

type Mode = "flashcards" | "spaced" | "adaptive" | "write";

interface Summary {
  tally: ReturnType<typeof tallyOutcomes>;
  seconds: number;
}

export function StudySessionPage() {
  const { id = "", mode: rawMode = "flashcards" } = useParams();
  const mode = (["flashcards", "spaced", "adaptive", "write"].includes(rawMode)
    ? rawMode
    : "flashcards") as Mode;
  const navigate = useNavigate();
  const { t } = useI18n();
  const { settings } = useSettings();
  const modeName = t(
    mode === "flashcards"
      ? "Flashcards"
      : mode === "adaptive"
        ? "Adaptive learning"
        : mode === "write"
          ? "Writing"
          : "Spaced repetition",
  );

  const [detail, setDetail] = useState<StudySetDetail | null>(null);
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [checking, setChecking] = useState(false);

  const [outcomes, setOutcomes] = useState<Record<string, ReviewOutcome>>({});
  const [round, setRound] = useState(1);
  const [nextQueue, setNextQueue] = useState<StudyCard[] | null>(null);

  const sessionRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const startedRef = useRef(Date.now());
  const outcomesRef = useRef<Record<string, ReviewOutcome>>({});

  const isRecall = mode === "adaptive" || mode === "write";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.sets.get(id);
      setDetail(data);
      const cards = uniqueCards(await api.learning.queue(id, mode, 0));
      setQueue(mode === "flashcards" && settings.shuffleCards ? shuffleArray(cards) : cards);
      startedRef.current = Date.now();
      finishedRef.current = false;
      outcomesRef.current = {};
      setOutcomes({});
      setRound(1);
      setNextQueue(null);
      setSummary(null);
      setIndex(0);
      setFlipped(false);
      setHintShown(false);
      setAnswer("");
      setFeedback(null);
      const sessionId = await api.learning.startSession(id, mode);
      sessionRef.current = sessionId;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id, mode, settings.shuffleCards]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (summary) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [summary]);

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const seconds = Math.round((Date.now() - startedRef.current) / 1000);
    const tally = tallyOutcomes(Object.keys(outcomesRef.current), outcomesRef.current);
    setNextQueue(null);
    setSummary({ tally, seconds });
    if (sessionRef.current) {
      try {
        await api.learning.finishSession(
          sessionRef.current,
          tally.studied,
          tally.correct,
          tally.incorrect,
          seconds,
        );
      } catch {
        /* session timing is best effort */
      }
      sessionRef.current = null;
    }
  }, []);

  const record = useCallback(
    async (outcome: ReviewOutcome) => {
      const card = queue[index];
      if (!card) return;
      outcomesRef.current = { ...outcomesRef.current, [card.card.id]: outcome };
      setOutcomes(outcomesRef.current);
      try {
        await api.learning.review(card.card.id, outcome, mode, 0);
      } catch {
        /* progress sync is best effort; the session summary still shows */
      }
    },
    [index, mode, queue],
  );

  const advance = useCallback(() => {
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      setFlipped(false);
      setHintShown(false);
      setAnswer("");
      setFeedback(null);
      return;
    }

    // Only cards whose latest answer is not correct come back for another
    // round. Duplicates are collapsed by pendingCards.
    const pending = pendingCards(queue, outcomesRef.current);
    if (pending.length === 0) {
      void finish();
      return;
    }
    setNextQueue(pending);
  }, [finish, index, queue, queue.length]);

  const startNextRound = () => {
    if (!nextQueue) return;
    setQueue(nextQueue);
    setNextQueue(null);
    setRound((value) => value + 1);
    setIndex(0);
    setFlipped(false);
    setHintShown(false);
    setAnswer("");
    setFeedback(null);
  };

  const current = queue[index];
  const tally = useMemo(
    () => tallyOutcomes(Object.keys(outcomes), outcomes),
    [outcomes],
  );

  useEffect(() => {
    if (isRecall || summary || nextQueue) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.code === "Space") {
        event.preventDefault();
        setFlipped((value) => !value);
      } else if (event.key === "ArrowRight") {
        setFlipped(false);
        setHintShown(false);
        setIndex((value) => Math.min(value + 1, queue.length - 1));
      } else if (event.key === "ArrowLeft") {
        setFlipped(false);
        setHintShown(false);
        setIndex((value) => Math.max(value - 1, 0));
      } else if (event.key === "1") {
        void record("incorrect").then(() => {
          advance();
        });
      } else if (event.key === "2") {
        void record("correct").then(() => {
          advance();
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advance, isRecall, nextQueue, queue.length, record, summary]);

  const checkAnswer = async () => {
    if (!current || !answer.trim()) return;
    setChecking(true);
    try {
      const result = await api.learning.checkAnswer(
        current.card.id,
        answer,
        mode === "write" ? settings.aiGradingEnabled : false,
      );
      setFeedback(result);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const computedOutcome = useMemo<"correct" | "partial" | "incorrect">(() => {
    if (!feedback) return "incorrect";
    if (feedback.correct) return "correct";
    if (feedback.partial) return "partial";
    return "incorrect";
  }, [feedback]);

  const submitRecall = async (outcome?: "correct" | "partial" | "incorrect") => {
    await record(outcome ?? computedOutcome);
    setFeedback(null);
    advance();
  };

  if (loading) {
    return (
      <StudyShell title={t("Preparing session")} onExit={() => navigate(`/sets/${id}`)}>
        <LoadingPanel label={t("Shuffling your cards")} />
      </StudyShell>
    );
  }

  if (error || !detail) {
    return (
      <StudyShell title={t("Session unavailable")} onExit={() => navigate("/sets")}>
        <ErrorPanel message={error ?? t("Study set not found")} onRetry={() => void load()} />
      </StudyShell>
    );
  }

  if (queue.length === 0) {
    return (
      <StudyShell
        title={detail.set.title}
        subtitle={modeName}
        onExit={() => navigate(`/sets/${id}`)}
      >
        <Card className="mx-auto max-w-lg p-8 text-center">
          <Clock className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">
            {t(mode === "spaced" ? "Nothing is due right now" : "This set has no cards yet")}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {t(
              mode === "spaced"
                ? "Your spaced repetition schedule is clear. Come back later, or study ahead with flashcards."
                : "Add cards to this set before starting a study session.",
            )}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/sets/${id}/edit`)}>
              {t("Open editor")}
            </Button>
            <Button onClick={() => navigate(`/sets/${id}/study/flashcards`)}>
              {t("Study all cards")}
            </Button>
          </div>
        </Card>
      </StudyShell>
    );
  }

  if (nextQueue) {
    const remaining = nextQueue.length;
    return (
      <StudyShell
        title={detail.set.title}
        subtitle={`${modeName} · ${t("round {round} complete", { round })}`}
        onExit={() => navigate(`/sets/${id}`)}
      >
        <Card className="mx-auto max-w-lg p-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <h2 className="mt-3 text-lg font-semibold">
            {t("Round {round} complete", { round })}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {t(
              remaining === 1
                ? "1 card still needs another look. Cards you answered correctly are finished for this session."
                : "{count} cards still need another look. Cards you answered correctly are finished for this session.",
              { count: remaining },
            )}
          </p>
          <div className="mt-3 text-[12px] text-muted-foreground">
            {t("{correct} correct · {review} to review · {time}", {
              correct: tally.correct,
              review: tally.incorrect + tally.partial,
              time: formatClock(elapsed),
            })}
          </div>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" onClick={() => void finish()}>
              {t("Finish session")}
            </Button>
            <Button onClick={startNextRound}>
              <RotateCcw /> {t("Review {count} cards", { count: remaining })}
            </Button>
          </div>
        </Card>
      </StudyShell>
    );
  }

  if (summary) {
    return (
      <StudyShell
        title={detail.set.title}
        subtitle={`${modeName} · ${t("finished")}`}
        onExit={() => navigate(`/sets/${id}`)}
      >
        <StudyResults
          title={t("{count} cards reviewed", { count: summary.tally.studied })}
          description={`${modeName} · ${t(round === 1 ? "{count} round" : "{count} rounds", { count: round })} · ${formatClock(summary.seconds)}`}
          accuracy={summary.tally.accuracy}
          metrics={[
            { label: t("Correct"), value: summary.tally.correct },
            { label: t("Needs work"), value: summary.tally.incorrect + summary.tally.partial },
            { label: t("Time"), value: formatClock(summary.seconds) },
          ]}
          actions={
            <>
              <Button variant="outline" onClick={() => navigate(`/sets/${id}`)}>
                {t("Back to set")}
              </Button>
              <Button onClick={() => void load()}>
                <RotateCcw /> {t("Study again")}
              </Button>
            </>
          }
        />
      </StudyShell>
    );
  }

  const progress = ((index + 1) / queue.length) * 100;
  const right = (
    <>
      <Badge variant="outline" className="gap-1.5">
        <Clock className="size-3" /> {formatClock(elapsed)}
      </Badge>
      <Badge variant="secondary">
        {index + 1} / {queue.length}
      </Badge>
    </>
  );

  return (
    <StudyShell
      title={detail.set.title}
      subtitle={modeName}
      onExit={() => navigate(`/sets/${id}`)}
      right={right}
    >
      <div className="mb-5">
        <Progress value={progress} />
        <div className="mt-2 flex items-center justify-between text-[11.5px] text-muted-foreground">
          <span>
            {t("{correct} correct · {review} to review", {
              correct: tally.correct,
              review: tally.incorrect + tally.partial,
            })}
          </span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>

      {!isRecall && current && (
        <>
          <div className="[perspective:1800px]">
            <button
              onClick={() => setFlipped((value) => !value)}
              className="relative block h-[360px] w-full text-left outline-none"
            >
              <div className={cn("card-3d relative h-full w-full", flipped && "flipped")}>
                <div className="card-face absolute inset-0 flex flex-col rounded-2xl bg-card p-7 shadow-soft">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {t("Front")}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {t("{count} chars", { count: current.card.front.length })}
                    </span>
                  </div>
                  <div className="flex flex-1 items-center justify-center overflow-y-auto px-2">
                    <Markdown className="display text-center text-[28px] leading-snug">
                      {current.card.front}
                    </Markdown>
                  </div>
                  <div className="mt-auto flex items-center justify-center text-[11px] text-muted-foreground">
                    {t("Click or press")} <Kbd>Space</Kbd> {t("to flip")}
                  </div>
                </div>

                <div className="card-face card-face-back absolute inset-0 flex flex-col rounded-2xl bg-card p-7 shadow-lift ring-1 ring-primary/20">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                      {t("Back")}
                    </span>
                    {current.card.audioPath && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          void new Audio(convertFileSrc(current.card.audioPath!)).play();
                        }}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/10"
                      >
                        <Volume2 className="size-3.5" /> {t("Play")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-2">
                    <Markdown className="display text-center text-[24px] leading-snug">{current.card.back}</Markdown>
                    {current.card.imagePath && (
                      <img
                        src={convertFileSrc(current.card.imagePath)}
                        alt=""
                        className="max-h-[110px] rounded-xl object-contain"
                      />
                    )}
                    {current.card.explanation && (
                      <div className="w-full rounded-xl bg-secondary/60 p-4 text-left">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("Explanation")}
                        </div>
                        <Markdown className="text-[13px]">{current.card.explanation}</Markdown>
                      </div>
                    )}
                  </div>
                  <div className="mt-auto text-center text-[11px] text-muted-foreground">
                    {t("Mark yourself below")}
                  </div>
                </div>
              </div>
            </button>
          </div>

          {hintShown ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-warning/10 p-4 text-[13px]">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-warning">
                  {t("Hint")}
                </div>
                <div>{current.card.hint || t("No hint was added to this card.")}</div>
              </div>
            </div>
          ) : (
            current.card.hint && (
              <button
                onClick={() => setHintShown(true)}
                className="mt-4 flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Lightbulb className="size-3.5" /> Show hint
              </button>
            )
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setFlipped(false);
                  setHintShown(false);
                  setIndex((value) => Math.max(value - 1, 0));
                }}
                disabled={index === 0}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setQueue(shuffleArray(queue));
                  setIndex(0);
                  setFlipped(false);
                  toast.success(t("Cards shuffled"));
                }}
              >
                <Shuffle /> {t("Shuffle")}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="bg-destructive/[0.07] text-destructive hover:bg-destructive/12"
                onClick={() => void record("incorrect").then(advance)}
              >
                <X /> {t("Still learning")} <Kbd>1</Kbd>
              </Button>
              <Button
                variant="outline"
                className="bg-success/[0.08] text-success hover:bg-success/14"
                onClick={() => void record("correct").then(advance)}
              >
                <Check /> {t("I knew it")} <Kbd>2</Kbd>
              </Button>
              <Button
                onClick={() => {
                  setFlipped(false);
                  setHintShown(false);
                  setIndex((value) => Math.min(value + 1, queue.length - 1));
                }}
              >
                {t("Next")} <ArrowRight />
              </Button>
            </div>
          </div>
        </>
      )}

      {isRecall && current && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t(mode === "adaptive" ? "Question" : "Write the answer")}
            </div>
            <Markdown className="text-[21px] font-medium leading-snug">{current.card.front}</Markdown>
            {current.card.imagePath && (
              <img
                src={convertFileSrc(current.card.imagePath)}
                alt=""
                className="mt-3 max-h-40 rounded-xl object-contain"
              />
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Input
                autoFocus
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !feedback) void checkAnswer();
                  if (event.key === "Enter" && feedback && mode === "write") void submitRecall();
                }}
                placeholder={t("Type your answer…")}
                disabled={Boolean(feedback)}
                className="h-11 text-[14px]"
              />
              {!feedback && (
                <Button className="h-11" onClick={() => void checkAnswer()} disabled={checking || !answer.trim()}>
                  <Sparkles /> {checking ? t("Checking…") : t("Check")}
                </Button>
              )}
            </div>

            {current.card.hint && !feedback && (
              <button
                onClick={() => setHintShown(true)}
                className="mt-3 flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <Lightbulb className="size-3.5" /> {t("Show hint")}
              </button>
            )}
            {hintShown && !feedback && (
              <p className="mt-2 rounded-lg bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
                {current.card.hint || t("No hint was added to this card.")}
              </p>
            )}
          </Card>

          {feedback && (
            <Card
              className={cn(
                "animate-fade-in-up p-5",
                feedback.correct
                  ? "bg-success/[0.08]"
                  : feedback.partial
                    ? "bg-warning/[0.09]"
                    : "bg-destructive/[0.07]",
              )}
            >
              <div className="flex items-center gap-2">
                {feedback.correct ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : feedback.partial ? (
                  <Brain className="size-5 text-warning" />
                ) : (
                  <XCircle className="size-5 text-destructive" />
                )}
                <span className="text-[14px] font-semibold">
                  {t(
                    feedback.correct ? "Correct" : feedback.partial ? "Almost there" : "Not quite",
                  )}
                </span>
                <Badge variant="outline" className="ml-auto">
                  {t("{percent}% match", { percent: Math.round(feedback.similarity * 100) })}
                </Badge>
              </div>

              <div className="mt-3 space-y-2 text-[13.5px]">
                <div>
                  <span className="text-muted-foreground">{t("Your answer:")} </span>
                  <span className={cn(!feedback.correct && "text-destructive")}>{feedback.given || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("Correct answer:")} </span>
                  <span className="font-medium text-success">{current.card.back}</span>
                </div>
                {current.card.explanation && (
                  <div className="rounded-lg bg-secondary/60 p-3">
                    <Markdown className="text-[13px]">{current.card.explanation}</Markdown>
                  </div>
                )}
                {feedback.aiFeedback && (
                  <div className="rounded-lg bg-primary-soft p-3 text-[12.5px]">
                    <span className="font-medium text-primary">{t("AI tutor:")} </span>
                    {feedback.aiFeedback}
                  </div>
                )}
                {feedback.aiNote && (
                  <div className="text-[11.5px] text-muted-foreground">
                    {t("AI grading unavailable: {note}", { note: feedback.aiNote })}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {mode === "adaptive" ? (
                  <>
                    <span className="text-[11.5px] text-muted-foreground">{t("How did that feel?")}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-success/[0.08] text-success"
                      onClick={() => void submitRecall("correct")}
                    >
                      {t("I knew it")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void submitRecall("partial")}>
                      {t("Partly")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-destructive/[0.07] text-destructive"
                      onClick={() => void submitRecall("incorrect")}
                    >
                      {t("Missed it")}
                    </Button>
                  </>
                ) : (
                  <Button className="ml-auto" onClick={() => void submitRecall()}>
                    {t("Continue")} <ArrowRight />
                  </Button>
                )}
              </div>
            </Card>
          )}

          {!feedback && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => void submitRecall("incorrect")}>
                {t("Skip card")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 flex items-center justify-between text-[11.5px] text-muted-foreground">
        <span>
          {isRecall
            ? t("Answers are checked locally; AI grading is optional in Settings.")
            : t("Keyboard: Space to flip · 1 still learning · 2 knew it")}
        </span>
        <span>{t("{percent} session accuracy", { percent: pct(tally.accuracy) })}</span>
      </div>
    </StudyShell>
  );
}
