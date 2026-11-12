import { useEffect, useState } from "react";
import { ArrowLeftRight, Layers, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import {
  DEFAULT_FLASHCARD_OPTIONS,
  type CardDirection,
  type FlashcardOptions,
} from "@/lib/flashcards";

function OptionRow({
  active,
  disabled,
  title,
  hint,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-xl p-3.5 text-left transition-colors",
        active ? "bg-primary-soft ring-1 ring-primary/25" : "bg-secondary/50 hover:bg-secondary/80",
        disabled && "cursor-not-allowed opacity-50 hover:bg-secondary/50",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
        strokeWidth={1.8}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block text-[11.5px] leading-snug text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

/** Lets the learner pick a direction and a term selection before a session. */
export function FlashcardOptionsDialog({
  open,
  onOpenChange,
  cardCount,
  starredCount,
  onStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardCount: number;
  starredCount: number;
  onStart: (options: FlashcardOptions) => void;
}) {
  const { t } = useI18n();
  const [options, setOptions] = useState<FlashcardOptions>(DEFAULT_FLASHCARD_OPTIONS);

  // Reopening always starts from the defaults of this set, but a starred-only
  // selection is dropped as soon as the set has no starred term left.
  useEffect(() => {
    if (!open) return;
    setOptions((prev) => ({
      ...prev,
      starredOnly: prev.starredOnly && starredCount > 0,
    }));
  }, [open, starredCount]);

  const setDirection = (direction: CardDirection) =>
    setOptions((prev) => ({ ...prev, direction }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Start flashcards")}</DialogTitle>
          <DialogDescription>
            {t("Choose how the cards are shown and which terms to study. Nothing is changed in this set.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label>{t("Card direction")}</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <OptionRow
                active={options.direction === "front"}
                icon={Layers}
                title={t("Front side first")}
                hint={t("See the term and reveal the answer")}
                onClick={() => setDirection("front")}
              />
              <OptionRow
                active={options.direction === "back"}
                icon={ArrowLeftRight}
                title={t("Back side first")}
                hint={t("See the answer and reveal the term")}
                onClick={() => setDirection("back")}
              />
            </div>
          </div>

          <div>
            <Label>{t("Card selection")}</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <OptionRow
                active={!options.starredOnly}
                icon={Layers}
                title={t("All terms")}
                hint={t("{count} cards in this set", { count: cardCount })}
                onClick={() => setOptions((prev) => ({ ...prev, starredOnly: false }))}
              />
              <OptionRow
                active={options.starredOnly}
                disabled={starredCount === 0}
                icon={Star}
                title={t("Starred terms only")}
                hint={
                  starredCount > 0
                    ? t("{count} starred", { count: starredCount })
                    : t("Star a term first to use this option")
                }
                onClick={() => setOptions((prev) => ({ ...prev, starredOnly: true }))}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => onStart(options)}>{t("Start learning")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
