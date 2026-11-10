import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Play,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { FolderNode, StudySetSummary } from "@/lib/types";
import { cn, errorMessage, formatRelative } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { tp } from "@/i18n/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/misc";

export function StudySetCard({
  set,
  folders = [],
  onChanged,
}: {
  set: StudySetSummary;
  folders?: FolderNode[];
  onChanged?: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const mastery = set.cardCount > 0 ? Math.round((set.masteredCount / set.cardCount) * 100) : 0;

  const run = async (task: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await task();
      toast.success(message);
      onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const metadata = [
    tp(set.cardCount, "1 card", "{count} cards"),
    set.folderName,
    ...set.tags.slice(0, 1).map((tag) => `#${tag}`),
  ].filter(Boolean) as string[];

  return (
    <Card
      className={cn(
        "lift group relative flex cursor-pointer flex-col gap-3 rounded-lg border-border bg-card p-4 hover:border-foreground/20",
        busy && "pointer-events-none opacity-60",
      )}
      onClick={() => navigate(`/sets/${set.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {set.isFavorite && <Star className="size-3 shrink-0 fill-primary text-primary" />}
            <h3 className="display truncate text-[17px] leading-tight text-foreground">{set.title}</h3>
          </div>
          <p className="mt-1.5 line-clamp-2 min-h-[34px] text-[12px] leading-relaxed text-muted-foreground">
            {set.description || t("No description yet.")}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground/60 opacity-70 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(event) => event.stopPropagation()}
              aria-label={t("Actions for {title}", { title: set.title })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenuItem onSelect={() => navigate(`/sets/${set.id}/study/flashcards`)}>
              <Play /> {t("Study")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate(`/sets/${set.id}/edit`)}>
              <Pencil /> {t("Edit cards")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                run(
                  () => api.sets.favorite(set.id, !set.isFavorite),
                  t(set.isFavorite ? "Removed from favorites" : "Added to favorites"),
                )
              }
            >
              <Star /> {t(set.isFavorite ? "Unfavorite" : "Favorite")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                run(() => api.sets.duplicate(set.id), t("Study set duplicated"))
              }
            >
              <Copy /> {t("Duplicate")}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderInput /> {t("Move to folder")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => run(() => api.sets.move(set.id, null), t("Moved"))}>
                  {t("No folder")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {folders.length === 0 && <DropdownMenuLabel>{t("No folders yet")}</DropdownMenuLabel>}
                {folders.map((node) => (
                  <DropdownMenuItem
                    key={node.folder.id}
                    onSelect={() => run(() => api.sets.move(set.id, node.folder.id), t("Moved"))}
                  >
                    {node.folder.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() =>
                run(async () => {
                  if (
                    !window.confirm(
                      t('Delete "{title}" and all of its cards?', { title: set.title }),
                    )
                  )
                    return;
                  await api.sets.delete(set.id);
                }, t("Study set deleted"))
              }
            >
              <Trash2 /> {t("Delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.09em] text-muted-foreground/75">
        {metadata.map((item, index) => (
          <span key={`${item}-${index}`} className="flex items-center gap-2">
            {index > 0 && <span className="text-border">/</span>}
            <span>{item}</span>
          </span>
        ))}
        {set.dueCount > 0 && (
          <span className="flex items-center gap-2">
            <span className="text-border">/</span>
            <span className="text-primary">
              {t("{count} due", { count: set.dueCount })}
            </span>
          </span>
        )}
      </div>

      <div className="mt-auto border-t border-border pt-2.5">
        <div className="flex items-baseline justify-between gap-3 text-[10.5px] text-muted-foreground">
          <span className="font-mono text-[9px] uppercase tracking-[0.09em]">
            {t("{percent}% mastered", { percent: mastery })}
          </span>
          <span>{set.lastStudiedAt ? formatRelative(set.lastStudiedAt) : t("Unstudied")}</span>
        </div>
        <Progress
          value={mastery}
          className="mt-2 h-[2px] rounded-none bg-secondary"
          indicatorClassName="rounded-none"
        />
      </div>
    </Card>
  );
}
