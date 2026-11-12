import type {
  ChannelInfo,
  DifficultyBadge,
  FluencySession,
  FluencyTopic,
  FluencyTrendPoint,
  FluencyRound,
  Phrase,
  PhraseCard,
  PlacementResult,
  PlacementTest,
  Warmup,
  PhraseList,
  PhraseSuggestion,
  Recommended,
  SpeakMode,
  SpeakResult,
  SpeakSession,
  SpeakStats,
  TodayPlan,
  TodayStepKey,
  VideoDifficulty,
  WordProfile,
  Chip,
  FeedPage,
  LexiconEntry,
  LookupResult,
  Overview,
  PracticeMode,
  PracticeSession,
  PracticeSource,
  ReviewCard,
  ReviewResult,
  ReviewSummary,
  Settings,
  ServerSettings,
  AdminUser,
  Topic,
  TopicInput,
  Transcript,
  User,
  VideoDetails,
  VideoNote,
  VideoState,
  Word,
  WordKey,
  WordList,
} from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

async function request<T>(path: string, opts: { method?: string; body?: unknown; query?: Query; signal?: AbortSignal } = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const url = `/api${path}${qs.size ? `?${qs}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Không kết nối được máy chủ. Hãy kiểm tra backend (npm run dev).');
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* phản hồi không phải JSON */
  }
  // Phiên hết hạn / bị đăng xuất → báo cho ứng dụng chuyển về trang đăng nhập
  if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth:unauthorized'));
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Lỗi ${res.status}`);
  return data as T;
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} });

export interface SearchFilters {
  duration?: 'short' | 'medium' | 'long';
  uploadDate?: 'today' | 'week' | 'month' | 'year';
  sortBy?: 'relevance' | 'upload_date' | 'view_count' | 'rating';
  captions?: boolean;
}

export interface WordFilters {
  q?: string;
  status?: string;
  source?: string;
  topicId?: number;
  videoId?: string;
  tag?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export const api = {
  // Tài khoản
  authStatus: () => request<{ hasUsers: boolean; registrationOpen: boolean }>('/auth/status'),
  me: () => request<{ user: User | null }>('/auth/me'),
  login: (body: { email: string; password: string; remember: boolean }) => post<{ user: User }>('/auth/login', body),
  register: (body: { name: string; email: string; password: string; remember: boolean }) =>
    post<{ user: User; claimedLegacyData: boolean }>('/auth/register', body),
  logout: () => post<{ ok: true }>('/auth/logout'),
  updateProfile: (name: string) => request<{ user: User }>('/auth/me', { method: 'PATCH', body: { name } }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    post<{ ok: true; otherSessionsClosed: number }>('/auth/password', body),

  // YouTube
  chips: () => request<Chip[]>('/youtube/chips'),
  feed: (chip: string, cursor?: string | null) => request<FeedPage>('/youtube/feed', { query: { chip, cursor } }),
  search: (q: string, f: SearchFilters, cursor?: string | null) =>
    request<FeedPage>('/youtube/search', {
      query: { q, cursor, duration: f.duration, uploadDate: f.uploadDate, sortBy: f.sortBy, captions: f.captions === false ? '0' : '1' },
    }),
  suggest: (q: string, signal?: AbortSignal) => request<string[]>('/youtube/suggest', { query: { q }, signal }),
  channels: () => request<ChannelInfo[]>('/youtube/channels'),
  channelVideos: (id: string, cursor?: string | null) =>
    request<FeedPage & { channel: ChannelInfo | null }>(`/youtube/channels/${id}/videos`, { query: { cursor } }),
  video: (id: string) => request<VideoDetails>(`/youtube/videos/${id}`),
  related: (cursor: string) => request<FeedPage>('/youtube/related', { query: { cursor } }),
  transcript: (id: string, track?: string, refresh?: boolean) =>
    request<Transcript>(`/youtube/videos/${id}/transcript`, { query: { track, refresh: refresh ? '1' : undefined } }),
  uploadTranscript: (id: string, content: string) => post<Transcript>(`/youtube/videos/${id}/transcript`, { content }),
  deleteUploadedTranscript: (id: string) => request<{ ok: true }>(`/youtube/videos/${id}/transcript`, { method: 'DELETE' }),

  // Video của tôi
  videos: (filter: 'history' | 'saved') => request<VideoState[]>('/videos', { query: { filter } }),
  videoState: (id: string) => request<VideoState | null>(`/videos/${id}`),
  progress: (id: string, body: { title?: string; channelId?: string; channelName?: string; durationSec?: number; position?: number; watchedSeconds?: number }) =>
    post<{ ok: true }>(`/videos/${id}/progress`, body),
  setSaved: (id: string, body: { saved: boolean; title?: string; channelName?: string; durationSec?: number }) =>
    request<VideoState>(`/videos/${id}/saved`, { method: 'PUT', body }),
  removeHistory: (id: string) => request<{ ok: true }>(`/videos/${id}/history`, { method: 'DELETE' }),
  sentencePractice: (id: string, body: { kind: 'shadow' | 'dictation'; score?: number }) => post<{ xp: number }>(`/videos/${id}/practice`, body),
  notes: (id: string) => request<VideoNote[]>(`/videos/${id}/notes`),
  addNote: (id: string, body: { content: string; time?: number | null }) => post<VideoNote>(`/videos/${id}/notes`, body),
  deleteNote: (id: string, noteId: number) => request<{ ok: true }>(`/videos/${id}/notes/${noteId}`, { method: 'DELETE' }),

  // Dịch & tra từ
  lookup: (term: string, context?: string, signal?: AbortSignal) => request<LookupResult>('/lookup', { query: { term, context }, signal }),
  translate: (text: string, opts: { context?: string; provider?: string } = {}) =>
    post<{ translation: string; provider: string; contextual: boolean }>('/translate', { text, ...opts }),
  translateBatch: (texts: string[]) => post<{ translations: string[]; provider: string }>('/translate/batch', { texts }),
  providers: () => request<{ active: string; setting: string; hymtConfigured: boolean }>('/translate/providers'),
  testHymt: (cfg: Partial<ServerSettings>) =>
    post<{ ok: boolean; message: string; latencyMs?: number; sample?: string }>('/translate/hymt/test', cfg),

  // Sổ từ vựng
  words: (f: WordFilters) => request<WordList>('/words', { query: { ...f } }),
  wordKeys: () => request<WordKey[]>('/words/keys'),
  tags: () => request<string[]>('/words/tags'),
  word: (id: number) => request<Word>(`/words/${id}`),
  createWord: (body: {
    term: string;
    meaning?: string;
    context?: string;
    contextVi?: string;
    videoId?: string;
    videoTime?: number;
    lexiconId?: number;
    tags?: string[];
    note?: string;
    known?: boolean;
  }) => post<{ word: Word; existed: boolean }>('/words', body),
  updateWord: (id: number, body: Partial<Omit<Word, 'id'>>) => request<Word>(`/words/${id}`, { method: 'PATCH', body }),
  deleteWord: (id: number) => request<{ ok: true }>(`/words/${id}`, { method: 'DELETE' }),
  resetWord: (id: number) => post<Word>(`/words/${id}/reset`),
  bulk: (body: { action: string; ids: number[]; tag?: string }) => post<{ ok: true; count: number }>('/words/bulk', body),
  occurrences: (id: number) =>
    request<{ videoId: string; videoTitle: string | null; start: number; end: number; text: string }[]>(`/words/${id}/occurrences`),
  exportUrl: (format: 'csv' | 'anki') => `/api/words/export?format=${format}`,

  // Ôn tập
  reviewQueue: (opts: { topicId?: number; limit?: number } = {}) =>
    request<{ cards: ReviewCard[]; summary: ReviewSummary; phrases: PhraseCard[]; phraseSummary: { dueNow: number; newAvailable: number; total: number } }>(
      '/review/queue',
      { query: opts },
    ),
  reviewSummary: () => request<ReviewSummary>('/review/summary'),
  review: (id: number, rating: 1 | 2 | 3 | 4) => post<ReviewResult>(`/review/${id}`, { rating }),
  undoReview: () => post<{ card: ReviewCard | null; phrase: PhraseCard | null }>('/review/undo'),

  // Luyện tập
  practiceSession: (p: { mode: PracticeMode; source: PracticeSource; topicId?: number; videoId?: string; count?: number }) =>
    request<PracticeSession>('/practice/session', { query: p }),
  practiceAnswer: (body: { wordId: number | null; correct: boolean; mode: string }) =>
    post<{ ok: true; rescheduled: boolean; xp: number }>('/practice/answer', body),
  practiceComplete: (body: { mode: string; total: number; correct: number; durationSec: number }) =>
    post<{ bonusXp: number; accuracy: number }>('/practice/complete', body),

  // Chủ đề
  topics: () => request<Topic[]>('/topics'),
  topic: (slug: string) => request<{ topic: Topic; words: LexiconEntry[] }>(`/topics/${slug}`),
  addTopicWords: (slug: string, body: { lexiconIds?: number[]; known?: boolean }) =>
    post<{ added: number; updated: number; total: number }>(`/topics/${slug}/words`, body),
  lexicon: (id: number) => request<LexiconEntry & { topics: { slug: string; name: string; icon: string }[] }>(`/lexicon/${id}`),
  /** Tạo "Bộ từ của tôi" (shared = bộ chung cho mọi người — chỉ quản trị viên) */
  createTopic: (body: TopicInput & { shared?: boolean }) => post<Topic>('/topics', body),
  updateTopic: (slug: string, body: Partial<TopicInput>) => request<Topic>(`/topics/${slug}`, { method: 'PATCH', body }),
  deleteTopic: (slug: string) => request<{ ok: true }>(`/topics/${slug}`, { method: 'DELETE' }),
  /** Thêm từ/cụm từ vào bộ: máy chủ tự tra nghĩa, phiên âm, ví dụ nếu kho từ chưa có (vài giây) */
  addTopicEntry: (slug: string, body: { term: string; group?: 'core' | 'related' | 'advanced' }) =>
    post<{ word: LexiconEntry; created: boolean; alreadyInTopic: boolean }>(`/topics/${slug}/entries`, body),
  removeTopicEntry: (slug: string, lexiconId: number) => request<{ ok: true }>(`/topics/${slug}/entries/${lexiconId}`, { method: 'DELETE' }),

  // Hồ sơ từ
  wordProfile: (term: string) => request<WordProfile>(`/words/profile/${encodeURIComponent(term)}`),
  upgrades: () =>
    request<{ basic: string; pos: string; upgrades: { word: string; vi: string; note: string }[]; inNotebook: string[] }[]>('/practice/upgrades'),

  // Mẫu câu
  phrases: (f: { q?: string; videoId?: string; status?: string; page?: number; limit?: number } = {}) => request<PhraseList>('/phrases', { query: f }),
  suggestChunks: (sentence: string) => request<PhraseSuggestion[]>('/phrases/suggest', { query: { sentence } }),
  videoPhrases: (videoId: string) => request<{ id: number; start: number | null; key: string; chunk: string }[]>(`/phrases/video/${videoId}`),
  createPhrase: (body: { sentence: string; chunk?: string; videoId?: string; start?: number; end?: number; sentenceVi?: string; note?: string }) =>
    post<{ phrase: Phrase; existed: boolean }>('/phrases', body),
  updatePhrase: (id: number, body: { chunk?: string; chunkVi?: string; sentenceVi?: string; note?: string }) =>
    request<Phrase>(`/phrases/${id}`, { method: 'PATCH', body }),
  deletePhrase: (id: number) => request<{ ok: true }>(`/phrases/${id}`, { method: 'DELETE' }),
  reviewPhrase: (id: number, rating: 1 | 2 | 3 | 4, mode?: string) =>
    post<{ phrase: PhraseCard; nextReview: string; interval: string; xp: number }>(`/phrases/${id}/review`, { rating, mode }),

  // Luyện nói lại
  speakingSession: (p: { mode: SpeakMode; count?: number; videoId?: string }) => request<SpeakSession>('/speaking/session', { query: p }),
  speakingStats: () => request<SpeakStats>('/speaking/stats'),
  speakAttempt: (body: { mode: SpeakMode; phraseId?: number; wordId?: number; transcript: string; score?: number }) =>
    post<SpeakResult>('/speaking/attempts', body),
  saveOwnExample: (body: { wordId: number; sentence: string }) => post<{ ok: true; xp: number }>('/speaking/own-example', body),

  // 4/3/2
  fluencyTopics: () => request<FluencyTopic[]>('/fluency/topics'),
  fluencySessions: () => request<{ sessions: FluencySession[]; trend: FluencyTrendPoint[] }>('/fluency/sessions'),
  fluencySession: (id: number) => request<FluencySession>(`/fluency/sessions/${id}`),
  createFluencySession: (body: { topicId?: string; topic?: string; prompts?: string[]; notes?: string; plan?: 'standard' | 'short' }) =>
    post<FluencySession>('/fluency/sessions', body),
  updateFluencyNotes: (id: number, notes: string) => request<FluencySession>(`/fluency/sessions/${id}`, { method: 'PATCH', body: { notes } }),
  deleteFluencySession: (id: number) => request<{ ok: true }>(`/fluency/sessions/${id}`, { method: 'DELETE' }),
  saveFluencyRound: (
    id: number,
    body: { round: number; targetSec: number; durationSec: number; speechSec: number; pauseCount: number; longPauses: number; pauseSec: number; transcript: string },
  ) => post<{ round: FluencyRound; xp: number }>(`/fluency/sessions/${id}/rounds`, body),
  uploadFluencyAudio: async (roundId: number, blob: Blob) => {
    const res = await fetch(`/api/fluency/rounds/${roundId}/audio`, { method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
    if (!res.ok) throw new ApiError(res.status, 'Không lưu được ghi âm');
    return (await res.json()) as { ok: true; bytes: number };
  },
  fluencyAudioUrl: (roundId: number) => `/api/fluency/rounds/${roundId}/audio`,

  // Độ khó video & gợi ý
  videoDifficulty: (id: string) => request<VideoDifficulty>(`/videos/${id}/difficulty`),
  difficultyBatch: (ids: string[]) => post<Record<string, DifficultyBadge>>('/videos/difficulty', { ids }),
  recommended: () => request<Recommended>('/videos/recommended'),

  // Hôm nay học gì
  warmup: () => request<Warmup>('/review/warmup'),

  // Thông báo đẩy
  pushPublicKey: () => request<{ publicKey: string; subscriptions: number }>('/push/public-key'),
  pushSubscribe: (sub: PushSubscriptionJSON) => post<{ subscriptions: number }>('/push/subscribe', sub),
  pushUnsubscribe: (endpoint: string) => post<{ subscriptions: number }>('/push/unsubscribe', { endpoint }),
  pushTest: () => post<{ sent: number; failed: number }>('/push/test'),

  // Bài test vốn từ
  placementTest: () => request<PlacementTest>('/placement/test'),
  placementLast: () => request<PlacementResult | null>('/placement/last'),
  placementResult: (body: { answers: { word: string; known: boolean }[]; apply: boolean }) => post<PlacementResult>('/placement/result', body),
  today: () => request<TodayPlan>('/today'),
  skipTodayStep: (step: TodayStepKey, skipped: boolean) => post<TodayPlan>('/today/skip', { step, skipped }),
  setTodayVideo: (videoId: string | null) => request<TodayPlan>('/today/video', { method: 'PUT', body: { videoId } }),

  // Thống kê & cài đặt
  overview: () => request<Overview>('/stats/overview'),
  // Quản trị (chỉ admin; người dùng thường nhận lỗi 403)
  adminSettings: () => request<ServerSettings>('/admin/settings'),
  updateAdminSettings: (body: Partial<ServerSettings>) => request<ServerSettings>('/admin/settings', { method: 'PUT', body }),
  adminUsers: () => request<AdminUser[]>('/admin/users'),
  setUserRole: (id: number, role: AdminUser['role']) => request<User>(`/admin/users/${id}`, { method: 'PATCH', body: { role } }),
  settings: () => request<Settings>('/settings'),
  updateSettings: (body: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body }),
};
