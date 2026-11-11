import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BookOpen,
  Check,
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  NotebookPen,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type {
  AiProviderInfo,
  DocumentSummary,
  GeneratedCard,
  MagicNotesResult,
} from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Label, Slider } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function MagicNotesPage() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [cardCount, setCardCount] = useState(12);
  const [language, setLanguage] = useState("");
  const [providerId, setProviderId] = useState("default");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<MagicNotesResult | null>(null);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [providerList, docList] = await Promise.all([
        api.ai.providers(),
        api.documents.list("notes"),
      ]);
      setProviders(providerList);
      setDocuments(docList);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const importFile = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: t("Documents"), extensions: ["pdf", "docx", "pptx", "txt", "md"] }],
      });
      if (typeof file !== "string") return;
      const doc = await api.documents.importFile(file, "notes");
      setDocuments((current) => [doc, ...current]);
      setSelectedDocs((current) => [...current, doc.id]);
      toast.success(t("Notes imported"));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const generate = async () => {
    if (text.trim().length < 80 && selectedDocs.length === 0) {
      toast.error(t("Paste at least a paragraph or import a document"));
      return;
    }
    setGenerating(true);
    try {
      const generated = await api.ai.magicNotes({
        providerId: providerId === "default" ? null : providerId,
        sourceText: text,
        documentIds: selectedDocs,
        title,
        language,
        cardCount,
      });
      setResult(generated);
      setCards(generated.cards);
      setQuizIndex(0);
      setQuizChoice(null);
      toast.success(t("Study material ready"));
      if (text.trim()) {
        await api.documents.saveText(title || t("Untitled notes"), text, "notes");
        setDocuments(await api.documents.list("notes"));
      }
    } catch (error) {
      toast.error(t("Could not generate material"), { description: errorMessage(error) });
    } finally {
      setGenerating(false);
    }
  };

  const createSetFromCards = async () => {
    const usable = cards.filter((card) => card.front.trim() && card.back.trim());
    if (usable.length === 0) {
      toast.error(t("No cards to save"));
      return;
    }
    setSaving(true);
    try {
      const created = await api.sets.create({
        title: title.trim() || t("Magic Notes set"),
        description: result?.summary?.slice(0, 200) ?? "",
        source: "ai",
        cards: usable,
      });
      toast.success(t("Study set created"));
      navigate(`/sets/${created.set.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const saveStudyGuide = () => {
    if (!result) return;
    const parts = [
      `# ${title || t("Magic Notes")}`,
      "",
      result.summary,
      "",
      `## ${t("Key points")}`,
      ...result.keyPoints.map((point) => `- ${point}`),
      "",
      `## ${t("Study guide")}`,
      result.studyGuide,
    ];
    setText(parts.join("\n"));
    toast.success(t("Study guide copied into the notes editor"));
  };

  const removeDocument = async (id: string) => {
    try {
      await api.documents.delete(id);
      setDocuments((current) => current.filter((doc) => doc.id !== id));
      setSelectedDocs((current) => current.filter((value) => value !== id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const currentQuiz = result?.quiz[quizIndex];

  return (
    <div>
      <PageHeader
        eyebrow={t("Magic Notes")}
        title={t("Turn notes into study material")}
        description={t(
          "Import or paste extensive notes and get a summary, flashcards, a quiz, definitions and a study guide.",
        )}
        actions={
          <Button variant="outline" onClick={() => void importFile()}>
            <Upload /> {t("Import notes")}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="flex h-fit flex-col gap-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="notes-title">{t("Title")}</Label>
            <Input
              id="notes-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("e.g. Immunology lecture 4")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes-text">{t("Notes")}</Label>
            <Textarea
              id="notes-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("Paste lecture notes, an article or a chapter…")}
              className="min-h-[220px] text-[13px]"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>
                {t("{count} characters", { count: text.trim().length.toLocaleString(locale) })}
              </span>
              <button className="hover:text-foreground" onClick={() => void importFile()}>
                {t("import file instead")}
              </button>
            </div>
          </div>

          {documents.length > 0 && (
            <div className="space-y-2">
              <Label>{t("Saved notes")}</Label>
              <div className="max-h-[180px] space-y-1 overflow-y-auto">
                {documents.map((doc) => {
                  const active = selectedDocs.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] transition-colors",
                        active ? "bg-primary-soft text-primary" : "bg-secondary/50",
                      )}
                    >
                      <Checkbox
                        checked={active}
                        onCheckedChange={(checked) =>
                          setSelectedDocs((current) =>
                            checked ? [...current, doc.id] : current.filter((value) => value !== doc.id),
                          )
                        }
                      />
                      <span className="flex-1 truncate">{doc.title}</span>
                      <Badge variant="muted">{doc.format}</Badge>
                      <button className="text-muted-foreground hover:text-destructive" onClick={() => void removeDocument(doc.id)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[11px]">{t("Provider")}</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="h-9 text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t("Default")}</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px]">{t("Language")}</Label>
              <Input
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder={t("Auto")}
                className="h-9 text-[12.5px]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-[12px]">
              <Label>{t("Flashcards")}</Label>
              <span className="tabular-nums text-muted-foreground">{cardCount}</span>
            </div>
            <Slider
              value={[cardCount]}
              min={4}
              max={30}
              step={1}
              onValueChange={([value]) => setCardCount(value)}
              className="mt-2"
            />
          </div>

          <Button onClick={() => void generate()} disabled={generating}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? t("Analysing notes…") : t("Generate study material")}
          </Button>
          {providers.length === 0 && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("No AI provider configured yet —")}{" "}
              <button className="text-primary hover:underline" onClick={() => navigate("/settings?section=ai")}>
                {t("add one in Settings")}
              </button>
              .
            </p>
          )}
        </Card>

        <Card className="min-h-[520px] p-5">
          {!result ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                <NotebookPen className="size-6" strokeWidth={1.7} />
              </span>
              <h2 className="text-[16px] font-semibold">{t("Your study material will appear here")}</h2>
              <p className="max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
                {t(
                  "Mnemo turns your notes into a summary, flashcards, a quiz and a structured study guide — all in one pass.",
                )}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                {["Summary", "Flashcards", "Quiz", "Definitions", "Study guide"].map((item) => (
                  <Badge key={item} variant="secondary">
                    {t(item)}
                  </Badge>
                ))}
              </div>
            </div>
          ) : (
            <Tabs defaultValue="summary">
              <TabsList className="flex-wrap">
                <TabsTrigger value="summary">{t("Summary")}</TabsTrigger>
                <TabsTrigger value="cards">{t("Flashcards")} ({cards.length})</TabsTrigger>
                <TabsTrigger value="quiz">{t("Quiz")} ({result.quiz.length})</TabsTrigger>
                <TabsTrigger value="definitions">{t("Definitions")}</TabsTrigger>
                <TabsTrigger value="guide">{t("Study guide")}</TabsTrigger>
              </TabsList>

              <TabsContent value="summary">
                <div className="space-y-4">
                  <Markdown>{result.summary || t("_No summary returned._")}</Markdown>
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
                      <BookOpen className="size-4 text-primary" /> {t("Key points")}
                    </h3>
                    <ul className="space-y-1.5">
                      {result.keyPoints.map((point, index) => (
                        <li key={index} className="flex gap-2 text-[13px]">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={saveStudyGuide}>
                      <Save /> {t("Send guide to notes editor")}
                    </Button>
                    <Button size="sm" onClick={() => void createSetFromCards()} disabled={saving || cards.length === 0}>
                      <Layers /> {t("Create study set")}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="cards">
                <div className="space-y-2">
                  {cards.map((card, index) => (
                    <div key={index} className="rounded-xl bg-secondary/50 p-3">
                      <div className="flex items-start gap-2">
                        <div className="grid flex-1 gap-1.5">
                          <Input
                            value={card.front}
                            onChange={(event) =>
                              setCards((current) =>
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
                              setCards((current) =>
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
                          onClick={() => setCards((current) => current.filter((_, i) => i !== index))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCards((current) => [...current, { front: "", back: "", explanation: "", hint: "" }])}
                    >
                      <Plus /> {t("Add card")}
                    </Button>
                    <Button size="sm" onClick={() => void createSetFromCards()} disabled={saving}>
                      <Layers /> {t("Create study set")}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="quiz">
                {currentQuiz ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        {t("Question {current} of {total}", {
                          current: quizIndex + 1,
                          total: result.quiz.length,
                        })}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={quizIndex === 0}
                          onClick={() => {
                            setQuizIndex((value) => value - 1);
                            setQuizChoice(null);
                          }}
                        >
                          {t("Previous")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={quizIndex >= result.quiz.length - 1}
                          onClick={() => {
                            setQuizIndex((value) => value + 1);
                            setQuizChoice(null);
                          }}
                        >
                          {t("Next")}
                        </Button>
                      </div>
                    </div>

                    <p className="text-[15px] font-medium">{currentQuiz.question}</p>

                    <div className="space-y-2">
                      {currentQuiz.options.map((option, index) => {
                        const chosen = quizChoice === index;
                        const isAnswer = option === currentQuiz.answer;
                        const revealed = quizChoice !== null;
                        return (
                          <button
                            key={index}
                            onClick={() => setQuizChoice(index)}
                            disabled={revealed}
                            className={cn(
                              "flex w-full items-center gap-2.5 rounded-xl px-4 py-3 text-left text-[13px] transition-colors",
                              revealed && isAnswer && "bg-success/12 text-success",
                              revealed && chosen && !isAnswer && "bg-destructive/12 text-destructive",
                              !revealed && "bg-secondary/50 hover:bg-secondary/80",
                              revealed && !isAnswer && !chosen && "opacity-60",
                            )}
                          >
                            {revealed && isAnswer ? (
                              <CheckCircle2 className="size-4 shrink-0 text-success" />
                            ) : revealed && chosen ? (
                              <XCircle className="size-4 shrink-0 text-destructive" />
                            ) : (
                              <span className="size-4 shrink-0 rounded-full border border-border" />
                            )}
                            <span className="flex-1">{option}</span>
                            {revealed && isAnswer && <Check className="size-3.5 text-success" />}
                          </button>
                        );
                      })}
                    </div>

                    {quizChoice !== null && currentQuiz.explanation && (
                      <div className="rounded-xl bg-secondary/60 p-4 text-[12.5px] leading-relaxed">
                        {currentQuiz.explanation}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[13px] text-muted-foreground">{t("No quiz questions were generated.")}</p>
                )}
              </TabsContent>

              <TabsContent value="definitions">
                <div className="space-y-2">
                  {result.definitions.length === 0 && (
                    <p className="text-[13px] text-muted-foreground">{t("No definitions returned.")}</p>
                  )}
                  {result.definitions.map((definition, index) => (
                    <div key={index} className="rounded-xl bg-secondary/50 p-4">
                      <div className="text-[13px] font-semibold">{definition.term}</div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                        {definition.definition}
                      </p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="guide">
                <Markdown>{result.studyGuide || t("_No study guide returned._")}</Markdown>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" onClick={saveStudyGuide}>
                    <FileText /> {t("Send to notes editor")}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </Card>
      </div>
    </div>
  );
}
