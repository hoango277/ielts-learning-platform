import { z } from 'zod';
import { ALL_ITEMS, ALL_PROMPTS, ITEM_BY_ID, LESSON_BY_ID, LESSONS, PROMPT_BY_ID } from '../data/tenses/index.ts';
import { LESSON_IDS, type LessonId, type ProduceItem, type TenseItem, type WritingPrompt } from '../data/tenses/types.ts';
import { all, get, run } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { analyzeSentence, analyzeText, checkProduction, FORM_LABEL, TENSE_FORMS, tenseSpansForWords, type TenseForm, type VerbForm, type WordTenseSpan } from '../lib/tense.ts';
import { localDay } from '../lib/time.ts';
import { addActivity, XP } from './activity.service.ts';
import { createSession as createFluencySession } from './fluency.service.ts';
import { createPhrase } from './phrases.service.ts';
import { getSettings } from './settings.service.ts';
import { getTranscript } from './transcript.service.ts';

/**
 * Module "Thì": học thì theo ý nghĩa (6 bài) → nhận ra trong câu → nói/gõ phản xạ có đo thời gian → viết đoạn có soát thì.
 * Mỗi lượt được ghi lại (tense_attempts) để tính 3 chỉ số cho từng thì: Hiểu, Dùng, Phản xạ.
 */

const notFound = (what: string): never => {
  throw Object.assign(new Error(`Không tìm thấy ${what}`), { status: 404 });
};

// ---------- Chỉ số tiến bộ ----------

interface AttemptRow {
  item_id: string;
  lesson: string;
  form: string;
  skill: 'understand' | 'use';
  mode: string;
  correct: number;
  latency_ms: number | null;
  created_at: string;
}

function recentAttempts(limit = 1500): AttemptRow[] {
  return all<AttemptRow>(
    'SELECT item_id, lesson, form, skill, mode, correct, latency_ms, created_at FROM tense_attempts WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    currentUserId(),
    limit,
  );
}

const pct = (rows: AttemptRow[]) => (rows.length ? Math.round((rows.filter((r) => r.correct).length / rows.length) * 100) : null);
function median(nums: number[]) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

export interface TenseStats {
  /** % đúng ở bài nhận ra (20 lượt gần nhất) */
  understand: number | null;
  /** % đúng khi tự nói / gõ (20 lượt gần nhất) */
  use: number | null;
  /** thời gian phản hồi (trung vị, ms) của các câu nói đúng gần đây */
  speakMs: number | null;
  /** thời gian gõ xong (trung vị, ms) của các câu gõ đúng gần đây */
  typeMs: number | null;
  attempts: number;
}

function statsOf(rows: AttemptRow[]): TenseStats {
  const und = rows.filter((r) => r.skill === 'understand').slice(0, 20);
  const use = rows.filter((r) => r.skill === 'use').slice(0, 20);
  const ms = (mode: string) =>
    median(
      rows
        .filter((r) => r.mode === mode && r.correct && r.latency_ms != null)
        .slice(0, 15)
        .map((r) => r.latency_ms!),
    );
  return { understand: pct(und), use: pct(use), speakMs: ms('speak'), typeMs: ms('type'), attempts: rows.length };
}

const itemsOf = (lesson: LessonId) => ALL_ITEMS.filter((i) => i.lesson === lesson);
const kindCount = (items: TenseItem[]) => ({
  meaning: items.filter((i) => i.kind === 'meaning').length,
  ccq: items.filter((i) => i.kind === 'ccq').length,
  listen: items.filter((i) => i.kind === 'listen').length,
  produce: items.filter((i) => i.kind === 'produce').length,
});

export const DAILY_TARGET = { standard: 10, short: 5 } as const;

/** Số câu luyện thì hôm nay (kế hoạch "Hôm nay học gì") */
export function todayTenseItems() {
  return get<{ n: number }>('SELECT tense_items AS n FROM activity WHERE user_id = ? AND day = ?', currentUserId(), localDay())?.n ?? 0;
}

const promptDTO = (p: WritingPrompt) => ({ ...p, targetLabels: p.targets.map((f) => FORM_LABEL[f]) });

export function overview() {
  const rows = recentAttempts();
  const lessons = LESSONS.map((l) => ({
    id: l.id,
    order: l.order,
    title: l.title,
    emoji: l.emoji,
    idea: l.idea,
    summary: l.summary,
    forms: l.forms,
    counts: kindCount(itemsOf(l.id)),
    stats: statsOf(rows.filter((r) => r.lesson === l.id)),
  }));
  const forms = TENSE_FORMS.map((f) => ({ form: f, label: FORM_LABEL[f], ...statsOf(rows.filter((r) => r.form === f)) }));
  const writings = get<{ n: number }>('SELECT COUNT(*) AS n FROM tense_writings WHERE user_id = ?', currentUserId())?.n ?? 0;
  return {
    lessons,
    forms,
    today: { done: todayTenseItems(), target: DAILY_TARGET[getSettings().dailyPlanMode] },
    totals: { attempts: rows.length, writings, items: ALL_ITEMS.length, prompts: ALL_PROMPTS.length },
  };
}

export function lessonDetail(id: string) {
  const lesson = LESSON_BY_ID.get(id as LessonId) ?? notFound('bài học');
  const rows = recentAttempts().filter((r) => r.lesson === lesson.id);
  // Câu thật người học đã lưu từ video, có nhãn thì của bài này
  const videoExamples = all<{ id: number; sentence: string; chunk: string; video_id: string; start: number | null; tense: string; title: string | null }>(
    `SELECT p.id, p.sentence, p.chunk, p.video_id, p.start, p.tense, v.title
       FROM phrases p LEFT JOIN videos v ON v.id = p.video_id
      WHERE p.user_id = ? AND p.video_id IS NOT NULL AND p.tense IN (${lesson.forms.map(() => '?').join(',')})
      ORDER BY p.created_at DESC LIMIT 8`,
    currentUserId(),
    ...lesson.forms,
  ).map((r) => ({ id: r.id, sentence: r.sentence, chunk: r.chunk, videoId: r.video_id, start: r.start, tense: r.tense, videoTitle: r.title }));
  return {
    lesson,
    formLabels: Object.fromEntries(lesson.forms.map((f) => [f, FORM_LABEL[f]])),
    counts: kindCount(itemsOf(lesson.id)),
    stats: statsOf(rows),
    videoExamples,
    prompts: ALL_PROMPTS.filter((p) => p.lesson === lesson.id).map(promptDTO),
  };
}

// ---------- Lượt luyện ----------

export const SESSION_MODES = ['recognize', 'speak', 'type', 'fix', 'mixed'] as const;

export const sessionSchema = z.object({
  mode: z.enum(SESSION_MODES),
  lesson: z.enum(LESSON_IDS).optional(),
  count: z.coerce.number().int().min(4).max(30).default(10),
  /** Trình duyệt có nhận dạng giọng nói → câu tự nói trong lượt "trộn" được nói thay vì gõ */
  speak: z.enum(['0', '1']).optional(),
});

type SessionItem = TenseItem & { formLabel: string; task: 'recognize' | 'speak' | 'type' | 'fix'; wrongSentence?: string };

/** Chọn ngẫu nhiên có trọng số, không lặp. */
function weightedPick<T>(pool: T[], weight: (x: T) => number, n: number): T[] {
  const left = pool.map((x) => ({ x, w: Math.max(0.05, weight(x)) }));
  const out: T[] = [];
  while (out.length < n && left.length) {
    const total = left.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total;
    let i = 0;
    for (; i < left.length - 1; i++) {
      r -= left[i].w;
      if (r <= 0) break;
    }
    out.push(left[i].x);
    left.splice(i, 1);
  }
  return out;
}

export function createSession(input: z.infer<typeof sessionSchema>) {
  const rows = recentAttempts();
  const dayAgo = Date.now() - 24 * 3600_000;
  const recent = new Set(rows.filter((r) => Date.parse(r.created_at) > dayAgo).map((r) => r.item_id));
  const seen = new Set(rows.map((r) => r.item_id));
  // Thì càng yếu (tỉ lệ đúng thấp) càng được hỏi nhiều; câu vừa làm trong 24 giờ được hỏi ít lại
  const weakness = new Map<string, number>();
  for (const f of TENSE_FORMS) {
    const st = statsOf(rows.filter((r) => r.form === f));
    const acc = st.use ?? st.understand;
    weakness.set(f, acc == null ? 0.6 : 1 - acc / 100);
  }
  const weight = (it: TenseItem) => 1 + (weakness.get(it.form) ?? 0.5) * 2 + (seen.has(it.id) ? 0 : 0.6) - (recent.has(it.id) ? 0.85 : 0);

  const base = input.lesson ? itemsOf(input.lesson) : ALL_ITEMS;
  const recognizeKinds = new Set(['meaning', 'ccq', 'listen']);
  const recognizePool = base.filter((i) => recognizeKinds.has(i.kind));
  const producePool = base.filter((i): i is ProduceItem => i.kind === 'produce');
  const n = input.count;
  const label = (f: TenseForm) => FORM_LABEL[f];
  const asTask = (it: TenseItem, task: SessionItem['task']): SessionItem => {
    if (task === 'fix' && it.kind === 'produce') {
      return { ...it, formLabel: label(it.form), task, wrongSentence: it.wrong[Math.floor(Math.random() * it.wrong.length)] };
    }
    return { ...it, formLabel: label(it.form), task };
  };

  let picked: SessionItem[];
  switch (input.mode) {
    case 'recognize':
      picked = weightedPick(recognizePool, weight, n).map((i) => asTask(i, 'recognize'));
      break;
    case 'speak':
    case 'type':
    case 'fix':
      picked = weightedPick(producePool, weight, n).map((i) => asTask(i, input.mode as SessionItem['task']));
      break;
    default: {
      // Trộn thì: ~40% nhận ra, ~50% tự nói/gõ, ~10% sửa câu sai — xen kẽ các thì khác nhau
      const nRec = Math.round(n * 0.4);
      const nFix = Math.max(1, Math.round(n * 0.1));
      const prodTask = input.speak === '1' ? 'speak' : 'type';
      const rec = weightedPick(recognizePool, weight, nRec).map((i) => asTask(i, 'recognize'));
      const prod = weightedPick(producePool, weight, n - nRec);
      const fix = prod.slice(0, nFix).map((i) => asTask(i, 'fix'));
      const rest = prod.slice(nFix).map((i) => asTask(i, prodTask));
      picked = [...rec, ...fix, ...rest];
      // Xáo trộn nhưng tránh hai câu liền nhau cùng thì khi có thể
      picked.sort(() => Math.random() - 0.5);
      for (let i = 1; i < picked.length; i++) {
        if (picked[i].form === picked[i - 1].form) {
          const j = picked.findIndex((x, k) => k > i && x.form !== picked[i - 1].form);
          if (j > 0) [picked[i], picked[j]] = [picked[j], picked[i]];
        }
      }
    }
  }
  return { mode: input.mode, lesson: input.lesson ?? null, items: picked };
}

// ---------- Ghi lượt ----------

function recordAttempt(item: TenseItem, skill: 'understand' | 'use', mode: string, correct: boolean, latencyMs: number | undefined, answer = '') {
  run(
    'INSERT INTO tense_attempts (user_id, item_id, lesson, form, skill, mode, correct, latency_ms, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    currentUserId(),
    item.id,
    item.lesson,
    item.form,
    skill,
    mode,
    correct ? 1 : 0,
    latencyMs ?? null,
    answer.slice(0, 400),
  );
}

export const recognizeSchema = z.object({
  itemId: z.string().max(40),
  correct: z.boolean(),
  latencyMs: z.number().int().min(0).max(600_000).optional(),
  answer: z.string().max(300).optional(),
});

export function recordRecognition(input: z.infer<typeof recognizeSchema>) {
  const item = ITEM_BY_ID.get(input.itemId) ?? notFound('câu luyện');
  recordAttempt(item, 'understand', item.kind, input.correct, input.latencyMs, input.answer);
  const xp = input.correct ? XP.tenseRecognize : 0;
  addActivity({ xp, tense_items: 1 });
  return { xp };
}

export const checkSchema = z.object({
  itemId: z.string().max(40),
  text: z.string().trim().min(1).max(400),
  mode: z.enum(['speak', 'type', 'fix']),
  /** Lần trả lời thứ mấy của câu này (lần 1 sai → chỉ gợi ý; lần 2 → hiện đáp án) */
  attempt: z.coerce.number().int().min(1).max(5).default(1),
  latencyMs: z.number().int().min(0).max(600_000).optional(),
});

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, '').replace(/\s+/g, ' ').trim();

/** Chấm câu nói / gõ của người học. Sai lần đầu: chỉ trả câu hỏi gợi ý (không lộ đáp án) và tự thêm câu vào hàng ôn. */
export async function checkAnswer(input: z.infer<typeof checkSchema>) {
  const item = ITEM_BY_ID.get(input.itemId);
  if (!item || item.kind !== 'produce') return notFound('câu luyện');
  const r = checkProduction({ verb: item.verb, accept: item.accept }, input.text);
  // Bài sửa câu: gõ lại y nguyên câu sai thì không tính là đã sửa
  const unchanged = input.mode === 'fix' && item.wrong.some((w) => norm(w) === norm(input.text));
  const correct = r.correct && !unchanged;
  const reveal = correct || input.attempt >= 2;
  let addedCard = false;
  if (input.attempt === 1) {
    recordAttempt(item, 'use', input.mode, correct, input.latencyMs, input.text);
    addActivity({ tense_items: 1 });
    if (!correct) addedCard = (await addCard(item.id).catch(() => null))?.existed === false;
  }
  const xp = correct ? (input.attempt === 1 ? XP.tenseUse : XP.tenseRetry) : 0;
  if (xp) addActivity({ xp });
  return {
    correct,
    reason: unchanged ? ('unchanged' as const) : r.reason,
    used: r.used,
    usedLabel: r.used ? FORM_LABEL[r.used] : null,
    usedText: r.usedText,
    paraphrase: r.paraphrase,
    acceptLabels: item.accept.map((f) => FORM_LABEL[f]),
    issues: r.issues.map((i) => ({ type: i.type, text: i.text, hint: i.hint, explain: reveal ? i.explain : undefined, fix: reveal ? i.fix : undefined })),
    hint: reveal ? undefined : item.hint,
    answer: reveal ? item.answers[0] : undefined,
    answers: reveal ? item.answers : undefined,
    explain: reveal ? item.explain : undefined,
    xp,
    addedCard,
  };
}

/** Đưa một câu luyện vào hàng ôn FSRS (sổ mẫu câu, có nhãn thì): mặt trước che cụm động từ, kèm gợi ý tiếng Việt. */
export async function addCard(itemId: string) {
  const item = ITEM_BY_ID.get(itemId);
  if (!item || item.kind !== 'produce') return notFound('câu luyện');
  const model = item.answers[0];
  const head = item.verb.split(' ')[0];
  const verb = analyzeSentence(model).find((v) => v.lemma.split(' ')[0] === head);
  const chunk = verb ? model.slice(verb.parts[0][0], verb.parts[verb.parts.length - 1][1]) : '';
  return createPhrase({
    sentence: model,
    chunk: chunk || undefined,
    sentenceVi: item.cueType === 'translate' ? item.cue : '',
    chunkVi: FORM_LABEL[item.form],
    note: item.cue,
    tense: item.form,
  });
}

// ---------- Viết đoạn / soát thì ----------

function labeled(text: string) {
  const a = analyzeText(text);
  return {
    sentences: a.sentences.map((s) => ({ ...s, verbs: s.verbs.map((v) => ({ ...v, label: FORM_LABEL[v.form] })) })),
    counts: (Object.entries(a.counts) as [VerbForm, number][]).map(([form, count]) => ({ form, label: FORM_LABEL[form], count })).sort((x, y) => y.count - x.count),
    issueCount: a.issueCount,
  };
}

export const analyzeSchema = z.object({ text: z.string().trim().min(1).max(6000) });

export function analyze(text: string) {
  return labeled(text);
}

export function listPrompts() {
  return ALL_PROMPTS.map(promptDTO);
}

export const writingSchema = z.object({ promptId: z.string().max(40), text: z.string().trim().min(10).max(6000) });

export function submitWriting(input: z.infer<typeof writingSchema>) {
  const prompt = PROMPT_BY_ID.get(input.promptId) ?? notFound('đề viết');
  const analysis = labeled(input.text);
  const used = new Set(analysis.sentences.flatMap((s) => s.verbs.map((v) => v.form)));
  const targets = prompt.targets.map((f) => ({ form: f, label: FORM_LABEL[f], used: used.has(f) }));
  const sentenceCount = analysis.sentences.length;
  const enough = sentenceCount >= prompt.minSentences;
  run('INSERT INTO tense_writings (user_id, prompt_id, text, issue_count) VALUES (?, ?, ?, ?)', currentUserId(), prompt.id, input.text, analysis.issueCount);
  const xp = enough ? XP.tenseWriting : 0;
  addActivity({ xp, tense_items: Math.min(sentenceCount, 6) });
  return { analysis, targets, sentenceCount, minSentences: prompt.minSentences, enough, xp, model: prompt.model };
}

export function listWritings() {
  return all<{ id: number; prompt_id: string; text: string; issue_count: number; created_at: string }>(
    'SELECT id, prompt_id, text, issue_count, created_at FROM tense_writings WHERE user_id = ? ORDER BY id DESC LIMIT 10',
    currentUserId(),
  ).map((r) => ({ id: r.id, promptId: r.prompt_id, title: PROMPT_BY_ID.get(r.prompt_id)?.title ?? r.prompt_id, text: r.text, issueCount: r.issue_count, createdAt: r.created_at }));
}

// ---------- Kể chuyện 4/3/2 theo thì ----------

const STORY_TOPICS: Record<LessonId, { topic: string; prompts: string[] }> = {
  'present-simple': { topic: 'Describe a typical weekday in your life', prompts: ['what time you usually get up', 'how you get to school or work', 'what you normally do in the evening', 'what you like most about your routine'] },
  continuous: { topic: 'Describe what is changing in your life these days', prompts: ['what you are working on at the moment', 'what you are learning these days', 'what is getting easier or harder', 'what you were doing this time last year'] },
  'past-simple': { topic: 'Describe a trip or day out you enjoyed', prompts: ['where you went and who you went with', 'what you did first', 'what happened next', 'how you felt at the end of the day'] },
  'present-perfect': { topic: 'Describe something you have achieved recently', prompts: ['what you have achieved', 'how long you have been working on it', 'what you have learned from it', 'what you did on the day you finished'] },
  future: { topic: 'Describe your plans for the next year', prompts: ['what you are going to do', 'what you are doing next weekend', 'what you think will change in your life', 'what you will do if things go well'] },
  'past-perfect': { topic: 'Describe a day when things went wrong', prompts: ['what had already happened before you left home', 'what you realised later', 'what you had forgotten to do', 'how the day ended'] },
};

export const storySchema = z.object({ lesson: z.enum(LESSON_IDS) });

/** Tạo một buổi 4/3/2 (bản ngắn 2 → 1,5 → 1 phút) với đề buộc dùng thì của bài. */
export function createStory(lesson: LessonId) {
  const t = STORY_TOPICS[lesson];
  const l = LESSON_BY_ID.get(lesson)!;
  return createFluencySession({ topic: t.topic, prompts: t.prompts, plan: 'short', notes: `Luyện thì: ${l.title}. Sau mỗi lượt, mở “Soát thì” để xem động từ đã đúng thì chưa.` });
}

// ---------- Kính thì: thì của từng câu phụ đề ----------

interface VideoTenses {
  videoId: string;
  trackId: string;
  sentences: Record<number, WordTenseSpan[]>;
  counts: Partial<Record<VerbForm, number>>;
  labels: Record<VerbForm, string>;
}

const videoCache = new Map<string, VideoTenses>();

export async function videoTenses(videoId: string, trackId?: string): Promise<VideoTenses> {
  const t = await getTranscript(videoId, { trackId });
  const key = `${videoId}|${t.trackId}|${t.kind}|${t.sentences.length}|${t.sentences[0]?.text ?? ''}|${t.sentences[t.sentences.length - 1]?.text ?? ''}`;
  const hit = videoCache.get(key);
  if (hit) {
    videoCache.delete(key);
    videoCache.set(key, hit);
    return hit;
  }
  const sentences: Record<number, WordTenseSpan[]> = {};
  const counts: Partial<Record<VerbForm, number>> = {};
  let n = 0;
  for (const s of t.sentences) {
    const spans = tenseSpansForWords(s.words.map((w) => w.w));
    if (spans.length) {
      sentences[s.i] = spans;
      const groups = new Map<number, VerbForm>();
      for (const sp of spans) groups.set(sp.g, sp.form);
      for (const f of groups.values()) counts[f] = (counts[f] ?? 0) + 1;
    }
    // Nhường vòng lặp sự kiện mỗi 40 câu: phân tích video dài không làm máy chủ "đứng" với người khác
    if (++n % 40 === 0) await new Promise((r) => setImmediate(r));
  }
  const out: VideoTenses = { videoId, trackId: t.trackId, sentences, counts, labels: FORM_LABEL };
  videoCache.set(key, out);
  while (videoCache.size > 40) videoCache.delete(videoCache.keys().next().value!);
  return out;
}

// ---------- Báo nhận diện sai ----------

export const reportSchema = z.object({
  videoId: z.string().regex(/^[\w-]{11}$/).optional(),
  sentence: z.string().trim().min(1).max(600),
  verb: z.string().trim().min(1).max(120),
  form: z.string().max(40),
  note: z.string().trim().max(300).optional(),
});

export function report(input: z.infer<typeof reportSchema>) {
  run(
    'INSERT INTO tense_reports (user_id, video_id, sentence, verb, form, note) VALUES (?, ?, ?, ?, ?, ?)',
    currentUserId(),
    input.videoId ?? null,
    input.sentence,
    input.verb,
    input.form,
    input.note ?? '',
  );
  return { ok: true };
}

/** Danh sách báo sai gần đây (trang Quản trị) */
export function listReports() {
  return all<{ id: number; video_id: string | null; sentence: string; verb: string; form: string; note: string; created_at: string; user_name: string | null }>(
    `SELECT r.id, r.video_id, r.sentence, r.verb, r.form, r.note, r.created_at, u.name AS user_name
       FROM tense_reports r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 100`,
  ).map((r) => ({
    id: r.id,
    videoId: r.video_id,
    sentence: r.sentence,
    verb: r.verb,
    form: r.form,
    formLabel: FORM_LABEL[r.form as VerbForm] ?? r.form,
    note: r.note,
    userName: r.user_name,
    createdAt: r.created_at,
  }));
}
