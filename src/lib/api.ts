import { invoke } from "@tauri-apps/api/core";

import type {
  AiProviderInfo,
  AnswerFeedback,
  AppInfo,
  AppSettings,
  CardInput,
  ChatMessage,
  ChatReply,
  ChatRequest,
  Conversation,
  CreateSetInput,
  DashboardData,
  DayActivity,
  DocumentSummary,
  Flashcard,
  Folder,
  FolderNode,
  GenerateCardsRequest,
  GeneratedCard,
  ImportedDocument,
  MagicNotesRequest,
  MagicNotesResult,
  MatchingOutcome,
  ProviderPreset,
  SaveProviderInput,
  SetStatistics,
  StatisticsData,
  StudyCard,
  StudySession,
  StudySetDetail,
  StudySetSummary,
  Tag,
  TestAnswer,
  TestConfig,
  TestOutcome,
  TestQuestion,
  UpdateSetInput,
} from "./types";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "The action could not be completed.";
    throw new Error(message);
  }
}

export interface SetListQuery {
  query?: string | null;
  folderId?: string | null;
  tagId?: string | null;
  favoritesOnly?: boolean;
  sort?: string;
}

export const api = {
  folders: {
    list: () => call<FolderNode[]>("list_folders"),
    create: (name: string, parentId: string | null = null, color: string | null = null) =>
      call<Folder>("create_folder", { name, parentId, color }),
    update: (id: string, name?: string, color?: string | null) =>
      call<Folder>("update_folder", { id, name: name ?? null, color: color ?? null }),
    move: (id: string, parentId: string | null) =>
      call<Folder>("move_folder", { id, parentId }),
    delete: (id: string) => call<void>("delete_folder", { id }),
  },
  sets: {
    list: (query: SetListQuery = {}) =>
      call<StudySetSummary[]>("list_study_sets", {
        query: query.query ?? null,
        folderId: query.folderId ?? null,
        tagId: query.tagId ?? null,
        favoritesOnly: query.favoritesOnly ?? false,
        sort: query.sort ?? "recent",
      }),
    get: (id: string) => call<StudySetDetail>("get_study_set", { id }),
    create: (input: CreateSetInput) => call<StudySetDetail>("create_study_set", { input }),
    update: (id: string, input: UpdateSetInput) =>
      call<StudySetDetail>("update_study_set", { id, input }),
    delete: (id: string) => call<void>("delete_study_set", { id }),
    duplicate: (id: string) => call<StudySetDetail>("duplicate_study_set", { id }),
    favorite: (id: string, favorite: boolean) =>
      call<void>("set_study_set_favorite", { id, favorite }),
    move: (id: string, folderId: string | null) =>
      call<void>("move_study_set", { id, folderId }),
    setTags: (id: string, tags: string[]) =>
      call<string[]>("set_study_set_tags", { id, tags }),
    tags: () => call<Tag[]>("list_tags"),
    deleteTag: (id: string) => call<void>("delete_tag", { id }),
  },
  cards: {
    create: (setId: string, input: CardInput) =>
      call<Flashcard>("create_card", { setId, input }),
    bulkCreate: (setId: string, inputs: CardInput[]) =>
      call<Flashcard[]>("bulk_create_cards", { setId, inputs }),
    update: (id: string, input: CardInput) => call<Flashcard>("update_card", { id, input }),
    delete: (id: string) => call<void>("delete_card", { id }),
    duplicate: (id: string) => call<Flashcard>("duplicate_card", { id }),
    reorder: (setId: string, cardIds: string[]) =>
      call<void>("reorder_cards", { setId, cardIds }),
    attachMedia: (cardId: string, kind: "image" | "audio", path: string) =>
      call<Flashcard>("attach_card_media", { cardId, kind, path }),
    attachMediaBytes: (
      cardId: string,
      kind: "image" | "audio",
      fileName: string,
      data: string,
    ) => call<Flashcard>("attach_card_media_bytes", { cardId, kind, fileName, data }),
    removeMedia: (cardId: string, kind: "image" | "audio") =>
      call<Flashcard>("remove_card_media", { cardId, kind }),
  },
  documents: {
    list: (kind?: string) => call<DocumentSummary[]>("list_documents", { kind: kind ?? null }),
    get: (id: string) => call<ImportedDocument>("get_document", { id }),
    importFile: (path: string, kind: "material" | "notes" = "material") =>
      call<ImportedDocument>("import_document_file", { path, kind }),
    saveText: (title: string, content: string, kind: "material" | "notes" = "material") =>
      call<ImportedDocument>("save_document_text", { title, content, kind }),
    delete: (id: string) => call<void>("delete_document", { id }),
  },
  learning: {
    queue: (setId: string, mode: string, limit = 0) =>
      call<StudyCard[]>("get_learning_queue", { setId, mode, limit }),
    startSession: (setId: string | null, mode: string) =>
      call<string>("start_study_session", { setId, mode }),
    finishSession: (
      sessionId: string,
      cardsStudied: number,
      correct: number,
      incorrect: number,
      durationSeconds: number,
    ) =>
      call<StudySession>("finish_study_session", {
        sessionId,
        cardsStudied,
        correct,
        incorrect,
        durationSeconds,
      }),
    review: (cardId: string, outcome: "correct" | "partial" | "incorrect", mode: string, durationMs = 0) =>
      call("review_card", { cardId, outcome, mode, durationMs }),
    generateTest: (setId: string, config: TestConfig) =>
      call<TestQuestion[]>("generate_test", { setId, config }),
    submitTest: (
      setId: string,
      questions: TestQuestion[],
      answers: TestAnswer[],
      durationSeconds: number,
    ) => call<TestOutcome>("submit_test", { setId, questions, answers, durationSeconds }),
    matchingResult: (setId: string, seconds: number, pairs: number) =>
      call<MatchingOutcome>("record_matching_result", { setId, seconds, pairs }),
    checkAnswer: (cardId: string, answer: string, useAi = false) =>
      call<AnswerFeedback>("check_card_answer", { cardId, answer, useAi }),
    resetProgress: (setId: string) => call<void>("reset_set_progress", { setId }),
  },
  ai: {
    presets: () => call<ProviderPreset[]>("ai_provider_presets"),
    providers: () => call<AiProviderInfo[]>("list_ai_providers"),
    saveProvider: (input: SaveProviderInput) =>
      call<AiProviderInfo>("save_ai_provider", { input }),
    deleteProvider: (id: string) => call<void>("delete_ai_provider", { id }),
    setDefault: (id: string) => call<void>("set_default_ai_provider", { id }),
    testProvider: (id: string) => call<string>("test_ai_provider", { id }),
    models: (
      providerId: string | null,
      kind: string,
      baseUrl: string,
      apiKey: string | null,
    ) =>
      call<string[]>("list_ai_models", {
        providerId,
        kind,
        baseUrl,
        apiKey,
      }),
    generateCards: (request: GenerateCardsRequest) =>
      call<GeneratedCard[]>("ai_generate_flashcards", { request }),
    magicNotes: (request: MagicNotesRequest) =>
      call<MagicNotesResult>("ai_magic_notes", { request }),
    chat: (request: ChatRequest) => call<ChatReply>("ai_chat", { request }),
    conversations: () => call<Conversation[]>("list_conversations"),
    conversation: (id: string) => call<ChatMessage[]>("get_conversation", { id }),
    deleteConversation: (id: string) => call<void>("delete_conversation", { id }),
  },
  transfer: {
    importFile: (path: string) => call<StudySetDetail>("import_study_set_file", { path }),
    importText: (text: string, format: string, title: string) =>
      call<StudySetDetail>("import_study_set_text", { text, format, title }),
    exportSet: (setId: string, format: string, path: string) =>
      call<string>("export_study_set", { setId, format, path }),
    backup: (path: string) => call<string>("backup_database", { path }),
    restore: (path: string) => call<string>("restore_database", { path }),
  },
  insights: {
    dashboard: () => call<DashboardData>("get_dashboard"),
    statistics: (days = 30) => call<StatisticsData>("get_statistics", { days }),
    calendar: (days = 120) => call<DayActivity[]>("get_activity_calendar", { days }),
    setStatistics: (setId: string) => call<SetStatistics>("get_set_statistics", { setId }),
  },
  settings: {
    get: () => call<AppSettings>("get_settings"),
    save: (settings: AppSettings) => call<AppSettings>("save_settings", { settings }),
  },
  appInfo: () => call<AppInfo>("app_info"),
};
