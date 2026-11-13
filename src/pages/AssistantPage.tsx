import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUp,
  Brain,
  Layers,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { AiProviderInfo, ChatMessage, Conversation, StudySetSummary } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { useI18n } from "@/i18n";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/input";
import { Label, Separator } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MODES = [
  { value: "tutor", label: "AI assistant", hint: "Clear explanations" },
  { value: "socratic", label: "Socratic", hint: "Guides with questions" },
  { value: "simplify", label: "Simplify", hint: "Plain language" },
];

const SUGGESTIONS = [
  "Explain the difference between mitosis and meiosis.",
  "Quiz me on the cards I keep getting wrong.",
  "Give me a real-world example for the hardest concept in this set.",
  "Summarise this study set in five bullet points.",
];

export function AssistantPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { t } = useI18n();
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState("tutor");
  const [setId, setSetId] = useState<string>("none");
  const [providerId, setProviderId] = useState<string>("default");
  const [shareSet, setShareSet] = useState(settings.aiShareSet);
  const [shareGaps, setShareGaps] = useState(settings.aiShareGaps);
  const [shareHistory, setShareHistory] = useState(true);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [providerList, setList, conversationList] = await Promise.all([
        api.ai.providers(),
        api.sets.list({ sort: "studied" }),
        api.ai.conversations(),
      ]);
      setProviders(providerList);
      setSets(setList);
      setConversations(conversationList);
    } catch (error) {
      toast.error(t("Could not load the assistant"), { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const openConversation = async (id: string) => {
    setActiveId(id);
    setMessages([]);
    try {
      const history = await api.ai.conversation(id);
      setMessages(history);
      const conversation = conversations.find((item) => item.id === id);
      if (conversation?.setId) setSetId(conversation.setId);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setInput("");
  };

  const send = async (text?: string) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    if (providers.length === 0) {
      toast.error(t("Configure an AI provider first"));
      navigate("/settings?section=ai");
      return;
    }
    setSending(true);
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      conversationId: activeId ?? "",
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setInput("");
    try {
      const reply = await api.ai.chat({
        conversationId: activeId,
        providerId: providerId === "default" ? null : providerId,
        setId: setId === "none" ? null : setId,
        message,
        mode,
        shareSet,
        shareGaps,
        shareHistory,
      });
      setActiveId(reply.conversationId);
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimistic.id),
        { ...optimistic, conversationId: reply.conversationId },
        reply.message,
      ]);
      const list = await api.ai.conversations();
      setConversations(list);
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setInput(message);
      toast.error(t("The AI assistant could not answer"), { description: errorMessage(error) });
    } finally {
      setSending(false);
    }
  };

  const removeConversation = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await api.ai.deleteConversation(id);
      if (activeId === id) newChat();
      setConversations((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("AI study assistant")}
        description={t(
          "An AI assistant that works with your own study sets — and never reveals answers too early.",
        )}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/settings?section=ai")}>
              <Sparkles /> {t("Providers")}
            </Button>
            <Button onClick={newChat}>
              <MessageSquarePlus /> {t("New chat")}
            </Button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_260px]">
        <Card className="flex min-h-0 flex-col overflow-hidden p-2">
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Conversations")}
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                {t("No conversations yet.")}
              </p>
            )}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => void openConversation(conversation.id)}
                className={cn(
                  "group flex w-full items-center gap-1 rounded-lg px-2 py-2 text-left text-[12.5px] transition-colors",
                  activeId === conversation.id
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => void removeConversation(conversation.id, event)}
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-5">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <Brain className="size-6" strokeWidth={1.7} />
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold">{t("What are we learning today?")}</h2>
                  <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-muted-foreground">
                    {t(
                      "Ask about a concept, request an explanation, or let the AI assistant quiz you on a set.",
                    )}
                  </p>
                </div>
                <div className="grid w-full max-w-md gap-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void send(suggestion)}
                      className="rounded-xl bg-secondary/50 px-3.5 py-2.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                    >
                      {t(suggestion)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    {message.role === "assistant" && (
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                        <Sparkles className="size-3.5" />
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/60",
                      )}
                    >
                      {message.role === "assistant" ? (
                        <Markdown>{message.content}</Markdown>
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                    {message.role === "user" && (
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <User className="size-3.5" />
                      </span>
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="flex items-center gap-3">
                    <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary">
                      <Sparkles className="size-3.5 animate-pulse" />
                    </span>
                    <div className="flex gap-1 rounded-xl bg-secondary/60 px-3.5 py-3">
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                          style={{ animationDelay: `${dot * 120}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={t("Ask anything about your material…")}
                className="max-h-[160px] min-h-[52px] resize-none"
              />
              <Button size="icon" className="size-[52px]" onClick={() => void send()} disabled={sending || !input.trim()}>
                {sending ? <ArrowUp className="animate-pulse" /> : <Send />}
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {MODES.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                    mode === option.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/70 text-muted-foreground hover:text-foreground",
                  )}
                  title={t(option.hint)}
                >
                  {t(option.label)}
                </button>
              ))}
              <span className="ml-auto text-[10.5px] text-muted-foreground">
                {t("Enter sends · Shift+Enter adds a line")}
              </span>
            </div>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <Layers className="size-3.5 text-primary" /> {t("AI context")}
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
              {t(
                "Choose what the AI assistant may read. Everything stays on this machine except the messages you send.",
              )}
            </p>

            <div className="space-y-1.5">
              <Label className="text-[11px]">{t("Study set")}</Label>
              <Select value={setId} onValueChange={setSetId}>
                <SelectTrigger className="h-9 text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("No set")}</SelectItem>
                  {sets.map((set) => (
                    <SelectItem key={set.id} value={set.id}>
                      {set.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 pt-3">
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
          </div>

          <Separator />

          <div className="space-y-3">
            {[
              { label: t("Set cards"), checked: shareSet, set: setShareSet },
              { label: t("Weak spots"), checked: shareGaps, set: setShareGaps },
              { label: t("Chat history"), checked: shareHistory, set: setShareHistory },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-muted-foreground">{row.label}</span>
                <Switch checked={row.checked} onCheckedChange={row.set} />
              </div>
            ))}
          </div>

          <Separator />

          <div className="text-[11px] leading-relaxed text-muted-foreground">
            {providers.length === 0 ? (
              <div className="space-y-2">
                <Badge variant="warning">{t("No provider")}</Badge>
                <p>{t("Add a provider to start chatting. Ollama works fully offline.")}</p>
                <Button size="sm" className="w-full" onClick={() => navigate("/settings?section=ai")}>
                  {t("Add provider")}
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Badge variant="success">{t("Ready")}</Badge>
                <p>{providers.find((p) => p.isDefault)?.name ?? providers[0]?.name} · {providers.find((p) => p.isDefault)?.model ?? providers[0]?.model}</p>
                <p>{t("Requests are sent only when you press send.")}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {loading && (
        <p className="sr-only" role="status">
          {t("Loading assistant")}
        </p>
      )}
    </div>
  );
}
