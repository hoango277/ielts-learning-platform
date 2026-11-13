// Kiểu dữ liệu khớp với DTO của backend

export interface VideoCard {
  id: string;
  title: string;
  thumbnail: string;
  duration?: string;
  durationSec?: number;
  views?: string;
  published?: string;
  channel?: { id?: string; name?: string; avatar?: string };
  hasCaptions?: boolean;
  isLive?: boolean;
}

export interface FeedPage {
  items: VideoCard[];
  cursor: string | null;
}

export interface ChannelInfo {
  id: string;
  name: string;
  handle?: string;
  avatar?: string;
  banner?: string;
  subscribers?: string;
  videoCount?: string;
  description?: string;
  tags?: string[];
}

export interface Chip {
  key: string;
  label: string;
}

export interface VideoDetails {
  id: string;
  title: string;
  description: string;
  durationSec: number;
  thumbnail: string;
  views?: number;
  published?: string;
  relativeDate?: string;
  keywords: string[];
  channel: { id?: string; name?: string; avatar?: string; subscribers?: string };
  related: VideoCard[];
  relatedCursor: string | null;
}

export interface TWord {
  w: string;
  s: number;
  e: number;
}

export interface Sentence {
  i: number;
  start: number;
  end: number;
  text: string;
  words: TWord[];
}

export interface CaptionTrack {
  id: string;
  lang: string;
  name: string;
  kind: 'manual' | 'asr';
}

export interface Transcript {
  videoId: string;
  kind: 'manual' | 'asr' | 'upload';
  trackId: string;
  trackName: string;
  wordTimed: boolean;
  sentences: Sentence[];
  tracks: CaptionTrack[];
}

export interface VideoState {
  id: string;
  title: string;
  channel: { id: string | null; name: string | null };
  durationSec: number;
  thumbnail: string;
  saved: boolean;
  lastPosition: number;
  watchSeconds: number;
  shadowCount: number;
  dictationCount: number;
  lastWatchedAt: string | null;
  wordCount: number;
  progress: number;
}

export interface VideoNote {
  id: number;
  time: number | null;
  content: string;
  createdAt: string;
}

export type Provider = 'google' | 'hymt' | 'mymemory';

export interface DictMeaning {
  pos: string;
  definitions: { definition: string; example?: string }[];
  synonyms: string[];
  antonyms: string[];
}

export type WordStatus = 'new' | 'learning' | 'reviewing' | 'mastered' | 'known';

export interface LookupResult {
  term: string;
  lemma: string;
  ipa?: string;
  ipaUk?: string;
  ipaUs?: string;
  audio?: string;
  audioUk?: string;
  audioUs?: string;
  pos?: string;
  translation: string;
  provider: Provider;
  contextual?: { text: string; provider: Provider; method: 'model' | 'match' };
  contextTranslation?: string;
  sense?: { pos: string; definition: string; example?: string };
  dict: { pos: string; posEn?: string; terms: string[] }[];
  meanings: DictMeaning[];
  synonyms: string[];
  examples: string[];
  saved: { id: number; status: WordStatus } | null;
  lexiconId: number | null;
}

export interface Example {
  en: string;
  vi?: string;
  source?: 'video' | 'dictionary' | 'user' | 'topic';
  videoId?: string;
  time?: number;
}

export interface Word {
  id: number;
  term: string;
  pos: string | null;
  ipa: string | null;
  audio: string | null;
  meaning: string;
  definition: string;
  examples: Example[];
  synonyms: string[];
  collocations: string[];
  note: string;
  tags: string[];
  sourceType: 'video' | 'topic' | 'manual';
  videoId: string | null;
  videoTime: number | null;
  videoTitle: string | null;
  topicId: number | null;
  topicName: string | null;
  lexiconId: number | null;
  starred: boolean;
  known: boolean;
  status: WordStatus;
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: string | null;
  correctCount: number;
  wrongCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WordList {
  items: Word[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

export interface WordKey {
  id: number;
  key: string;
  status: WordStatus;
}

export type Preview = Record<1 | 2 | 3 | 4, string>;

export interface ReviewCard extends Word {
  preview: Preview;
}

export interface ReviewSummary {
  dueNow: number;
  dueToday: number;
  learning: number;
  newAvailable: number;
  newTotal: number;
  newLimit: number;
  reviewedToday: number;
}

export interface ReviewResult {
  word: Word;
  card: ReviewCard;
  nextReview: string;
  interval: string;
  xp: number;
}

export type QuestionType =
  | 'mcq_meaning'
  | 'mcq_term'
  | 'mcq_definition'
  | 'cloze'
  | 'listening'
  | 'spelling'
  | 'mcq_collocation'
  | 'mcq_upgrade'
  | 'wordform';

export interface PracticeItem {
  key: string;
  wordId: number | null;
  lexiconId: number | null;
  term: string;
  meaning: string;
  pos: string | null;
  ipa: string | null;
  audio: string | null;
  definition: string;
  examples: Example[];
}

export interface Question {
  id: string;
  type: QuestionType;
  item: PracticeItem;
  prompt: string;
  sentence?: string;
  sentenceVi?: string;
  hint?: string;
  options?: string[];
  answer: string;
  accept?: string[];
  explain?: string;
}

export type PracticeMode = 'quiz' | 'cloze' | 'listening' | 'spelling' | 'match' | 'mixed' | 'collocation' | 'wordform' | 'synonym' | 'upgrade';
export type PracticeSource = 'all' | 'due' | 'weak' | 'new' | 'recent' | 'starred' | 'topic' | 'video';

export interface PracticeSession {
  mode: PracticeMode;
  items: PracticeItem[];
  questions: Question[];
}

export interface Topic {
  id: number;
  slug: string;
  name: string;
  nameVi: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  wordCount: number;
  inNotebook: number;
  mastered: number;
  levels?: Record<string, number>;
  /** "Bộ từ của tôi" — bộ riêng của người đang đăng nhập */
  mine: boolean;
  /** seed = bộ từ IELTS có sẵn · admin = bộ chung do quản trị viên tạo · user = bộ riêng */
  source: 'seed' | 'admin' | 'user';
  /** Người đang đăng nhập được sửa (bộ của mình; bộ chung nếu là quản trị viên) */
  editable: boolean;
}

export interface TopicInput {
  name: string;
  nameVi?: string;
  description?: string;
  icon?: string;
  color?: string;
}

export interface LexiconEntry {
  id: number;
  word: string;
  pos: string | null;
  ipa: string | null;
  ipaUs: string | null;
  audio: string | null;
  audioUs: string | null;
  meaning: string;
  meanings: { pos: string; terms: string[] }[];
  definitions: { pos: string; definition: string; example?: string }[];
  examples: Example[];
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  frequency: number | null;
  level: string | null;
  group: 'core' | 'related' | 'advanced' | null;
  wordId: number | null;
  status: WordStatus | null;
  /** Ai thêm từ này vào bộ: seed (dữ liệu sẵn) | admin | user */
  addedBy?: 'seed' | 'admin' | 'user' | null;
}

export interface Achievement {
  key: string;
  icon: string;
  title: string;
  desc: string;
  progress: number;
  target: number;
  achieved: boolean;
}

export interface Overview {
  today: {
    day: string;
    xp: number;
    goal: number;
    reviews: number;
    newWords: number;
    practiceTotal: number;
    practiceCorrect: number;
    watchMinutes: number;
    shadowSentences: number;
    dictationSentences: number;
  };
  streak: { current: number; best: number; todayDone: boolean };
  level: { level: number; totalXp: number; current: number; needed: number };
  totals: {
    words: number;
    reviews: number;
    shadowSentences: number;
    dictationSentences: number;
    watchMinutes: number;
    practiceAccuracy: number | null;
  };
  statusCounts: Record<WordStatus, number>;
  review: ReviewSummary;
  phraseReview?: { dueNow: number; newAvailable: number; total: number };
  forecast: { day: string; count: number }[];
  heatmap: { day: string; xp: number }[];
  week: { day: string; xp: number; reviews: number; newWords: number; minutes: number }[];
  achievements: Achievement[];
  continueWatching: VideoState[];
  recentWords: Word[];
  wordOfTheDay: LexiconEntry | null;
}

/** Cấu hình chung của máy chủ — chỉ quản trị viên xem/sửa ở trang Quản trị */
export interface ServerSettings {
  translateProvider: 'auto' | 'google' | 'hymt';
  hymtBaseUrl: string;
  hymtModel: string;
  hymtApiKey: string;
  hymtPromptStyle: 'hymt2' | 'hymt15';
  hymtConfigured: boolean;
  allowRegistration: boolean;
}

/** Cài đặt riêng của người dùng — tuỳ chọn học tập */
export interface Settings {
  targetLang: string;
  dailyGoalXp: number;
  newCardsPerDay: number;
  requestRetention: number;
  accent: 'us' | 'uk';
  autoPause: boolean;
  showTranslation: boolean;
  playbackRate: number;
  ttsRate: number;
  shadowRepeat: number;
  vocabLevel: 'A2' | 'B1' | 'B2' | 'C1';
  dailyPlanMode: 'short' | 'standard';
  speakDelaySec: number;
  startScreen: 'auto' | 'off';
  morningReview: boolean;
  notifyReviews: boolean;
}

// ---------- Khởi động khi mở app ----------

export type WarmupReason = 'slept' | 'overdue' | 'due_today';

interface WarmupMeta {
  reason: WarmupReason;
  /** Khả năng còn nhớ hiện tại (0–1) theo FSRS */
  retrievability: number;
  overdueDays: number;
}

export type WarmupItem = (WarmupMeta & { kind: 'word'; card: ReviewCard }) | (WarmupMeta & { kind: 'phrase'; card: PhraseCard });

export interface Warmup {
  items: WarmupItem[];
  overdue: number;
  available: number;
  slept: number;
  morning: boolean;
  budgetSec: number;
}

// ---------- Bài test ước lượng vốn từ ----------

export type PlacementBandKey = 'b1' | 'b2' | 'b3' | 'b4' | 'b5';

export interface PlacementTest {
  items: string[];
  bands: { key: PlacementBandKey; label: string; size: number }[];
  perBand: number;
  pseudo: number;
}

export interface PlacementBand {
  key: PlacementBandKey;
  label: string;
  size: number;
  known: number;
  total: number;
  corrected: number;
}

export interface PlacementResult {
  level: Settings['vocabLevel'];
  size: number;
  falseAlarm: number;
  bands: PlacementBand[];
  warning?: string | null;
  applied?: boolean;
  createdAt?: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  /** admin: quản trị viên (cấu hình máy chủ, người dùng); user: chỉ học */
  role: 'admin' | 'user';
  createdAt: string;
}

export interface AdminUser extends User {
  lastLoginAt: string | null;
  words: number;
}

// ---------- Mẫu câu & cụm từ ----------

export type PhraseStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface Phrase {
  id: number;
  videoId: string | null;
  videoTitle: string | null;
  start: number | null;
  end: number | null;
  sentence: string;
  sentenceVi: string;
  chunk: string;
  chunkVi: string;
  note: string;
  status: PhraseStatus;
  state: number;
  due: string;
  reps: number;
  lapses: number;
  lastReview: string | null;
  speakCount: number;
  bestScore: number | null;
  /** Nhãn thì (câu lưu để luyện thì) */
  tense: TenseForm | null;
  createdAt: string;
}

export interface PhraseCard extends Phrase {
  preview: Preview;
}

export interface PhraseList {
  items: Phrase[];
  total: number;
  page: number;
  limit: number;
  counts: Record<string, number>;
}

export interface PhraseSuggestion {
  text: string;
  source: 'notebook' | 'collocation' | 'topic';
  meaning?: string;
}

// ---------- Luyện nói lại ----------

export type SpeakMode = 'cloze' | 'delayed' | 'own' | 'vi';

export interface SpeakWord {
  id: number;
  term: string;
  meaning: string;
  pos: string | null;
  ipa: string | null;
  audio: string | null;
  collocations: string[];
  example: string | null;
}

export interface SpeakSession {
  mode: SpeakMode;
  phrases: Phrase[];
  words: SpeakWord[];
}

export interface SpeakResult {
  passed: boolean;
  matched: string | null;
  target: string;
  wordCount: number;
  score: number | null;
  xp: number;
}

export interface SpeakStats {
  total: number;
  passed: number;
  ownSentences: number;
  phrases: number;
  chunks: number;
  words: number;
  today: Partial<Record<SpeakMode, number>>;
}

// ---------- Hồ sơ từ ----------

export interface WordProfile {
  term: string;
  lemma: string;
  mainPos: string | null;
  labels: string[];
  family: { word: string; pos: string; meaning?: string }[];
  senses: { pos: string; gloss: string; examples: string[]; synonyms: string[] }[];
  synonyms: { word: string; pos: string | null; gloss: string; freq: number | null; level: string | null; labels: string[]; collocations: string[] }[];
  collocations: { label: string; items: { text: string; vi?: string }[] }[];
  upgrade: { basic: string; note: string } | null;
  occurrences: { videoId: string; videoTitle: string | null; start: number; text: string }[];
  sources: string[];
}

// ---------- 4/3/2 ----------

export interface FluencyTopic {
  id: string;
  title: string;
  vi: string;
  category: 'people' | 'places' | 'objects' | 'events' | 'experiences' | 'opinions';
  prompts: string[];
}

export interface FluencyRound {
  id: number;
  round: number;
  targetSec: number;
  durationSec: number;
  speechSec: number;
  wordCount: number;
  wpm: number;
  pauseCount: number;
  longPauses: number;
  longPausesPerMin: number;
  pauseSec: number;
  meanRun: number;
  fillerCount: number;
  fillersPerMin: number;
  fillers: Record<string, number>;
  transcript: string;
  hasAudio: boolean;
  createdAt: string;
}

export interface FluencySession {
  id: number;
  topic: string;
  prompts: string[];
  notes: string;
  plan: number[];
  completed: boolean;
  createdAt: string;
  rounds: FluencyRound[];
}

export interface FluencyTrendPoint {
  id: number;
  day: string;
  topic: string;
  firstWpm: number;
  lastWpm: number;
  firstPausesPerMin: number;
  lastPausesPerMin: number;
  fillersPerMin: number;
}

// ---------- Độ khó video ----------

export type DifficultyLabel = 'easy' | 'fit' | 'hard';

export type VideoDifficulty =
  | { status: 'analyzing'; done: number; total: number }
  | { status: 'error'; error: string }
  | { status: 'unavailable' }
  | {
      status: 'done';
      vocabLevel: string;
      coverage: number;
      label: DifficultyLabel;
      totalTokens: number;
      newWords: number;
      learningWords: number;
      topNew: { word: string; count: number; level: string | null; sentence: string | null; time: number | null }[];
    };

export interface DifficultyBadge {
  coverage: number;
  label: DifficultyLabel;
  newWords: number;
}

export interface RecommendedVideo extends DifficultyBadge {
  id: string;
  title: string;
  channelName: string | null;
  durationSec: number;
  thumbnail: string;
  watched: boolean;
}

export interface Recommended {
  vocabLevel: string;
  fit: RecommendedVideo[];
  easy: RecommendedVideo[];
  hard: RecommendedVideo[];
  analyzing: number;
}

// ---------- Hôm nay học gì ----------

export type TodayStepKey = 'review' | 'watch' | 'shadow' | 'speak' | 'tenses' | 'fluency';

export interface TodayStep {
  key: TodayStepKey;
  title: string;
  desc: string;
  value: number;
  target: number;
  unit: string;
  link: string;
  blocked: boolean;
  skipped: boolean;
  done: boolean;
}

export interface TodayPlan {
  day: string;
  mode: 'short' | 'standard';
  steps: TodayStep[];
  finished: number;
  total: number;
  allDone: boolean;
  video: { id: string; title: string; channelName: string | null; durationSec: number; thumbnail: string; difficulty: DifficultyBadge | null } | null;
  estimatedMinutes: number;
}

// ---------- Thì (module học thì theo ý nghĩa) ----------

export type TenseForm =
  | 'present-simple'
  | 'present-continuous'
  | 'past-simple'
  | 'past-continuous'
  | 'present-perfect'
  | 'present-perfect-continuous'
  | 'past-perfect'
  | 'future-will'
  | 'future-going-to';
export type VerbForm = TenseForm | 'past-perfect-continuous' | 'future-continuous' | 'future-perfect' | 'modal';
export type TenseLessonId = 'present-simple' | 'continuous' | 'past-simple' | 'present-perfect' | 'future' | 'past-perfect';
export type TenseLevel = 'A2' | 'B1' | 'B2';

export interface TenseStats {
  understand: number | null;
  use: number | null;
  speakMs: number | null;
  typeMs: number | null;
  attempts: number;
}

export type TimelineMark =
  | { type: 'point'; at: number; label?: string; tone?: 'main' | 'other' }
  | { type: 'span'; from: number; to: number; label?: string; tone?: 'main' | 'other'; open?: 'left' | 'right' | 'both' }
  | { type: 'repeat'; from: number; to: number; label?: string }
  | { type: 'progress'; from: number; to: number; label?: string; tone?: 'main' | 'other' }
  | { type: 'link'; from: number; to: number; label?: string }
  | { type: 'ref'; at: number; label: string };

export interface TimelineSpec {
  now?: number;
  marks: TimelineMark[];
  caption?: string;
}

export interface TenseExample {
  en: string;
  vi: string;
}

export interface TenseLesson {
  id: TenseLessonId;
  order: number;
  title: string;
  emoji: string;
  idea: string;
  summary: string;
  forms: TenseForm[];
  uses: { title: string; explain: string; timeline: TimelineSpec; examples: TenseExample[]; form: TenseForm }[];
  shapes: { form: TenseForm; affirmative: string; negative: string; question: string }[];
  ccq: { sentence: string; question: string; answer: boolean; explain: string }[];
  contrasts: { a: TenseExample & { form: TenseForm }; b: TenseExample & { form: TenseForm }; question: string; answerA: string; answerB: string; explain: string }[];
  vietnamese: { marker: string; english: string; note: string }[];
  traps: { wrong: string; right: string; why: string }[];
  signals: { words: string[]; note: string };
  chunks: TenseExample[];
  pronunciation?: { title: string; items: { text: string; note: string }[] };
}

export interface TenseKindCounts {
  meaning: number;
  ccq: number;
  listen: number;
  produce: number;
}

export interface TenseLessonSummary {
  id: TenseLessonId;
  order: number;
  title: string;
  emoji: string;
  idea: string;
  summary: string;
  forms: TenseForm[];
  counts: TenseKindCounts;
  stats: TenseStats;
}

export interface TensesOverview {
  lessons: TenseLessonSummary[];
  forms: (TenseStats & { form: TenseForm; label: string })[];
  today: { done: number; target: number };
  totals: { attempts: number; writings: number; items: number; prompts: number };
}

export interface TensePrompt {
  id: string;
  lesson: TenseLessonId | 'mixed';
  title: string;
  prompt: string;
  guide: string[];
  targets: TenseForm[];
  targetLabels: string[];
  minSentences: number;
  model: string;
  ielts?: 'speaking' | 'task1' | 'task2';
}

export interface TenseLessonDetail {
  lesson: TenseLesson;
  formLabels: Record<string, string>;
  counts: TenseKindCounts;
  stats: TenseStats;
  videoExamples: { id: number; sentence: string; chunk: string; videoId: string; start: number | null; tense: TenseForm; videoTitle: string | null }[];
  prompts: TensePrompt[];
}

interface TenseItemBase {
  id: string;
  lesson: TenseLessonId;
  form: TenseForm;
  level: TenseLevel;
  formLabel: string;
  task: 'recognize' | 'speak' | 'type' | 'fix';
}

export type TenseSessionItem =
  | (TenseItemBase & { kind: 'meaning'; sentence: string; question?: string; options: string[]; answer: number; explain: string })
  | (TenseItemBase & { kind: 'ccq'; sentence: string; question: string; answer: boolean; explain: string })
  | (TenseItemBase & { kind: 'listen'; options: { text: string; form: TenseForm; meaning: string }[]; explain: string })
  | (TenseItemBase & {
      kind: 'produce';
      cueType: 'translate' | 'situation';
      cue: string;
      answers: string[];
      verb: string;
      accept: TenseForm[];
      wrong: string[];
      hint: string;
      explain: string;
      wrongSentence?: string;
    });

export type TensePracticeMode = 'recognize' | 'speak' | 'type' | 'fix' | 'mixed';

export interface TenseSession {
  mode: TensePracticeMode;
  lesson: TenseLessonId | null;
  items: TenseSessionItem[];
}

export interface TenseIssueDTO {
  type: string;
  text: string;
  hint: string;
  explain?: string;
  fix?: string;
}

export interface TenseCheckResult {
  correct: boolean;
  reason: 'ok' | 'wrong-form' | 'no-verb' | 'issue' | 'unchanged';
  used: VerbForm | null;
  usedLabel: string | null;
  usedText: string | null;
  paraphrase: boolean;
  acceptLabels: string[];
  issues: TenseIssueDTO[];
  hint?: string;
  answer?: string;
  answers?: string[];
  explain?: string;
  xp: number;
  addedCard: boolean;
}

export interface TenseAnalysis {
  sentences: {
    text: string;
    offset: number;
    verbs: { text: string; form: VerbForm; lemma: string; parts: [number, number][]; label: string }[];
    issues: { type: string; start: number; end: number; text: string; hint: string; explain: string; fix?: string }[];
  }[];
  counts: { form: VerbForm; label: string; count: number }[];
  issueCount: number;
}

export interface TenseWritingResult {
  analysis: TenseAnalysis;
  targets: { form: TenseForm; label: string; used: boolean }[];
  sentenceCount: number;
  minSentences: number;
  enough: boolean;
  xp: number;
  model: string;
}

export interface TenseWriting {
  id: number;
  promptId: string;
  title: string;
  text: string;
  issueCount: number;
  createdAt: string;
}

export interface WordTenseSpan {
  from: number;
  to: number;
  form: VerbForm;
  g: number;
}

export interface VideoTenses {
  videoId: string;
  trackId: string;
  sentences: Record<number, WordTenseSpan[]>;
  counts: Partial<Record<VerbForm, number>>;
  labels: Record<VerbForm, string>;
}

export interface TenseReportRow {
  id: number;
  videoId: string | null;
  sentence: string;
  verb: string;
  form: string;
  formLabel: string;
  note: string;
  userName: string | null;
  createdAt: string;
}
