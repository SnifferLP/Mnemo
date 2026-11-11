import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ClipboardPaste,
  FileText,
  FolderPlus,
  Layers,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type {
  AiProviderInfo,
  CardInput,
  DocumentSummary,
  FolderNode,
  GeneratedCard,
} from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Label, Slider } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function parsePairs(text: string): CardInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      const comma = line.indexOf(",");
      const splitAt = tab >= 0 ? tab : comma;
      if (splitAt < 0) return null;
      const front = line.slice(0, splitAt).trim();
      const back = line.slice(splitAt + 1).trim();
      if (!front || !back) return null;
      return { front, back };
    })
    .filter((value): value is CardInput => value !== null);
}

export function CreatePage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState("compose");
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);

  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [providerId, setProviderId] = useState<string>("default");
  const [aiText, setAiText] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [count, setCount] = useState(12);
  const [difficulty, setDifficulty] = useState("medium");
  const [detail, setDetail] = useState("balanced");
  const [language, setLanguage] = useState("");
  const [cardFormat, setCardFormat] = useState("term_definition");
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedCard[]>([]);
  const [removingDocId, setRemovingDocId] = useState<string | null>(null);

  const loadSupporting = useCallback(async () => {
    try {
      const [folderList, providerList, docList] = await Promise.all([
        api.folders.list(),
        api.ai.providers(),
        api.documents.list("material"),
      ]);
      setFolders(folderList);
      setProviders(providerList);
      setDocuments(docList);
    } catch {
      /* non-fatal: the pages still work without AI/document metadata */
    }
  }, []);

  useEffect(() => {
    void loadSupporting();
    setCount(settings.aiCardBatch);
  }, [loadSupporting, settings.aiCardBatch]);

  useEffect(() => {
    // Drop stale references if a document was removed elsewhere or the
    // imported row disappeared between loads.
    setSelectedDocs((current) => {
      const available = new Set(documents.map((document) => document.id));
      const next = current.filter((id) => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [documents]);

  const parsed = useMemo(() => parsePairs(text), [text]);

  const createFromPairs = async () => {
    if (parsed.length === 0) {
      toast.error(t("Add at least one term and definition"));
      return;
    }
    setCreating(true);
    try {
      const created = await api.sets.create({
        title: title.trim() || t("Untitled study set"),
        description,
        folderId,
        source: "manual",
        cards: parsed,
      });
      toast.success(t("Created with {count} cards", { count: parsed.length }));
      navigate(`/sets/${created.set.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const importFile = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [
          {
            name: t("Documents"),
            extensions: ["pdf", "docx", "pptx", "txt", "md", "csv", "tsv", "json"],
          },
        ],
      });
      if (typeof file !== "string") return;
      setGenerating(true);
      const doc = await api.documents.importFile(file, "material");
      setDocuments((current) => [doc, ...current]);
      setSelectedDocs((current) => [...current, doc.id]);
      toast.success(t("Document imported"), {
        description: t("{count} characters", { count: doc.charCount.toLocaleString(locale) }),
      });
    } catch (error) {
      toast.error(t("Import failed"), { description: errorMessage(error) });
    } finally {
      setGenerating(false);
    }
  };

  const toggleDocument = (id: string, selected: boolean) => {
    setSelectedDocs((current) => {
      if (!selected) return current.filter((value) => value !== id);
      return current.includes(id) ? current : [...current, id];
    });
  };

  const removeDocument = async (document: DocumentSummary) => {
    if (removingDocId) return;
    setRemovingDocId(document.id);
    try {
      await api.documents.delete(document.id);
    } catch (error) {
      // A missing row is already removed; other failures must stay visible.
      if (!errorMessage(error).toLowerCase().includes("not found")) {
        toast.error(t("Could not remove the document"), {
          description: errorMessage(error),
        });
        return;
      }
    } finally {
      setRemovingDocId(null);
    }

    setDocuments((current) => current.filter((item) => item.id !== document.id));
    setSelectedDocs((current) => current.filter((id) => id !== document.id));
    toast.success(t("Document removed"), {
      description: t("The document was removed from the AI Generator."),
    });
  };

  const generate = async () => {
    if (aiText.trim().length < 40 && selectedDocs.length === 0) {
      toast.error(t("Paste some material or choose an imported document"));
      return;
    }
    setGenerating(true);
    try {
      const cards = await api.ai.generateCards({
        providerId: providerId === "default" ? null : providerId,
        sourceText: aiText,
        documentIds: selectedDocs,
        setId: null,
        count,
        difficulty,
        detailLevel: detail,
        language,
        cardFormat,
        focus,
      });
      setGenerated(cards);
      toast.success(t("{count} cards generated", { count: cards.length }));
    } catch (error) {
      toast.error(t("Generation failed"), { description: errorMessage(error) });
    } finally {
      setGenerating(false);
    }
  };

  const saveGenerated = async () => {
    const usable = generated.filter((card) => card.front.trim() && card.back.trim());
    if (usable.length === 0) {
      toast.error(t("There are no cards to save"));
      return;
    }
    setCreating(true);
    try {
      const created = await api.sets.create({
        title: title.trim() || t("AI generated set"),
        description,
        folderId,
        source: "ai",
        cards: usable.map((card) => ({
          front: card.front,
          back: card.back,
          explanation: card.explanation,
          hint: card.hint,
        })),
      });
      toast.success(t("Saved {count} cards", { count: usable.length }));
      navigate(`/sets/${created.set.id}/edit`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const hasProvider = providers.length > 0;

  return (
    <div>
      <PageHeader
        eyebrow={t("Create")}
        title={t("Build a new study set")}
        description={t(
          "Write cards yourself, paste an existing list, or let AI draft cards from your material.",
        )}
        actions={
          <Button variant="outline" onClick={() => void importFile()}>
            <Upload /> {t("Import file")}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="compose">
            <ClipboardPaste /> {t("Compose")}
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Wand2 /> {t("AI generator")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="new-title">{t("Title")}</Label>
                  <Input
                    id="new-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t("e.g. Spanish verbs — irregular present tense")}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="new-desc">{t("Description (optional)")}</Label>
                  <Input
                    id="new-desc"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("What should this set help you remember?")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Folder")}</Label>
                  <Select
                    value={folderId ?? "none"}
                    onValueChange={(value) => setFolderId(value === "none" ? null : value)}
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
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pairs">{t("Terms and definitions")}</Label>
                  <span className="text-[11px] text-muted-foreground">
                    {t("Tab or comma separated, one pair per line")}
                  </span>
                </div>
                <Textarea
                  id="pairs"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={"Haus\tHouse\nBaum\tTree\nlaufen\tto run"}
                  className="min-h-[220px] font-mono text-[12.5px] leading-relaxed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={parsed.length > 0 ? "success" : "outline"}>
                  {t("{count} {unit} detected", {
                    count: parsed.length,
                    unit: t(parsed.length === 1 ? "pair" : "pairs"),
                  })}
                </Badge>
                <Button variant="ghost" size="sm" onClick={() => navigate("/sets")}>
                  {t("Cancel")}
                </Button>
                <Button className="ml-auto" onClick={() => void createFromPairs()} disabled={creating}>
                  <Layers /> {creating ? t("Creating…") : t("Create study set")}
                </Button>
              </div>
            </Card>

            <Card className="flex flex-col p-4">
              <div className="mb-2 flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <span className="text-[13px] font-medium">{t("Live preview")}</span>
              </div>
              {parsed.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                  <ClipboardPaste className="size-6 text-muted-foreground/50" />
                  <p className="max-w-[220px] text-[12px] text-muted-foreground">
                    {t(
                      "Paste from Excel, Google Sheets or a Quizlet export and the first pairs show up here.",
                    )}
                  </p>
                </div>
              ) : (
                <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                  {parsed.slice(0, 30).map((pair, index) => (
                    <div key={index} className="rounded-lg bg-secondary/50 px-3 py-2">
                      <div className="truncate text-[12.5px] font-medium">{pair.front}</div>
                      <div className="truncate text-[12px] text-muted-foreground">{pair.back}</div>
                    </div>
                  ))}
                  {parsed.length > 30 && (
                    <p className="pt-1 text-center text-[11px] text-muted-foreground">
                      {t("+{count} more", { count: parsed.length - 30 })}
                    </p>
                  )}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai">
          {!hasProvider && (
            <Card className="mb-4 flex items-center gap-3.5 bg-primary-soft/70 p-5 shadow-none">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-[18px]" strokeWidth={1.8} />
              </span>
              <div className="flex-1">
                <div className="text-[13px] font-medium">{t("Connect an AI provider first")}</div>
                <p className="text-[12px] text-muted-foreground">
                  {t("OpenAI, OpenRouter, Mistral, a custom endpoint or a local Ollama model.")}
                </p>
              </div>
              <Button size="sm" onClick={() => navigate("/settings?section=ai")}>
                {t("Configure")}
              </Button>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ai-title">{t("Set title")}</Label>
                  <Input
                    id="ai-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t("e.g. Cell biology midterm")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Provider")}</Label>
                  <Select value={providerId} onValueChange={setProviderId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">{t("Default provider")}</SelectItem>
                      {providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-source">{t("Source material")}</Label>
                <Textarea
                  id="ai-source"
                  value={aiText}
                  onChange={(event) => setAiText(event.target.value)}
                  placeholder={t("Paste lecture notes, a chapter summary or an article…")}
                  className="min-h-[180px] text-[13px]"
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {t("{count} characters pasted", {
                      count: aiText.trim().length.toLocaleString(locale),
                    })}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => void importFile()}>
                    <Upload /> {t("Import PDF / DOCX / PPTX")}
                  </Button>
                </div>
              </div>

              {documents.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t("Imported documents")}</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {t("{count} selected", { count: selectedDocs.length })}
                    </span>
                  </div>
                  <div className="max-h-[150px] space-y-1 overflow-y-auto">
                    {documents.map((doc) => {
                      const active = selectedDocs.includes(doc.id);
                      const removing = removingDocId === doc.id;
                      return (
                        <div
                          key={doc.id}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] transition-colors",
                            active
                              ? "bg-primary-soft text-primary"
                              : "bg-secondary/50 hover:bg-secondary/80",
                          )}
                        >
                          <Checkbox
                            checked={active}
                            aria-label={t("Select {title}", { title: doc.title })}
                            onCheckedChange={(checked) => toggleDocument(doc.id, checked === true)}
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left"
                            onClick={() => toggleDocument(doc.id, !active)}
                          >
                            {doc.title}
                          </button>
                          <Badge variant="muted">{doc.format}</Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            aria-label={t("Remove {title} from the AI Generator", { title: doc.title })}
                            title={t("Remove {title} from the AI Generator", { title: doc.title })}
                            onClick={() => void removeDocument(doc)}
                            disabled={removingDocId !== null}
                          >
                            {removing ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {generated.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <Label>{t("Review generated cards")}</Label>
                    <Badge variant="secondary">{t("{count} cards", { count: generated.length })}</Badge>
                  </div>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {generated.map((card, index) => (
                      <div key={index} className="rounded-xl bg-secondary/50 p-3">
                        <div className="flex items-start gap-2">
                          <div className="grid flex-1 gap-1.5">
                            <Input
                              value={card.front}
                              onChange={(event) =>
                                setGenerated((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, front: event.target.value } : item,
                                  ),
                                )
                              }
                              className="h-8 border-transparent bg-transparent px-1 text-[13px] font-medium hover:border-input"
                            />
                            <Input
                              value={card.back}
                              onChange={(event) =>
                                setGenerated((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, back: event.target.value } : item,
                                  ),
                                )
                              }
                              className="h-8 border-transparent bg-transparent px-1 text-[13px] text-muted-foreground hover:border-input"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setGenerated((current) => current.filter((_, i) => i !== index))}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void generate()} disabled={generating || !hasProvider}>
                  {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {generating
                    ? t("Generating…")
                    : generated.length > 0
                      ? t("Regenerate")
                      : t("Generate cards")}
                </Button>
                {generated.length > 0 && (
                  <Button className="ml-auto" onClick={() => void saveGenerated()} disabled={creating}>
                    <Layers /> {t("Save {count} cards", { count: generated.length })}
                  </Button>
                )}
              </div>
            </Card>

            <Card className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <Wand2 className="size-4 text-primary" />
                <span className="text-[13px] font-medium">{t("Generation settings")}</span>
              </div>

              <div>
                <div className="flex items-center justify-between text-[12.5px]">
                  <Label>{t("Number of cards")}</Label>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </div>
                <Slider
                  value={[count]}
                  min={3}
                  max={40}
                  step={1}
                  onValueChange={([value]) => setCount(value)}
                  className="mt-2"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("Difficulty")}</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">{t("Foundation")}</SelectItem>
                    <SelectItem value="medium">{t("Balanced")}</SelectItem>
                    <SelectItem value="hard">{t("Advanced")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("Level of detail")}</Label>
                <Select value={detail} onValueChange={setDetail}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">{t("Concise")}</SelectItem>
                    <SelectItem value="balanced">{t("Balanced")}</SelectItem>
                    <SelectItem value="detailed">{t("Detailed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("Card format")}</Label>
                <Select value={cardFormat} onValueChange={setCardFormat}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="term_definition">{t("Term & definition")}</SelectItem>
                    <SelectItem value="question_answer">{t("Question & answer")}</SelectItem>
                    <SelectItem value="vocabulary">{t("Vocabulary & translation")}</SelectItem>
                    <SelectItem value="formula">{t("Formula & explanation")}</SelectItem>
                    <SelectItem value="date_event">{t("Date & event")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-language">{t("Language")}</Label>
                <Input
                  id="ai-language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder={t("Same as source")}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ai-focus">{t("Focus on")}</Label>
                <Input
                  id="ai-focus"
                  value={focus}
                  onChange={(event) => setFocus(event.target.value)}
                  placeholder={t("e.g. definitions and dates only")}
                  className="h-9"
                />
              </div>

              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <FolderPlus className="mt-0.5 size-3.5 shrink-0" />
                {t(
                  "Generated cards are editable before saving. Nothing is sent until you press Generate.",
                )}
              </p>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
