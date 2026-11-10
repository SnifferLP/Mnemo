import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  ListChecks,
  RotateCcw,
  Settings2,
  Timer,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type {
  StudySetDetail,
  TestAnswer,
  TestConfig,
  TestOutcome,
  TestQuestion,
  TestResultSummary,
} from "@/lib/types";
import { cn, errorMessage, formatClock } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { StudyShell } from "@/components/study/StudyShell";
import { ErrorPanel, LoadingPanel } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label, Progress, Slider } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ring } from "@/components/charts";

const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple choice", hint: "Pick one of four options" },
  { value: "true_false", label: "True or false", hint: "Judge a pairing" },
  { value: "free_text", label: "Free text", hint: "Type the answer" },
  { value: "fill_blank", label: "Fill in the blanks", hint: "Complete the sentence" },
  { value: "matching", label: "Matching", hint: "Connect up to four pairs" },
];

const KIND_LABEL: Record<string, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  free_text: "Free text",
  fill_blank: "Fill in the blank",
  matching: "Matching",
};

export function TestPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [detail, setDetail] = useState<StudySetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"config" | "running" | "results">("config");
  const [config, setConfig] = useState<TestConfig>({
    questionTypes: ["multiple_choice", "true_false", "free_text"],
    count: 10,
    timeLimitSeconds: null,
  });
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [minutes, setMinutes] = useState(10);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, TestAnswer>>({});
  const [index, setIndex] = useState(0);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [lastResult, setLastResult] = useState<TestResultSummary | null>(null);
  const startRef = useRef<number>(Date.now());
  const submittingRef = useRef(false);
  const kindLabel = (kind: string) => t(KIND_LABEL[kind] ?? kind);

  const load = useCallback(async () => {
    try {
      const data = await api.sets.get(id);
      setDetail(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    if (config.questionTypes.length === 0) {
      toast.error(t("Select at least one question type"));
      return;
    }
    setLoading(true);
    try {
      const generated = await api.learning.generateTest(id, {
        ...config,
        timeLimitSeconds: timeEnabled ? minutes * 60 : null,
      });
      setQuestions(generated);
      setAnswers({});
      setIndex(0);
      setOutcome(null);
      setPhase("running");
      startRef.current = Date.now();
      setRemaining(timeEnabled ? minutes * 60 : 0);
    } catch (err) {
      toast.error(t("Could not build the test"), { description: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const payload: TestAnswer[] = questions.map((question) => ({
      ...answers[question.id],
      questionId: question.id,
    }));
    const seconds = Math.round((Date.now() - startRef.current) / 1000);
    try {
      const result = await api.learning.submitTest(id, questions, payload, seconds);
      setOutcome(result);
      setPhase("results");
      setLastResult({
        id: result.id,
        setId: id,
        setTitle: detail?.set.title ?? null,
        score: result.score,
        total: result.total,
        durationSeconds: seconds,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(t("Could not submit the test"), { description: errorMessage(err) });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [answers, detail?.set.title, id, questions]);

  useEffect(() => {
    const limit = timeEnabled ? minutes * 60 : null;
    if (phase !== "running" || !limit) return;
    const tick = () => {
      const left = limit - Math.round((Date.now() - startRef.current) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) void submit();
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [phase, timeEnabled, minutes, submit]);

  const current = questions[index];
  const answeredCount = questions.filter((question) => {
    const answer = answers[question.id];
    if (!answer) return false;
    if (question.kind === "matching") return (answer.mapping?.length ?? 0) > 0;
    if (answer.optionIndex != null) return true;
    return Boolean(answer.text?.trim());
  }).length;

  if (loading && !detail) {
    return (
      <StudyShell title={t("Practice test")} onExit={() => navigate(`/sets/${id}`)}>
        <LoadingPanel label={t("Preparing your test")} />
      </StudyShell>
    );
  }

  if (error || !detail) {
    return (
      <StudyShell title={t("Practice test")} onExit={() => navigate("/sets")}>
        <ErrorPanel message={error ?? t("Study set not found")} onRetry={() => void load()} />
      </StudyShell>
    );
  }

  if (phase === "config") {
    return (
      <StudyShell
        title={detail.set.title}
        subtitle={t("Practice test")}
        onExit={() => navigate(`/sets/${id}`)}
      >
        <div className="mx-auto max-w-2xl space-y-4">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <ListChecks className="size-5 text-primary" />
              <h2 className="text-[17px] font-semibold">{t("Build your test")}</h2>
            </div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {t("Questions are generated from this set's cards. Answers are graded in Rust.")}
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <Label>{t("Question types")}</Label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {QUESTION_TYPES.map((type) => {
                    const active = config.questionTypes.includes(type.value);
                    return (
                      <label
                        key={type.value}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                          active ? "border-primary/40 bg-primary/[0.06]" : "border-border hover:bg-accent/40",
                        )}
                      >
                        <Checkbox
                          checked={active}
                          onCheckedChange={(checked) =>
                            setConfig((prev) => ({
                              ...prev,
                              questionTypes: checked
                                ? [...prev.questionTypes, type.value]
                                : prev.questionTypes.filter((value) => value !== type.value),
                            }))
                          }
                          className="mt-0.5"
                        />
                        <div>
                          <div className="text-[13px] font-medium">{t(type.label)}</div>
                          <div className="text-[11.5px] text-muted-foreground">{t(type.hint)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>{t("Number of questions")}</Label>
                  <Badge variant="secondary">{config.count}</Badge>
                </div>
                <Slider
                  value={[config.count]}
                  min={5}
                  max={40}
                  step={5}
                  onValueChange={([value]) => setConfig((prev) => ({ ...prev, count: value }))}
                  className="mt-3"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Timer className="size-4 text-muted-foreground" />
                    <div>
                      <div className="text-[13px] font-medium">{t("Time limit")}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {t("Auto-submits when the timer runs out")}
                      </div>
                    </div>
                  </div>
                  <Switch checked={timeEnabled} onCheckedChange={setTimeEnabled} />
                </div>
                {timeEnabled && (
                  <div className="flex items-center gap-2 animate-fade-in">
                    <Input
                      type="number"
                      min={1}
                      max={120}
                      value={minutes}
                      onChange={(event) => setMinutes(Math.max(1, Math.min(120, Number(event.target.value) || 1)))}
                      className="w-24"
                    />
                    <span className="text-[12.5px] text-muted-foreground">{t("minutes")}</span>
                  </div>
                )}
              </div>
            </div>

            <Button className="mt-6 w-full" size="lg" onClick={() => void start()} disabled={loading}>
              {loading ? t("Generating…") : t("Start test")}
            </Button>
          </Card>

          <p className="text-center text-[11.5px] text-muted-foreground">
            {t("{count} cards available · tests are saved to your statistics", {
              count: detail.cards.length,
            })}
          </p>
        </div>
      </StudyShell>
    );
  }

  if (phase === "results" && outcome) {
    const correct = outcome.questions.filter((question) => question.correct).length;
    return (
      <StudyShell
        title={detail.set.title}
        subtitle={t("Test results")}
        onExit={() => navigate(`/sets/${id}`)}
      >
        <div className="mx-auto max-w-3xl space-y-5">
          <Card className="p-6">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <Ring value={outcome.score} size={140} stroke={11}>
                <span className="text-[26px] font-semibold tabular-nums">{Math.round(outcome.score)}%</span>
                <span className="text-[11px] text-muted-foreground">{t("score")}</span>
              </Ring>
              <div className="flex-1 text-center sm:text-left">
                <h2 className="text-xl font-semibold">
                  {t(
                    outcome.score >= 90
                      ? "Outstanding"
                      : outcome.score >= 70
                        ? "Solid work"
                        : outcome.score >= 50
                          ? "Good progress"
                          : "Keep going",
                  )}
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {t("{correct} of {total} questions fully correct", {
                    correct,
                    total: outcome.total,
                  })}
                  {outcome.partial > 0
                    ? ` · ${t("{count} partially correct", { count: outcome.partial })}`
                    : ""}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Badge variant="success">{t("{count} correct", { count: outcome.correct })}</Badge>
                  {outcome.partial > 0 && (
                    <Badge variant="warning">{t("{count} partial", { count: outcome.partial })}</Badge>
                  )}
                  <Badge variant="destructive">
                    {t("{count} incorrect", { count: outcome.incorrect })}
                  </Badge>
                  {lastResult && <Badge variant="outline">{formatClock(lastResult.durationSeconds)}</Badge>}
                </div>
              </div>
            </div>
          </Card>

          <div className="space-y-2">
            {outcome.questions.map((question, position) => (
              <Card key={question.questionId} className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                      question.correct
                        ? "bg-success/15 text-success"
                        : question.partial
                          ? "bg-warning/15 text-warning"
                          : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {position + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{kindLabel(question.kind)}</Badge>
                      {question.correct ? (
                        <span className="flex items-center gap-1 text-[11.5px] text-success">
                          <CheckCircle2 className="size-3.5" /> {t("Correct")}
                        </span>
                      ) : question.partial ? (
                        <span className="text-[11.5px] text-warning">{t("Partial")}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11.5px] text-destructive">
                          <XCircle className="size-3.5" /> {t("Incorrect")}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[13.5px] font-medium">{question.prompt}</p>
                    <div className="mt-2 space-y-1 text-[12.5px]">
                      <div>
                        <span className="text-muted-foreground">{t("Your answer:")} </span>
                        <span className={question.correct ? "text-success" : "text-destructive"}>
                          {question.userAnswer}
                        </span>
                      </div>
                      {!question.correct && (
                        <div>
                          <span className="text-muted-foreground">{t("Correct:")} </span>
                          <span className="text-success">{question.correctAnswer}</span>
                        </div>
                      )}
                      {question.explanation && (
                        <div className="mt-1 text-muted-foreground">{question.explanation}</div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2 pb-6">
            <Button variant="outline" onClick={() => navigate(`/sets/${id}`)}>
              {t("Back to set")}
            </Button>
            <Button variant="outline" onClick={() => setPhase("config")}>
              <Settings2 /> {t("Change settings")}
            </Button>
            <Button onClick={() => void start()}>
              <RotateCcw /> {t("Retake test")}
            </Button>
          </div>
        </div>
      </StudyShell>
    );
  }

  if (!current) return null;

  const answer = answers[current.id] ?? { questionId: current.id };
  const setAnswer = (patch: Partial<TestAnswer>) =>
    setAnswers((prev) => ({ ...prev, [current.id]: { ...answer, ...patch, questionId: current.id } }));

  return (
    <StudyShell
      title={detail.set.title}
      subtitle={`${t("Practice test")} · ${kindLabel(current.kind)}`}
      onExit={() => {
        if (window.confirm(t("Leave the test? Answers will be lost."))) navigate(`/sets/${id}`);
      }}
      right={
        <>
          {timeEnabled && (
            <Badge variant={remaining < 60 ? "destructive" : "outline"} className="gap-1.5">
              <Clock className="size-3" /> {formatClock(remaining)}
            </Badge>
          )}
          <Badge variant="secondary">
            {index + 1} / {questions.length}
          </Badge>
        </>
      }
    >
      <div className="mx-auto max-w-2xl">
        <Progress value={((index + 1) / questions.length) * 100} className="mb-6" />

        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="outline">{kindLabel(current.kind)}</Badge>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {t("{answered}/{total} answered", {
                answered: answeredCount,
                total: questions.length,
              })}
            </span>
          </div>

          <p className="whitespace-pre-wrap text-[17px] font-medium leading-snug">{current.prompt}</p>

          <div className="mt-5 space-y-2">
            {(current.kind === "multiple_choice" || current.kind === "true_false") &&
              current.options.map((option, optionIndex) => {
                const active = answer.optionIndex === optionIndex;
                return (
                  <button
                    key={optionIndex}
                    onClick={() => setAnswer({ optionIndex })}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[13.5px] transition-colors",
                      active
                        ? "border-primary/50 bg-primary/[0.08] text-foreground"
                        : "border-border hover:border-primary/30 hover:bg-accent/40",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                        active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span className="flex-1">{option}</span>
                    {active && <Check className="size-4 text-primary" />}
                  </button>
                );
              })}

            {(current.kind === "free_text" || current.kind === "fill_blank") && (
              <div className="space-y-2">
                <Label>{t("Your answer")}</Label>
                <Input
                  autoFocus
                  value={answer.text ?? ""}
                  onChange={(event) => setAnswer({ text: event.target.value })}
                  placeholder={t(
                    current.kind === "fill_blank" ? "Fill in the missing word" : "Type your answer",
                  )}
                  className="h-11 text-[14px]"
                />
                <p className="text-[11.5px] text-muted-foreground">
                  {t("Typos within your tolerance setting are accepted.")}
                </p>
              </div>
            )}

            {current.kind === "matching" && (
              <div className="space-y-2">
                {current.pairs.map((pair, pairIndex) => {
                  const mapping = answer.mapping ?? Array(current.pairs.length).fill(-1);
                  return (
                    <div key={pairIndex} className="grid items-center gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px]">
                        {pair.left}
                      </div>
                      <Select
                        value={mapping[pairIndex] >= 0 ? String(mapping[pairIndex]) : "unset"}
                        onValueChange={(value) => {
                          const next = [...mapping];
                          next[pairIndex] = Number(value);
                          setAnswer({ mapping: next });
                        }}
                      >
                        <SelectTrigger className="h-9 text-[13px]">
                          <SelectValue placeholder={t("Choose definition")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unset">{t("Not answered")}</SelectItem>
                          {current.options.map((option, optionIndex) => (
                            <SelectItem key={optionIndex} value={String(optionIndex)}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        <div className="mt-5 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
          >
            <ArrowLeft /> {t("Previous")}
          </Button>

          <div className="flex gap-1.5">
            {questions.map((question, position) => (
              <button
                key={question.id}
                onClick={() => setIndex(position)}
                className={cn(
                  "size-2 rounded-full transition-colors",
                  position === index
                    ? "bg-primary"
                    : answers[question.id]
                      ? "bg-primary/40"
                      : "bg-muted-foreground/25",
                )}
                aria-label={t("Question {number}", { number: position + 1 })}
              />
            ))}
          </div>

          {index + 1 < questions.length ? (
            <Button onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}>
              {t("Next")} <ArrowRight />
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? t("Grading…") : t("Submit test")}
            </Button>
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => void submit()} disabled={submitting}>
            {t("Finish early")}
          </Button>
        </div>
      </div>
    </StudyShell>
  );
}
