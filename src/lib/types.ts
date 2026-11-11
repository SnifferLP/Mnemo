export type Theme = "dark" | "light" | "system";
export type DisplayFont = "editorial" | "modern";
export type Language = "en" | "de";
export type UpdateChannel = "stable" | "prerelease";

export interface AppSettings {
  theme: Theme;
  accent: string;
  displayFont: DisplayFont;
  language: Language;
  displayName: string;
  dailyGoal: number;
  dailyGoalMinutes: number;
  newCardsPerSession: number;
  answerCaseSensitive: boolean;
  answerTolerance: number;
  aiGradingEnabled: boolean;
  defaultProviderId: string | null;
  aiShareSet: boolean;
  aiShareGaps: boolean;
  aiShareHistory: boolean;
  aiCardBatch: number;
  sidebarCollapsed: boolean;
  shuffleCards: boolean;
  animations: boolean;
  updateChannel: UpdateChannel;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderNode {
  folder: Folder;
  setCount: number;
}

export interface StudySet {
  id: string;
  title: string;
  description: string;
  folderId: string | null;
  languageFront: string;
  languageBack: string;
  isFavorite: boolean;
  source: string;
  createdAt: string;
  updatedAt: string;
  lastStudiedAt: string | null;
  archivedAt: string | null;
}

export interface StudySetSummary extends StudySet {
  folderName: string | null;
  cardCount: number;
  masteredCount: number;
  dueCount: number;
  reviewedCount: number;
  correctCount: number;
  tags: string[];
}

export interface Flashcard {
  id: string;
  setId: string;
  position: number;
  front: string;
  back: string;
  explanation: string;
  hint: string;
  cardType: string;
  imagePath: string | null;
  audioPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardProgress {
  cardId: string;
  setId: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  learningStep: number;
  state: "new" | "learning" | "relearning" | "review";
  dueAt: string | null;
  lastReviewedAt: string | null;
  correctCount: number;
  wrongCount: number;
  difficulty: number;
  streak: number;
}

export interface StudyCard {
  card: Flashcard;
  progress: CardProgress;
  mastery: number;
}

export interface StudySetDetail {
  set: StudySet;
  cards: StudyCard[];
  tags: string[];
  folderName: string | null;
  masteredCount: number;
  dueCount: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface CardInput {
  front: string;
  back: string;
  explanation?: string;
  hint?: string;
  cardType?: string;
}

export interface CreateSetInput {
  title: string;
  description?: string;
  folderId?: string | null;
  languageFront?: string;
  languageBack?: string;
  source?: string;
  tags?: string[];
  cards?: CardInput[];
}

export interface UpdateSetInput {
  title: string;
  description?: string;
  folderId?: string | null;
  languageFront?: string;
  languageBack?: string;
}

export interface DayActivity {
  date: string;
  reviews: number;
  correct: number;
  minutes: number;
  cards: number;
}

export interface Totals {
  sets: number;
  cards: number;
  mastered: number;
  dueToday: number;
  reviewsToday: number;
  correctToday: number;
  minutesToday: number;
  streakDays: number;
  longestStreak: number;
  studiedToday: boolean;
  accuracy7d: number;
  reviews7d: number;
  studyMinutes7d: number;
  dailyGoal: number;
  goalProgress: number;
}

export interface TestResultSummary {
  id: string;
  setId: string;
  setTitle: string | null;
  score: number;
  total: number;
  durationSeconds: number;
  createdAt: string;
}

export interface StudySession {
  id: string;
  setId: string | null;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  cardsStudied: number;
  correctCount: number;
  incorrectCount: number;
}

export interface DashboardData {
  totals: Totals;
  recentSets: StudySetSummary[];
  continueSets: StudySetSummary[];
  favorites: StudySetSummary[];
  reviewsDue: StudySetSummary[];
  activity: DayActivity[];
  recentTests: TestResultSummary[];
  recentSessions: StudySession[];
}

export interface ModeStat {
  mode: string;
  reviews: number;
  correct: number;
  minutes: number;
}

export interface SetStat {
  setId: string;
  title: string;
  cards: number;
  mastered: number;
  due: number;
  reviews: number;
  accuracy: number;
  minutes: number;
}

export interface MasteryBucket {
  label: string;
  count: number;
  color: string;
}

export interface StatisticsData {
  totals: Totals;
  daily: DayActivity[];
  modes: ModeStat[];
  sets: SetStat[];
  masteryBuckets: MasteryBucket[];
  rangeDays: number;
}

export interface CardStat {
  cardId: string;
  front: string;
  back: string;
  state: string;
  mastery: number;
  correct: number;
  wrong: number;
  intervalDays: number;
  dueAt: string | null;
}

export interface SetStatistics {
  setId: string;
  title: string;
  cards: number;
  mastered: number;
  learning: number;
  newCards: number;
  due: number;
  accuracy: number;
  reviews: number;
  minutes: number;
  daily: DayActivity[];
  tests: TestResultSummary[];
  matchingBest: number | null;
  cardsDetail: CardStat[];
}

export interface TestPair {
  left: string;
  right: string;
  optionIndex: number;
}

export interface TestQuestion {
  id: string;
  kind: string;
  cardId: string;
  prompt: string;
  options: string[];
  correctIndex: number | null;
  correctAnswer: string;
  pairs: TestPair[];
  explanation: string;
}

export interface TestConfig {
  questionTypes: string[];
  count: number;
  timeLimitSeconds: number | null;
}

export interface TestAnswer {
  questionId: string;
  text?: string | null;
  optionIndex?: number | null;
  mapping?: number[] | null;
}

export interface GradedQuestion {
  questionId: string;
  cardId: string;
  kind: string;
  prompt: string;
  userAnswer: string;
  correctAnswer: string;
  correct: boolean;
  partial: boolean;
  credit: number;
  explanation: string;
}

export interface TestOutcome {
  id: string;
  score: number;
  total: number;
  correct: number;
  partial: number;
  incorrect: number;
  questions: GradedQuestion[];
}

export interface AnswerFeedback {
  correct: boolean;
  partial: boolean;
  similarity: number;
  expected: string;
  given: string;
  aiFeedback: string | null;
  aiUsed: boolean;
  aiNote: string | null;
}

export interface MatchingOutcome {
  bestSeconds: number;
  previousBest: number | null;
  isNewBest: boolean;
}

export interface AiProviderInfo {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  temperature: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPreset {
  kind: string;
  label: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  note: string;
}

export interface SaveProviderInput {
  id?: string | null;
  name: string;
  kind: string;
  baseUrl: string;
  model: string;
  apiKey?: string | null;
  temperature?: number;
  isDefault?: boolean;
}

export interface GeneratedCard {
  front: string;
  back: string;
  explanation: string;
  hint: string;
}

export interface GenerateCardsRequest {
  providerId?: string | null;
  sourceText: string;
  documentIds: string[];
  setId?: string | null;
  count: number;
  difficulty: string;
  detailLevel: string;
  language: string;
  cardFormat: string;
  focus: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  providerId: string | null;
  setId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatReply {
  conversationId: string;
  message: ChatMessage;
  title: string;
}

export interface ChatRequest {
  conversationId?: string | null;
  providerId?: string | null;
  setId?: string | null;
  message: string;
  mode: string;
  shareSet: boolean;
  shareGaps: boolean;
  shareHistory: boolean;
}

export interface Definition {
  term: string;
  definition: string;
}

export interface QuizItem {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

export interface MagicNotesResult {
  summary: string;
  keyPoints: string[];
  definitions: Definition[];
  cards: GeneratedCard[];
  quiz: QuizItem[];
  studyGuide: string;
}

export interface MagicNotesRequest {
  providerId?: string | null;
  sourceText: string;
  documentIds: string[];
  title: string;
  language: string;
  cardCount: number;
}

export interface DocumentSummary {
  id: string;
  title: string;
  sourceName: string | null;
  format: string;
  charCount: number;
  kind: string;
  createdAt: string;
}

export interface ImportedDocument extends DocumentSummary {
  content: string;
}

export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
  mediaDir: string;
}

export interface UpdateSupport {
  supported: boolean;
  currentVersion: string;
  message: string | null;
}

export interface UpdateCandidate {
  version: string;
  currentVersion: string;
  notes: string | null;
  publishedAt: string | null;
  releaseUrl: string;
  channel: UpdateChannel;
}

export interface UpdateProgress {
  stage: "started" | "progress" | "installing" | "finished";
  downloaded: number;
  contentLength: number | null;
}

export interface UpdateInstallResult {
  version: string;
  restartRequired: boolean;
}

export type StudyMode =
  | "flashcards"
  | "adaptive"
  | "write"
  | "spaced"
  | "test"
  | "matching";
