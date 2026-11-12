import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronLeft, ChevronRight, Play, RotateCw, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/Markdown";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { StudyCard } from "@/lib/types";

/**
 * A real card from the set, shown before a session starts. It flips on click,
 * pages through the set and can star individual terms; it never changes the
 * stored card text.
 */
export function FlashcardPreview({
  cards,
  onStart,
  onToggleStar,
}: {
  cards: StudyCard[];
  onStart: () => void;
  onToggleStar: (cardId: string, starred: boolean) => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const lastIndex = Math.max(0, cards.length - 1);
  const safeIndex = Math.min(index, lastIndex);
  const current = cards[safeIndex];

  // Always show the front after moving to another card.
  useEffect(() => {
    setFlipped(false);
  }, [safeIndex]);

  if (!current) return null;

  const step = (offset: number) => {
    setIndex(Math.min(Math.max(safeIndex + offset, 0), lastIndex));
  };

  const star = (
    <span
      role="button"
      tabIndex={0}
      aria-pressed={current.card.isStarred}
      title={t(current.card.isStarred ? "Remove star" : "Star term")}
      onClick={(event) => {
        event.stopPropagation();
        onToggleStar(current.card.id, !current.card.isStarred);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onToggleStar(current.card.id, !current.card.isStarred);
      }}
      className={cn(
        "flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors",
        current.card.isStarred
          ? "text-warning hover:bg-warning/10"
          : "text-muted-foreground hover:bg-secondary",
      )}
    >
      <Star className={cn("size-4", current.card.isStarred && "fill-warning")} />
      {t(current.card.isStarred ? "Starred" : "Star")}
    </span>
  );

  return (
    <section className="mb-7">
      <div className="mx-auto w-full max-w-4xl">
        <div className="[perspective:2200px]">
          <button
            type="button"
            onClick={() => setFlipped((value) => !value)}
            aria-label={t("Flip card")}
            className="relative block h-[clamp(320px,52vh,520px)] w-full text-left outline-none"
          >
            <div className={cn("card-3d relative h-full w-full", flipped && "flipped")}>
              <div className="card-face absolute inset-0 flex flex-col rounded-2xl bg-card p-6 shadow-soft sm:p-9">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("Front")}
                  </span>
                  {star}
                </div>
                <div className="flex flex-1 items-center justify-center overflow-y-auto px-1 py-4">
                  <Markdown className="display text-center text-[clamp(1.35rem,2.6vw,2.2rem)] leading-snug">
                    {current.card.front}
                  </Markdown>
                </div>
                <div className="text-center text-[11px] text-muted-foreground">
                  {t("Click the card to reveal the answer")}
                </div>
              </div>

              <div className="card-face card-face-back absolute inset-0 flex flex-col rounded-2xl bg-card p-6 shadow-lift ring-1 ring-primary/20 sm:p-9">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                    {t("Back")}
                  </span>
                  {star}
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-1 py-4">
                  <Markdown className="display text-center text-[clamp(1.25rem,2.4vw,2rem)] leading-snug">
                    {current.card.back}
                  </Markdown>
                  {current.card.imagePath && (
                    <img
                      src={convertFileSrc(current.card.imagePath)}
                      alt=""
                      className="max-h-[200px] rounded-xl object-contain"
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
                <div className="text-center text-[11px] text-muted-foreground">
                  {t("Click the card to see the front again")}
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => step(-1)}
              disabled={safeIndex === 0}
              aria-label={t("Previous card")}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-[70px] text-center text-[12px] font-medium tabular-nums text-muted-foreground">
              {safeIndex + 1} / {cards.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => step(1)}
              disabled={safeIndex >= lastIndex}
              aria-label={t("Next card")}
            >
              <ChevronRight />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {current.card.isStarred && (
              <Badge variant="warning">
                <Star className="mr-1 size-3 fill-warning" /> {t("Starred")}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => setFlipped((value) => !value)}>
              <RotateCw className="size-3.5" /> {t("Flip")}
            </Button>
            <Button onClick={onStart}>
              <Play /> {t("Start learning")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
