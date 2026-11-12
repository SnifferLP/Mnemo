import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Eye, Keyboard, LayoutList, Save, Table2, Tag, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { Flashcard, FolderNode, StudySetDetail, UpdateSetInput } from "@/lib/types";
import { indexTerms } from "@/lib/duplicates";
import { errorMessage } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { CardEditorRow, DraftCardRow } from "@/components/editor/CardEditorRow";
import { TableEditor } from "@/components/editor/TableEditor";
import { ErrorPanel, Kbd, LoadingPanel, PageHeader } from "@/components/common";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label, Separator } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Meta {
  title: string;
  description: string;
  folderId: string | null;
  languageFront: string;
  languageBack: string;
}

export function SetEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [detail, setDetail] = useState<StudySetDetail | null>(null);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "table">("list");
  const [showPreview, setShowPreview] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const metaRef = useRef<Meta | null>(null);
  const saveTimer = useRef<number | null>(null);
  const draftAnchor = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  // First card for every saved pair (term + definition). Rows also compare
  // their live draft against this index, so duplicates are found while typing.
  const termIndex = useMemo(
    () =>
      indexTerms(
        (detail?.cards ?? []).map((item) => ({
          id: item.card.id,
          front: item.card.front,
          back: item.card.back,
        })),
      ),
    [detail],
  );

  const jumpToCard = useCallback((cardId: string) => {
    const element = rowRefs.current.get(cardId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.querySelector("textarea")?.focus({ preventScroll: true });
    setFlashId(cardId);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 1800);
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const reload = useCallback(async () => {
    try {
      const [data, folderList] = await Promise.all([api.sets.get(id), api.folders.list()]);
      setDetail(data);
      setFolders(folderList);
      setTags(data.tags);
      const nextMeta: Meta = {
        title: data.set.title,
        description: data.set.description,
        folderId: data.set.folderId,
        languageFront: data.set.languageFront,
        languageBack: data.set.languageBack,
      };
      setMeta(nextMeta);
      metaRef.current = nextMeta;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persistMeta = useCallback(async () => {
    const current = metaRef.current;
    if (!current || !current.title.trim()) return;
    const payload: UpdateSetInput = {
      title: current.title.trim(),
      description: current.description,
      folderId: current.folderId,
      languageFront: current.languageFront,
      languageBack: current.languageBack,
    };
    try {
      await api.sets.update(id, payload);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      toast.error(t("Changes not saved"), { description: errorMessage(err) });
    }
  }, [id]);

  const changeMeta = (patch: Partial<Meta>) => {
    setMeta((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      metaRef.current = next;
      return next;
    });
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persistMeta(), 900);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistMeta();
        toast.success(t("Saved"));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        draftAnchor.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [persistMeta]);

  const replaceCard = (card: Flashcard) => {
    setDetail((current) => {
      if (!current) return current;
      return {
        ...current,
        cards: current.cards.map((item) =>
          item.card.id === card.id ? { ...item, card } : item,
        ),
      };
    });
  };

  const addCard = async (front: string, back: string) => {
    try {
      await api.cards.create(id, { front, back });
      await reload();
    } catch (err) {
      toast.error(errorMessage(err));
      throw err;
    }
  };

  const saveTags = async (next: string[]) => {
    setTags(next);
    try {
      const saved = await api.sets.setTags(id, next);
      setTags(saved);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const commitTagInput = () => {
    const names = tagInput
      .split(",")
      .map((value) => value.trim().replace(/^#/, ""))
      .filter(Boolean);
    if (names.length === 0) {
      setTagInput("");
      return;
    }
    const next = Array.from(new Set([...tags, ...names]));
    setTagInput("");
    void saveTags(next);
  };

  const moveCard = async (from: number, to: number) => {
    if (!detail || from === to) return;
    const cards = [...detail.cards];
    const [moved] = cards.splice(from, 1);
    cards.splice(to, 0, moved);
    setDetail({ ...detail, cards });
    try {
      await api.cards.reorder(id, cards.map((card) => card.card.id));
    } catch (err) {
      toast.error(errorMessage(err));
      void reload();
    }
  };

  if (loading) return <LoadingPanel label={t("Opening editor")} />;
  if (error || !detail || !meta) {
    return <ErrorPanel message={error ?? t("Study set not found")} onRetry={() => void reload()} />;
  }

  return (
    <div>
      <Link
        to={`/sets/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("Back to set")}
      </Link>

      <PageHeader
        eyebrow={t("Flashcard editor")}
        title={t("Edit study set")}
        description={t("Changes save automatically. Use the table view to enter many cards quickly.")}
        actions={
          <>
            <div className="flex items-center gap-1.5 rounded-lg bg-secondary/60 px-3 py-2 text-[11.5px] text-muted-foreground">
              {savedAt ? (
                <>
                  <Check className="size-3.5 text-success" />
                  {t("Saved {time}", {
                    time: new Date(savedAt).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                  })}
                </>
              ) : (
                t("Auto-save on")
              )}
            </div>
            <Button variant="outline" onClick={() => setShowPreview((value) => !value)}>
              <Eye /> {showPreview ? t("Hide preview") : t("Preview")}
            </Button>
            <Button onClick={() => navigate(`/sets/${id}/study/flashcards`)}>{t("Study")}</Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">{t("Title")}</Label>
              <Input
                id="title"
                value={meta.title}
                onChange={(event) => changeMeta({ title: event.target.value })}
                onBlur={() => void persistMeta()}
                className="text-[15px] font-medium"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">{t("Description")}</Label>
              <Textarea
                id="description"
                value={meta.description}
                onChange={(event) => changeMeta({ description: event.target.value })}
                onBlur={() => void persistMeta()}
                placeholder={t("What is this set about?")}
                className="min-h-[64px]"
              />
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={view} onValueChange={(value) => setView(value as "list" | "table")}>
              <TabsList>
                <TabsTrigger value="list">
                  <LayoutList /> {t("Card editor")}
                </TabsTrigger>
                <TabsTrigger value="table">
                  <Table2 /> {t("Table")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Badge variant="outline">{t("{count} cards", { count: detail.cards.length })}</Badge>
            <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Keyboard className="size-3.5" /> <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> {t("new card")} ·{" "}
              <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> {t("save")}
            </div>
          </div>

          {view === "table" ? (
            <TableEditor
              setId={id}
              onCreated={async () => {
                await reload();
              }}
            />
          ) : (
            <div className="space-y-2">
              {detail.cards.map((studyCard, index) => (
                <div
                  key={studyCard.card.id}
                  ref={(element) => {
                    if (element) rowRefs.current.set(studyCard.card.id, element);
                    else rowRefs.current.delete(studyCard.card.id);
                  }}
                >
                  <CardEditorRow
                    studyCard={studyCard}
                    index={index}
                    termIndex={termIndex}
                    onJumpToCard={jumpToCard}
                    highlighted={flashId === studyCard.card.id}
                    onUpdated={replaceCard}
                    onReordered={() => void reload()}
                    dragHandlers={{
                      isDragging: dragIndex === index,
                      onDragStart: () => setDragIndex(index),
                      onDragOver: (event) => event.preventDefault(),
                      onDrop: () => {
                        if (dragIndex !== null) void moveCard(dragIndex, index);
                        setDragIndex(null);
                      },
                    }}
                    onDeleted={async () => {
                      try {
                        await api.cards.delete(studyCard.card.id);
                        setDetail((current) =>
                          current
                            ? {
                                ...current,
                                cards: current.cards.filter(
                                  (item) => item.card.id !== studyCard.card.id,
                                ),
                              }
                            : current,
                        );
                        toast.success(t("Card deleted"));
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  />
                </div>
              ))}

              {/* The dashed row below the list creates the next card as soon as
                  both sides have text, so no separate add button is needed. */}
              <div ref={draftAnchor}>
                <DraftCardRow
                  onCreate={addCard}
                  termIndex={termIndex}
                  onJumpToCard={jumpToCard}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label>{t("Folder")}</Label>
              <Select
                value={meta.folderId ?? "none"}
                onValueChange={(value) => {
                  const folderId = value === "none" ? null : value;
                  changeMeta({ folderId });
                  void api.sets
                    .move(id, folderId)
                    .then(() => void persistMeta())
                    .catch((err) => toast.error(errorMessage(err)));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("No folder")}</SelectItem>
                  {folders.map((node) => (
                    <SelectItem key={node.folder.id} value={node.folder.id}>
                      {node.folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Tag className="size-3.5" /> {t("Tags")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 && (
                  <span className="text-[11.5px] text-muted-foreground">{t("No tags yet")}</span>
                )}
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-primary"
                  >
                    #{tag}
                    <button
                      onClick={() => void saveTags(tags.filter((value) => value !== tag))}
                      className="text-primary/60 transition-colors hover:text-primary"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <Input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onBlur={commitTagInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTagInput();
                  }
                }}
                placeholder={t("Add tag, press Enter")}
                className="h-9 text-[13px]"
              />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px]">{t("Front language")}</Label>
                <Input
                  value={meta.languageFront}
                  onChange={(event) => changeMeta({ languageFront: event.target.value })}
                  onBlur={() => void persistMeta()}
                  className="h-9 text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">{t("Back language")}</Label>
                <Input
                  value={meta.languageBack}
                  onChange={(event) => changeMeta({ languageBack: event.target.value })}
                  onBlur={() => void persistMeta()}
                  className="h-9 text-[13px]"
                />
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={() => void persistMeta()}>
              <Save /> {t("Save now")}
            </Button>
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <Label>{t("Markdown preview")}</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-[11px] text-muted-foreground">?</span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px]">
                  {t("Card sides support **bold**, *italic*, lists, `code` and links.")}
                </TooltipContent>
              </Tooltip>
            </div>
            <Markdown>
              {detail.cards[0]?.card.back || t("_Add a card to preview Markdown._")}
            </Markdown>
          </Card>
        </div>
      </div>
    </div>
  );
}
