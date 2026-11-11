import { Rating, type Grade } from 'ts-fsrs';
import { z } from 'zod';
import { COLLOCATIONS } from '../data/collocations.ts';
import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { formatInterval, localDay, startOfLocalDay } from '../lib/time.ts';
import { inflectionRegex, termKey, uniqBy } from '../lib/text.ts';
import { addActivity, XP } from './activity.service.ts';
import { LEARN_AHEAD_MS, previewIntervals, scheduler, toCard } from './review.service.ts';
import { translateText } from './translate/index.ts';

/**
 * Sổ mẫu câu: câu lưu từ video (kèm cụm cần học) được ôn bằng FSRS như thẻ từ.
 * Mặt trước thẻ phát lại đúng đoạn video gốc nên người học nghe giọng thật, không phải giọng máy.
 */
export interface PhraseRow {
  id: number;
  user_id: number;
  video_id: string | null;
  start: number | null;
  end: number | null;
  sentence: string;
  sentence_key: string;
  sentence_vi: string;
  chunk: string;
  chunk_vi: string;
  note: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  speak_count: number;
  best_score: number | null;
  created_at: string;
  updated_at: string;
  video_title?: string | null;
}

const SELECT = `SELECT p.*, v.title AS video_title FROM phrases p LEFT JOIN videos v ON v.id = p.video_id`;

export function phraseStatus(r: Pick<PhraseRow, 'state' | 'stability'>) {
  if (r.state === 0) return 'new';
  if (r.state === 1 || r.state === 3) return 'learning';
  return r.stability >= 21 ? 'mastered' : 'reviewing';
}

export function toPhraseDTO(r: PhraseRow) {
  return {
    id: r.id,
    videoId: r.video_id,
    videoTitle: r.video_title ?? null,
    start: r.start,
    end: r.end,
    sentence: r.sentence,
    sentenceVi: r.sentence_vi,
    chunk: r.chunk,
    chunkVi: r.chunk_vi,
    note: r.note,
    status: phraseStatus(r),
    state: r.state,
    due: r.due,
    reps: r.reps,
    lapses: r.lapses,
    lastReview: r.last_review,
    speakCount: r.speak_count,
    bestScore: r.best_score,
    createdAt: r.created_at,
  };
}

export type PhraseDTO = ReturnType<typeof toPhraseDTO>;

function notFound(): never {
  const err = new Error('Không tìm thấy mẫu câu') as Error & { status: number };
  err.status = 404;
  throw err;
}

export function getPhraseRow(id: number) {
  return get<PhraseRow>(`${SELECT} WHERE p.id = ? AND p.user_id = ?`, id, currentUserId());
}

export function getPhrase(id: number): PhraseDTO {
  const row = getPhraseRow(id);
  if (!row) notFound();
  return toPhraseDTO(row);
}

// ---------- Tạo / sửa / xoá ----------

export const createSchema = z.object({
  sentence: z.string().trim().min(3).max(600),
  chunk: z.string().trim().max(120).optional(),
  videoId: z.string().regex(/^[\w-]{11}$/).optional(),
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  sentenceVi: z.string().max(1000).optional(),
  note: z.string().max(1000).optional(),
});

const cleanChunk = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');

async function translateChunk(chunk: string, sentence: string) {
  if (!chunk) return '';
  const vi = (await translateText(chunk, { context: sentence }).catch(() => null))?.translation ?? '';
  // Cụm từ (không phải câu): bỏ dấu chấm cuối, viết thường chữ đầu như cụm gốc
  const trimmed = vi.trim().replace(/[.!?。]+$/, '');
  return /^[a-z]/.test(chunk) ? trimmed.charAt(0).toLocaleLowerCase('vi') + trimmed.slice(1) : trimmed;
}

export async function createPhrase(input: z.infer<typeof createSchema>) {
  const sentence = input.sentence.replace(/\s+/g, ' ').trim();
  const chunk = cleanChunk(input.chunk);
  if (chunk && !sentence.toLowerCase().includes(chunk.toLowerCase())) {
    const err = new Error('Cụm từ phải nằm trong câu') as Error & { status: number };
    err.status = 400;
    throw err;
  }
  const uid = currentUserId();
  const key = termKey(sentence);
  const existing = get<{ id: number }>('SELECT id FROM phrases WHERE user_id = ? AND sentence_key = ? AND lower(chunk) = lower(?)', uid, key, chunk);
  if (existing) return { phrase: getPhrase(existing.id), existed: true };

  const [sentenceVi, chunkVi] = await Promise.all([
    input.sentenceVi?.trim() || translateText(sentence).then((r) => r.translation).catch(() => ''),
    translateChunk(chunk, sentence),
  ]);
  const id = tx(() => {
    const res = run(
      `INSERT INTO phrases (user_id, video_id, start, end, sentence, sentence_key, sentence_vi, chunk, chunk_vi, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uid,
      input.videoId ?? null,
      input.start ?? null,
      input.end ?? null,
      sentence,
      key,
      sentenceVi,
      chunk,
      chunkVi,
      input.note ?? '',
    );
    addActivity({ xp: XP.newWord });
    return Number(res.lastInsertRowid);
  });
  return { phrase: getPhrase(id), existed: false };
}

export const updateSchema = z.object({
  chunk: z.string().max(120).optional(),
  chunkVi: z.string().max(300).optional(),
  sentenceVi: z.string().max(1000).optional(),
  note: z.string().max(1000).optional(),
});

export async function updatePhrase(id: number, patch: z.infer<typeof updateSchema>) {
  const row = getPhraseRow(id);
  if (!row) notFound();
  const chunk = patch.chunk === undefined ? row.chunk : cleanChunk(patch.chunk);
  if (chunk && !row.sentence.toLowerCase().includes(chunk.toLowerCase())) {
    const err = new Error('Cụm từ phải nằm trong câu') as Error & { status: number };
    err.status = 400;
    throw err;
  }
  let chunkVi = patch.chunkVi ?? row.chunk_vi;
  if (patch.chunk !== undefined && chunk !== row.chunk && patch.chunkVi === undefined) chunkVi = await translateChunk(chunk, row.sentence);
  run(
    `UPDATE phrases SET chunk = ?, chunk_vi = ?, sentence_vi = ?, note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND user_id = ?`,
    chunk,
    chunkVi,
    patch.sentenceVi ?? row.sentence_vi,
    patch.note ?? row.note,
    id,
    currentUserId(),
  );
  return getPhrase(id);
}

export function deletePhrase(id: number) {
  const res = run('DELETE FROM phrases WHERE id = ? AND user_id = ?', id, currentUserId());
  if (!res.changes) notFound();
}

// ---------- Danh sách ----------

export const listSchema = z.object({
  q: z.string().optional(),
  videoId: z.string().optional(),
  status: z.enum(['all', 'due', 'new', 'learning', 'reviewing', 'mastered']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export function listPhrases(f: z.infer<typeof listSchema>) {
  const where = ['p.user_id = :uid'];
  const params: Record<string, string | number> = { uid: currentUserId(), now: new Date().toISOString() };
  if (f.q?.trim()) {
    where.push('(p.sentence LIKE :q OR p.chunk LIKE :q OR p.sentence_vi LIKE :q OR p.note LIKE :q)');
    params.q = `%${f.q.trim()}%`;
  }
  if (f.videoId) {
    where.push('p.video_id = :videoId');
    params.videoId = f.videoId;
  }
  const statusSql = {
    all: '',
    due: 'p.state != 0 AND p.due <= :now',
    new: 'p.state = 0',
    learning: 'p.state IN (1,3)',
    reviewing: 'p.state = 2 AND p.stability < 21',
    mastered: 'p.state = 2 AND p.stability >= 21',
  }[f.status ?? 'all'];
  const base = where.join(' AND ');
  const counts = get<Record<string, number>>(
    `SELECT COUNT(*) AS "all",
            SUM(CASE WHEN p.state != 0 AND p.due <= :now THEN 1 ELSE 0 END) AS due,
            SUM(CASE WHEN p.state = 0 THEN 1 ELSE 0 END) AS new,
            SUM(CASE WHEN p.state IN (1,3) THEN 1 ELSE 0 END) AS learning,
            SUM(CASE WHEN p.state = 2 AND p.stability < 21 THEN 1 ELSE 0 END) AS reviewing,
            SUM(CASE WHEN p.state = 2 AND p.stability >= 21 THEN 1 ELSE 0 END) AS mastered
       FROM phrases p WHERE ${base}`,
    params,
  )!;
  const finalWhere = statusSql ? `${base} AND ${statusSql}` : base;
  const limit = f.limit ?? 50;
  const page = f.page ?? 1;
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM phrases p WHERE ${finalWhere}`, params)!.n;
  const rows = all<PhraseRow>(`${SELECT} WHERE ${finalWhere} ORDER BY p.created_at DESC, p.id DESC LIMIT :limit OFFSET :offset`, {
    ...params,
    limit,
    offset: (page - 1) * limit,
  });
  return {
    items: rows.map(toPhraseDTO),
    total,
    page,
    limit,
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v ?? 0])),
  };
}

/** Các câu đã lưu của một video (để tô dấu trong phụ đề). */
export function videoPhraseKeys(videoId: string) {
  return all<{ id: number; start: number | null; sentence_key: string; chunk: string }>(
    'SELECT id, start, sentence_key, chunk FROM phrases WHERE user_id = ? AND video_id = ?',
    currentUserId(),
    videoId,
  ).map((r) => ({ id: r.id, start: r.start, key: r.sentence_key, chunk: r.chunk }));
}

// ---------- Gợi ý cụm từ trong câu ----------

const STOP_HEAD = new Set(['a', 'an', 'the', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for', 'with']);

export function suggestChunks(sentence: string) {
  const uid = currentUserId();
  const out: { text: string; source: 'notebook' | 'collocation' | 'topic'; meaning?: string }[] = [];
  const found = (term: string) => {
    const m = sentence.match(inflectionRegex(term));
    return m ? m[0] : null;
  };
  // 1. Từ/cụm trong sổ từ của người học (ưu tiên cụm nhiều từ)
  const words = all<{ term: string; meaning: string }>(
    "SELECT term, meaning FROM words WHERE user_id = ? AND instr(term, ' ') > 0 ORDER BY length(term) DESC LIMIT 400",
    uid,
  );
  for (const w of words) {
    const hit = found(w.term);
    if (hit) out.push({ text: hit, source: 'notebook', meaning: w.meaning });
  }
  // 2. Collocation động từ + danh từ soạn sẵn (cho phép 0–2 từ chen giữa: make a quick decision)
  for (const c of COLLOCATIONS) {
    const head = c.partner.split(' ').filter((p) => !STOP_HEAD.has(p.toLowerCase()));
    const last = head[head.length - 1];
    if (!last) continue;
    const re = new RegExp(`${inflectionRegex(c.answer).source.slice(0, -'(?![\\p{L}])'.length)}(?:\\s+[\\p{L}'-]+){0,2}?\\s+${last}\\w*(?![\\p{L}])`, 'iu');
    const m = sentence.match(re);
    if (m) out.push({ text: m[0].trim(), source: 'collocation', meaning: c.vi });
  }
  // 3. Cụm từ và collocation của bộ từ chủ đề
  const lex = all<{ word: string; meaning_vi: string; collocations: string }>(
    "SELECT word, meaning_vi, collocations FROM lexicon WHERE instr(word, ' ') > 0 OR collocations != '[]'",
  );
  const lower = sentence.toLowerCase();
  for (const l of lex) {
    if (l.word.includes(' ') && lower.includes(l.word.split(' ')[0])) {
      const hit = found(l.word);
      if (hit) out.push({ text: hit, source: 'topic', meaning: l.meaning_vi });
    }
    for (const col of parseJson<string[]>(l.collocations, [])) {
      if (!lower.includes(col.split(' ').slice(-1)[0])) continue;
      const hit = found(col);
      if (hit) out.push({ text: hit, source: 'topic' });
    }
  }
  return uniqBy(out, (o) => o.text.toLowerCase()).slice(0, 8);
}

// ---------- Ôn tập FSRS ----------

const NEW_PER_DAY = 10;

function introducedToday() {
  return get<{ n: number }>(
    'SELECT COUNT(DISTINCT phrase_id) AS n FROM phrase_logs WHERE user_id = ? AND state = 0 AND reviewed_at >= ?',
    currentUserId(),
    startOfLocalDay().toISOString(),
  )!.n;
}

export function phraseSummary() {
  const ahead = new Date(Date.now() + LEARN_AHEAD_MS).toISOString();
  const r = get<{ due: number; fresh: number; total: number }>(
    `SELECT SUM(CASE WHEN state != 0 AND due <= ? THEN 1 ELSE 0 END) AS due,
            SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) AS fresh,
            COUNT(*) AS total
       FROM phrases WHERE user_id = ?`,
    ahead,
    currentUserId(),
  )!;
  const newLimit = Math.max(0, NEW_PER_DAY - introducedToday());
  return { dueNow: r.due ?? 0, newAvailable: Math.min(newLimit, r.fresh ?? 0), total: r.total ?? 0 };
}

export function phraseQueue(limit = 100) {
  const now = new Date();
  const ahead = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString();
  const uid = currentUserId();
  const due = all<PhraseRow>(`${SELECT} WHERE p.user_id = ? AND p.state != 0 AND p.due <= ? ORDER BY p.due LIMIT ?`, uid, ahead, limit);
  const newLimit = Math.max(0, NEW_PER_DAY - introducedToday());
  const fresh = newLimit
    ? all<PhraseRow>(`${SELECT} WHERE p.user_id = ? AND p.state = 0 ORDER BY p.created_at, p.id LIMIT ?`, uid, Math.min(newLimit, limit))
    : [];
  return [...due, ...fresh].slice(0, limit).map((r) => ({ ...toPhraseDTO(r), preview: previewIntervals(r, now) }));
}

function snapshot(r: PhraseRow) {
  return {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: r.last_review,
  };
}

export function ratePhrase(id: number, rating: Grade, mode = 'flashcard', xpOverride?: number) {
  const row = getPhraseRow(id);
  if (!row) notFound();
  const now = new Date();
  const { card } = scheduler().next(toCard(row), now, rating);
  const xp = xpOverride ?? (rating === Rating.Again ? XP.reviewAgain : XP.review);
  tx(() => {
    run(
      `UPDATE phrases SET due = :due, stability = :stability, difficulty = :difficulty, elapsed_days = :elapsed,
         scheduled_days = :scheduled, learning_steps = :steps, reps = :reps, lapses = :lapses, state = :state,
         last_review = :last, updated_at = :last WHERE id = :id AND user_id = :uid`,
      {
        id,
        uid: currentUserId(),
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed: card.elapsed_days,
        scheduled: card.scheduled_days,
        steps: card.learning_steps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last: now.toISOString(),
      },
    );
    run(
      'INSERT INTO phrase_logs (user_id, phrase_id, rating, mode, state, prev, xp, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      currentUserId(),
      id,
      rating,
      mode,
      row.state,
      JSON.stringify(snapshot(row)),
      xp,
      now.toISOString(),
    );
    addActivity({ reviews: 1, xp });
  });
  const updated = getPhraseRow(id)!;
  return {
    phrase: { ...toPhraseDTO(updated), preview: previewIntervals(updated) },
    nextReview: card.due.toISOString(),
    interval: formatInterval(card.due.getTime() - now.getTime()),
    xp,
  };
}

/** Lượt ôn mẫu câu gần nhất trong ngày (để hoàn tác chung với thẻ từ). */
export function lastPhraseLog() {
  return get<{ id: number; phrase_id: number; prev: string; xp: number; reviewed_at: string }>(
    'SELECT id, phrase_id, prev, xp, reviewed_at FROM phrase_logs WHERE user_id = ? AND reviewed_at >= ? ORDER BY id DESC LIMIT 1',
    currentUserId(),
    startOfLocalDay().toISOString(),
  );
}

export function undoPhraseLog(log: NonNullable<ReturnType<typeof lastPhraseLog>>) {
  const prev = parseJson<ReturnType<typeof snapshot> | null>(log.prev, null);
  tx(() => {
    if (prev) {
      run(
        `UPDATE phrases SET due = :due, stability = :stability, difficulty = :difficulty, elapsed_days = :elapsed_days,
           scheduled_days = :scheduled_days, learning_steps = :learning_steps, reps = :reps, lapses = :lapses,
           state = :state, last_review = :last_review WHERE id = :id AND user_id = :uid`,
        { ...prev, id: log.phrase_id, uid: currentUserId() },
      );
    }
    run('DELETE FROM phrase_logs WHERE id = ?', log.id);
    addActivity({ reviews: -1, xp: -log.xp }, localDay(new Date(log.reviewed_at)));
  });
  const row = getPhraseRow(log.phrase_id);
  return row ? { ...toPhraseDTO(row), preview: previewIntervals(row) } : null;
}
