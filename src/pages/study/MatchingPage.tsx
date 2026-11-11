import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Award, Clock, Puzzle, RotateCcw, Trophy } from "lucide-react";

import { api } from "@/lib/api";
import type { MatchingOutcome, StudyCard, StudySetDetail } from "@/lib/types";
import { cn, formatClock, shuffleArray } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { ErrorPanel, LoadingPanel } from "@/components/common";
import { StudyShell } from "@/components/study/StudyShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ROUND_SIZE = 6;

interface Tile {
  cardId: string;
  text: string;
}

export function MatchingPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [detail, setDetail] = useState<StudySetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<Tile[]>([]);
  const [right, setRight] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string, true>>({});
  const [wrong, setWrong] = useState<{ left: string; right: string } | null>(null);
  const [outcome, setOutcome] = useState<MatchingOutcome | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pool, setPool] = useState<StudyCard[]>([]);
  const wrongTimer = useRef<number | null>(null);
  const recorded = useRef(false);

  const newRound = useCallback((cards: StudyCard[]) => {
    const usable = cards.filter((card) => card.card.front.trim() && card.card.back.trim());
    if (usable.length < 2) {
      setLeft([]);
      setRight([]);
      return;
    }
    const round = shuffleArray(usable).slice(0, Math.min(ROUND_SIZE, usable.length));
    setLeft(shuffleArray(round.map((card) => ({ cardId: card.card.id, text: card.card.front }))));
    setRight(shuffleArray(round.map((card) => ({ cardId: card.card.id, text: card.card.back }))));
    setSelected(null);
    setMatched({});
    setWrong(null);
    setOutcome(null);
    setStartedAt(null);
    setElapsed(0);
    recorded.current = false;
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api.sets.get(id);
      setDetail(data);
      setPool(data.cards);
      newRound(data.cards);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Could not load the set"));
    } finally {
      setLoading(false);
    }
  }, [id, newRound, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (startedAt === null || outcome) return;
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 100);
    return () => window.clearInterval(timer);
  }, [startedAt, outcome]);

  useEffect(() => {
    if (left.length === 0 || Object.keys(matched).length !== left.length) return;
    if (recorded.current) return;
    recorded.current = true;
    const seconds = (Date.now() - (startedAt ?? Date.now())) / 1000;
    api.learning
      .matchingResult(id, seconds, left.length)
      .then((result) => {
        setOutcome(result);
        setElapsed(result.isNewBest ? seconds : seconds);
      })
      .catch(() => {
        setOutcome({ bestSeconds: seconds, previousBest: null, isNewBest: true });
      });
  }, [matched, left.length, startedAt, id]);

  useEffect(() => {
    return () => {
      if (wrongTimer.current) window.clearTimeout(wrongTimer.current);
    };
  }, []);

  const pickLeft = (cardId: string) => {
    if (matched[cardId]) return;
    if (startedAt === null) setStartedAt(Date.now());
    setSelected(cardId);
    setWrong(null);
  };

  const pickRight = (cardId: string) => {
    if (matched[cardId] || !selected) return;
    if (startedAt === null) setStartedAt(Date.now());
    if (cardId === selected) {
      setMatched((current) => ({ ...current, [cardId]: true }));
      setSelected(null);
      setWrong(null);
    } else {
      setWrong({ left: selected, right: cardId });
      if (wrongTimer.current) window.clearTimeout(wrongTimer.current);
      wrongTimer.current = window.setTimeout(() => {
        setWrong(null);
        setSelected(null);
      }, 650);
    }
  };

  if (loading) {
    return (
      <StudyShell title={t("Matching game")} onExit={() => navigate(`/sets/${id}`)}>
        <LoadingPanel label={t("Dealing the cards")} />
      </StudyShell>
    );
  }

  if (error || !detail) {
    return (
      <StudyShell title={t("Matching game")} onExit={() => navigate("/sets")}>
        <ErrorPanel message={error ?? t("Study set not found")} onRetry={() => void load()} />
      </StudyShell>
    );
  }

  const completed = left.length > 0 && Object.keys(matched).length === left.length;

  return (
    <StudyShell
      title={detail.set.title}
      subtitle={`${t("Matching game")} · ${t("{count} pairs", { count: left.length })}`}
      onExit={() => navigate(`/sets/${id}`)}
      right={
        <>
          <Badge variant="outline" className="gap-1.5">
            <Clock className="size-3" /> {elapsed.toFixed(1)}s
          </Badge>
          <Badge variant="secondary">
            {Object.keys(matched).length} / {left.length}
          </Badge>
        </>
      }
    >
      {left.length < 2 ? (
        <Card className="mx-auto max-w-lg p-8 text-center">
          <Puzzle className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold">{t("Not enough cards")}</h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            {t("Matching needs at least two cards with a front and back.")}
          </p>
          <Button className="mt-5" onClick={() => navigate(`/sets/${id}/edit`)}>
            {t("Open editor")}
          </Button>
        </Card>
      ) : (
        <div className="mx-auto max-w-4xl">
          <p className="mb-4 text-center text-[12.5px] text-muted-foreground">
            {t("Select a term, then its definition. Correct pairs disappear.")}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              {left.map((tile) => {
                const isMatched = Boolean(matched[tile.cardId]);
                const isSelected = selected === tile.cardId;
                const isWrong = wrong?.left === tile.cardId;
                return (
                  <button
                    key={tile.cardId}
                    disabled={isMatched}
                    onClick={() => pickLeft(tile.cardId)}
                    className={cn(
                      "w-full rounded-xl px-4 py-3.5 text-left text-[13.5px] transition-all duration-200",
                      isMatched && "pointer-events-none scale-[0.98] bg-success/10 text-success/50 opacity-50",
                      isWrong && "animate-pop bg-destructive/12 text-destructive",
                      isSelected && !isMatched && "bg-primary-soft text-primary ring-2 ring-primary/30",
                      !isMatched && !isSelected && !isWrong && "bg-card shadow-soft hover:-translate-y-0.5 hover:shadow-lift",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {isMatched && <Trophy className="size-3.5" />}
                      {tile.text}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              {right.map((tile) => {
                const isMatched = Boolean(matched[tile.cardId]);
                const isWrong = wrong?.right === tile.cardId;
                return (
                  <button
                    key={tile.cardId}
                    disabled={isMatched}
                    onClick={() => pickRight(tile.cardId)}
                    className={cn(
                      "w-full rounded-xl px-4 py-3.5 text-left text-[13.5px] transition-all duration-200",
                      isMatched && "pointer-events-none scale-[0.98] bg-success/10 text-success/50 opacity-50",
                      isWrong && "animate-pop bg-destructive/12 text-destructive",
                      !isMatched && !isWrong && "bg-card shadow-soft hover:-translate-y-0.5 hover:shadow-lift",
                    )}
                  >
                    {tile.text}
                  </button>
                );
              })}
            </div>
          </div>

          {completed && outcome && (
            <Card className="mx-auto mt-6 max-w-md animate-scale-in p-6 text-center">
              <Award className="mx-auto size-8 text-warning" />
              <h2 className="mt-2 text-lg font-semibold">
                {t(outcome.isNewBest ? "New personal best!" : "Round complete")}
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t("{count} pairs in {time} · best {best}s", {
                  count: left.length,
                  time: formatClock(elapsed),
                  best: outcome.bestSeconds.toFixed(1),
                })}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="outline" onClick={() => navigate(`/sets/${id}`)}>
                  {t("Back to set")}
                </Button>
                <Button onClick={() => newRound(pool)}>
                  <RotateCcw /> {t("Play again")}
                </Button>
              </div>
            </Card>
          )}

          <p className="mt-6 text-center text-[11.5px] text-muted-foreground">
            {t("Personal bests are stored locally for each study set.")}
          </p>
        </div>
      )}
    </StudyShell>
  );
}
