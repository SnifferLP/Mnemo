import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  ImagePlus,
  Loader2,
  Mic,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { Flashcard, StudyCard } from "@/lib/types";
import { CARD_TYPES, cn, errorMessage } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

interface Draft {
  front: string;
  back: string;
  explanation: string;
  hint: string;
  cardType: string;
}

export function CardEditorRow({
  studyCard,
  index,
  onUpdated,
  onDeleted,
  onReordered,
  dragHandlers,
}: {
  studyCard: StudyCard;
  index: number;
  onUpdated: (card: Flashcard) => void;
  onDeleted: () => void;
  onReordered: () => void;
  dragHandlers: {
    onDragStart: () => void;
    onDragOver: (event: React.DragEvent) => void;
    onDrop: () => void;
    isDragging: boolean;
  };
}) {
  const { t } = useI18n();
  const card = studyCard.card;
  const [draft, setDraft] = useState<Draft>({
    front: card.front,
    back: card.back,
    explanation: card.explanation,
    hint: card.hint,
    cardType: card.cardType,
  });
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    setDraft({
      front: card.front,
      back: card.back,
      explanation: card.explanation,
      hint: card.hint,
      cardType: card.cardType,
    });
  }, [card.id, card.front, card.back, card.explanation, card.hint, card.cardType]);

  const dirty =
    draft.front !== card.front ||
    draft.back !== card.back ||
    draft.explanation !== card.explanation ||
    draft.hint !== card.hint ||
    draft.cardType !== card.cardType;

  const save = async () => {
    const current = draftRef.current;
    if (!current.front.trim() || !current.back.trim()) return;
    setSaving(true);
    try {
      const updated = await api.cards.update(card.id, {
        front: current.front,
        back: current.back,
        explanation: current.explanation,
        hint: current.hint,
        cardType: current.cardType,
      });
      onUpdated(updated);
    } catch (error) {
      toast.error(t("Card not saved"), { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirty) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void save(), 800);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const update = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const pickImage = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: t("Images"), extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"] }],
      });
      if (typeof file !== "string") return;
      const updated = await api.cards.attachMedia(card.id, "image", file);
      onUpdated(updated);
      toast.success(t("Image attached"));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;
        try {
          const base64 = await blobToBase64(blob);
          const updated = await api.cards.attachMediaBytes(card.id, "audio", "recording.webm", base64);
          onUpdated(updated);
          toast.success(t("Recording saved"));
        } catch (error) {
          toast.error(errorMessage(error));
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error(t("Microphone access was denied"));
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const removeImage = async () => {
    try {
      const updated = await api.cards.removeMedia(card.id, "image");
      onUpdated(updated);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const removeAudio = async () => {
    try {
      const updated = await api.cards.removeMedia(card.id, "audio");
      onUpdated(updated);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <Card
      draggable
      onDragStart={dragHandlers.onDragStart}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      className={cn(
        "group p-3 transition-all",
        dragHandlers.isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-2 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
          aria-label={t("Drag to reorder")}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="mt-2 w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground/60">
          {index + 1}
        </span>

        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {t("Front")}
            </Label>
            <Textarea
              value={draft.front}
              onChange={(event) => update({ front: event.target.value })}
              onBlur={() => void save()}
              placeholder={t("Term, question or prompt — Markdown supported")}
              className="min-h-[68px] resize-y text-[13.5px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {t("Back")}
            </Label>
            <Textarea
              value={draft.back}
              onChange={(event) => update({ back: event.target.value })}
              onBlur={() => void save()}
              placeholder={t("Definition, answer or translation")}
              className="min-h-[68px] resize-y text-[13.5px]"
            />
          </div>
        </div>

        <div className="mt-1.5 flex shrink-0 flex-col items-center gap-0.5">
          {saving ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            dirty && (
              <span
                className="size-1.5 rounded-full bg-warning"
                title={t("Unsaved changes")}
              />
            )
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setExpanded((value) => !value)}
            aria-label={t("More card options")}
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      </div>

      {(card.imagePath || card.audioPath) && (
        <div className="mt-2 flex items-center gap-2 pl-[52px]">
          {card.imagePath && (
            <div className="relative">
              <img
                src={convertFileSrc(card.imagePath)}
                alt={t("Card image")}
                className="h-14 w-20 rounded-lg border border-border object-cover"
              />
              <button
                onClick={() => void removeImage()}
                className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
          {card.audioPath && (
            <div className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void new Audio(convertFileSrc(card.audioPath!)).play()}
              >
                <Volume2 />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => void removeAudio()}>
                <VolumeX />
              </Button>
            </div>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3 pl-[52px] animate-fade-in">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                {t("Explanation")}
              </Label>
              <Textarea
                value={draft.explanation}
                onChange={(event) => update({ explanation: event.target.value })}
                onBlur={() => void save()}
                placeholder={t("Extra context, example or mnemonic")}
                className="min-h-[60px] text-[13px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                {t("Hint")}
              </Label>
              <Input
                value={draft.hint}
                onChange={(event) => update({ hint: event.target.value })}
                onBlur={() => void save()}
                placeholder={t("A nudge shown before revealing the answer")}
              />
              <div className="pt-2">
                <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  {t("Card type")}
                </Label>
                <Select value={draft.cardType} onValueChange={(value) => update({ cardType: value })}>
                  <SelectTrigger className="mt-1 h-9 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {t(type.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void pickImage()}>
              <ImagePlus /> {t(card.imagePath ? "Replace image" : "Add image")}
            </Button>
            <Button
              variant={recording ? "destructive" : "outline"}
              size="sm"
              onClick={() => (recording ? stopRecording() : void startRecording())}
            >
              {recording ? <Square /> : <Mic />}
              {recording
                ? t("Stop recording")
                : t(card.audioPath ? "Replace audio" : "Record audio")}
            </Button>
            <div className="ml-auto flex items-center gap-1.5">
              <Badge variant="outline">
                {studyCard.progress.state === "new"
                  ? t("Not studied")
                  : `${studyCard.progress.correctCount}✓ / ${studyCard.progress.wrongCount}✗`}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  api.cards
                    .duplicate(card.id)
                    .then(() => onReordered())
                    .catch((error) => toast.error(errorMessage(error)))
                }
              >
                <Copy /> {t("Duplicate")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (!window.confirm(t("Delete this card?"))) return;
                  onDeleted();
                }}
              >
                <Trash2 /> {t("Delete")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export function DraftCardRow({ onCreate }: { onCreate: (front: string, back: string) => Promise<void> }) {
  const { t } = useI18n();
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    if (!front.trim() || !back.trim()) {
      toast.error(t("Both sides are needed"));
      return;
    }
    setBusy(true);
    try {
      await onCreate(front.trim(), back.trim());
      setFront("");
      setBack("");
      frontRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-dashed border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-2 w-6 shrink-0 text-center text-[16px] leading-none text-primary/60">+</span>
        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2">
          <Textarea
            ref={frontRef}
            value={front}
            onChange={(event) => setFront(event.target.value)}
            placeholder={t("New front — press Ctrl+Enter to add")}
            className="min-h-[60px] bg-background/60 text-[13.5px]"
          />
          <Textarea
            value={back}
            onChange={(event) => setBack(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
            }}
            placeholder={t("New back")}
            className="min-h-[60px] bg-background/60 text-[13.5px]"
          />
        </div>
        <Button size="sm" className="mt-1.5" onClick={() => void submit()} disabled={busy}>
          {t("Add")}
        </Button>
      </div>
    </Card>
  );
}
