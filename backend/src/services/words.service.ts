import { z } from 'zod';
import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { termKey } from '../lib/text.ts';
import { addActivity, XP } from './activity.service.ts';
import { lookupTerm } from './lookup.service.ts';
import { findOccurrences } from './transcript.service.ts';
import { translateBatch, translateText } from './translate/index.ts';

export const STATUS_SQL = `CASE WHEN w.known = 1 THEN 'known' WHEN w.state = 0 THEN 'new' WHEN w.state IN (1,3) THEN 'learning'
  WHEN w.stability >= 21 THEN 'mastered' ELSE 'reviewing' END`;

export type WordStatus = 'new' | 'learning' | 'reviewing' | 'mastered' | 'known';

export interface Example {
  en: string;
  vi?: string;
  source?: 'video' | 'dictionary' | 'user' | 'topic';
  videoId?: string;
  time?: number;
}

export interface WordRow {
  id: number;
  term: string;
  term_key: string;
  pos: string | null;
  ipa: string | null;
  audio: string | null;
  meaning: string;
  definition: string;
  examples: string;
  synonyms: string;
  collocations: string;
  note: string;
  tags: string;
  source_type: string;
  video_id: string | null;
  video_time: number | null;
  topic_id: number | null;
  lexicon_id: number | null;
  starred: number;
  known: number;
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
  correct_count: number;
  wrong_count: number;
  created_at: string;
  updated_at: string;
  status: WordStatus;
  topic_name?: string | null;
  video_title?: string | null;
}

export const WORD_SELECT = `SELECT w.*, ${STATUS_SQL} AS status, t.name AS topic_name, v.title AS video_title
  FROM words w LEFT JOIN topics t ON t.id = w.topic_id LEFT JOIN videos v ON v.id = w.video_id`;

export function toWordDTO(r: WordRow) {
  return {
    id: r.id,
    term: r.term,
    pos: r.pos,
    ipa: r.ipa,
    audio: r.audio,
    meaning: r.meaning,
    definition: r.definition,
    examples: parseJson<Example[]>(r.examples, []),
    synonyms: parseJson<string[]>(r.synonyms, []),
    collocations: parseJson<string[]>(r.collocations, []),
    note: r.note,
    tags: parseJson<string[]>(r.tags, []),
    sourceType: r.source_type,
    videoId: r.video_id,
    videoTime: r.video_time,
    videoTitle: r.video_title ?? null,
    topicId: r.topic_id,
    topicName: r.topic_name ?? null,
    lexiconId: r.lexicon_id,
    starred: Boolean(r.starred),
    known: Boolean(r.known),
    status: r.status,
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    lastReview: r.last_review,
    correctCount: r.correct_count,
    wrongCount: r.wrong_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type WordDTO = ReturnType<typeof toWordDTO>;

export function getWordRow(id: number): WordRow | undefined {
  return get<WordRow>(`${WORD_SELECT} WHERE w.id = ? AND w.user_id = ?`, id, currentUserId());
}

function notFound(): never {
  const err = new Error('Không tìm thấy từ') as Error & { status: number };
  err.status = 404;
  throw err;
}

export function getWord(id: number): WordDTO {
  const row = getWordRow(id);
  if (!row) notFound();
  return toWordDTO(row);
}

// ---------- Danh sách / lọc ----------

export const listSchema = z.object({
  q: z.string().optional(),
  status: z.enum(['all', 'new', 'learning', 'reviewing', 'mastered', 'known', 'due', 'starred']).optional(),
  source: z.enum(['video', 'topic', 'manual']).optional(),
  topicId: z.coerce.number().int().optional(),
  videoId: z.string().optional(),
  tag: z.string().optional(),
  sort: z.enum(['recent', 'oldest', 'alpha', 'due', 'weak']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export function listWords(filters: z.infer<typeof listSchema>) {
  const where: string[] = ['w.user_id = :uid'];
  const params: Record<string, string | number> = { uid: currentUserId() };
  if (filters.q?.trim()) {
    where.push('(w.term LIKE :q OR w.meaning LIKE :q OR w.note LIKE :q)');
    params.q = `%${filters.q.trim()}%`;
  }
  if (filters.source) {
    where.push('w.source_type = :source');
    params.source = filters.source;
  }
  if (filters.topicId) {
    where.push('w.topic_id = :topicId');
    params.topicId = filters.topicId;
  }
  if (filters.videoId) {
    where.push('w.video_id = :videoId');
    params.videoId = filters.videoId;
  }
  if (filters.tag) {
    where.push('EXISTS (SELECT 1 FROM json_each(w.tags) WHERE value = :tag)');
    params.tag = filters.tag;
  }
  const baseWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Đếm theo trạng thái (cho các tab) trên cùng bộ lọc
  const countRows = all<{ status: string; n: number }>(
    `SELECT ${STATUS_SQL} AS status, COUNT(*) AS n FROM words w ${baseWhere} GROUP BY status`,
    params,
  );
  const counts: Record<string, number> = { all: 0, new: 0, learning: 0, reviewing: 0, mastered: 0, known: 0 };
  for (const r of countRows) {
    counts[r.status] = r.n;
    counts.all += r.n;
  }
  const nowIso = new Date().toISOString();
  counts.due = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM words w ${baseWhere ? baseWhere + ' AND' : 'WHERE'} w.known = 0 AND w.state != 0 AND w.due <= :now`,
    { ...params, now: nowIso },
  )!.n;
  counts.starred = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM words w ${baseWhere ? baseWhere + ' AND' : 'WHERE'} w.starred = 1`,
    params,
  )!.n;

  const statusWhere = [...where];
  const status = filters.status ?? 'all';
  if (status === 'due') {
    statusWhere.push('w.known = 0 AND w.state != 0 AND w.due <= :now');
    params.now = nowIso;
  } else if (status === 'starred') {
    statusWhere.push('w.starred = 1');
  } else if (status !== 'all') {
    statusWhere.push(`${STATUS_SQL} = :status`);
    params.status = status;
  }
  const finalWhere = statusWhere.length ? `WHERE ${statusWhere.join(' AND ')}` : '';
  const order = {
    recent: 'w.created_at DESC, w.id DESC',
    oldest: 'w.created_at ASC, w.id ASC',
    alpha: 'w.term COLLATE NOCASE ASC',
    due: 'w.known ASC, w.due ASC',
    weak: '(w.wrong_count + w.lapses * 2 - w.correct_count) DESC, w.difficulty DESC',
  }[filters.sort ?? 'recent'];
  const limit = filters.limit ?? 50;
  const page = filters.page ?? 1;
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM words w ${finalWhere}`, params)!.n;
  const rows = all<WordRow>(`${WORD_SELECT} ${finalWhere} ORDER BY ${order} LIMIT :limit OFFSET :offset`, {
    ...params,
    limit,
    offset: (page - 1) * limit,
  });
  return { items: rows.map(toWordDTO), total, page, limit, counts };
}

/** Khoá nhẹ của mọi từ trong sổ — frontend dùng để tô màu từ đã lưu trong transcript. */
export function wordKeys() {
  return all<{ id: number; key: string; status: WordStatus }>(`SELECT w.id, w.term_key AS key, ${STATUS_SQL} AS status FROM words w WHERE w.user_id = ?`, currentUserId());
}

export function allTags(): string[] {
  return all<{ value: string }>(
    'SELECT DISTINCT j.value AS value FROM words w, json_each(w.tags) j WHERE w.user_id = ? ORDER BY j.value COLLATE NOCASE',
    currentUserId(),
  ).map((r) => r.value);
}

// ---------- Tạo từ mới (tự điền nghĩa, IPA, ví dụ) ----------

export const createSchema = z.object({
  term: z.string().trim().min(1).max(120),
  meaning: z.string().max(500).optional(),
  definition: z.string().max(1000).optional(),
  context: z.string().max(1000).optional(),
  contextVi: z.string().max(1000).optional(),
  videoId: z.string().max(20).optional(),
  videoTime: z.number().min(0).optional(),
  topicId: z.number().int().optional(),
  lexiconId: z.number().int().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  note: z.string().max(2000).optional(),
  known: z.boolean().optional(),
  autoFill: z.boolean().optional(),
  sourceType: z.enum(['video', 'topic', 'manual']).optional(),
});

export type CreateWordInput = z.infer<typeof createSchema>;

interface LexiconRow {
  id: number;
  word: string;
  pos: string | null;
  ipa: string | null;
  ipa_us: string | null;
  audio: string | null;
  audio_us: string | null;
  meaning_vi: string;
  definitions: string;
  examples: string;
  synonyms: string;
  collocations: string;
}

function mergeExample(examples: Example[], ex: Example | null): Example[] {
  if (!ex?.en?.trim()) return examples;
  const key = termKey(ex.en);
  if (examples.some((e) => termKey(e.en) === key)) return examples;
  return [ex, ...examples];
}

export async function createWord(input: CreateWordInput): Promise<{ word: WordDTO; existed: boolean }> {
  const term = input.term.trim().replace(/\s+/g, ' ');
  const key = termKey(term);
  if (!key) {
    const err = new Error('Từ không hợp lệ') as Error & { status: number };
    err.status = 400;
    throw err;
  }

  let contextVi = input.contextVi;
  if (input.context && !contextVi) {
    contextVi = (await translateText(input.context).catch(() => null))?.translation;
  }
  const contextExample: Example | null = input.context
    ? {
        en: input.context.trim(),
        vi: contextVi,
        source: input.videoId ? 'video' : 'user',
        videoId: input.videoId,
        time: input.videoTime,
      }
    : null;

  const uid = currentUserId();
  const existing = get<WordRow>(`${WORD_SELECT} WHERE w.user_id = ? AND w.term_key = ?`, uid, key);
  if (existing) {
    const examples = mergeExample(parseJson<Example[]>(existing.examples, []), contextExample);
    run(
      `UPDATE words SET examples = ?, known = COALESCE(?, known), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
      JSON.stringify(examples.slice(0, 12)),
      input.known === undefined ? null : input.known ? 1 : 0,
      existing.id,
    );
    return { word: getWord(existing.id), existed: true };
  }

  const lex = input.lexiconId
    ? get<LexiconRow>('SELECT * FROM lexicon WHERE id = ?', input.lexiconId)
    : get<LexiconRow>('SELECT * FROM lexicon WHERE word = ?', key);

  let pos: string | null = null;
  let ipa: string | null = null;
  let audio: string | null = null;
  let meaning = input.meaning?.trim() ?? '';
  let definition = input.definition?.trim() ?? '';
  let examples: Example[] = [];
  let synonyms: string[] = [];
  let collocations: string[] = [];

  if (lex) {
    pos = lex.pos;
    ipa = lex.ipa ?? lex.ipa_us;
    audio = lex.audio_us ?? lex.audio;
    meaning ||= lex.meaning_vi;
    definition ||= parseJson<{ definition: string }[]>(lex.definitions, [])[0]?.definition ?? '';
    examples = parseJson<Example[]>(lex.examples, []).map((e) => ({ ...e, source: 'topic' as const }));
    synonyms = parseJson<string[]>(lex.synonyms, []);
    collocations = parseJson<string[]>(lex.collocations, []);
  } else if (input.autoFill !== false) {
    const info = await lookupTerm(term, input.context).catch((err) => {
      console.warn('[words] tự điền thất bại:', (err as Error).message);
      return null;
    });
    if (info) {
      pos = info.pos ?? null;
      ipa = info.ipaUs ?? info.ipa ?? null;
      audio = info.audioUs ?? info.audio ?? null;
      if (!meaning) {
        if (info.contextual) {
          meaning = info.contextual.text;
        } else {
          const main = info.translation;
          const extra = (info.dict[0]?.terms ?? []).filter((t) => t.toLowerCase() !== main.toLowerCase()).slice(0, 2);
          meaning = [main, ...extra].filter(Boolean).join(', ');
        }
      }
      definition ||= info.sense?.definition ?? info.meanings[0]?.definitions[0]?.definition ?? '';
      synonyms = info.synonyms.slice(0, 8);
      const dictExamples = info.examples.slice(0, 2);
      if (dictExamples.length) {
        const vi = await translateBatch(dictExamples).catch(() => ({ translations: [] as string[] }));
        examples = dictExamples.map((en, i) => ({ en, vi: vi.translations[i] || undefined, source: 'dictionary' as const }));
      }
    }
  }
  examples = mergeExample(examples, contextExample);

  const sourceType = input.sourceType ?? (input.videoId ? 'video' : input.topicId || lex ? 'topic' : 'manual');
  const saved = tx(() => {
    // Bấm lưu 2 lần: yêu cầu sau tới đây khi yêu cầu đầu đã lưu xong (giữa chừng có chờ tra từ qua mạng) → trả về từ đã có, không lỗi 500
    const dup = get<{ id: number }>('SELECT id FROM words WHERE user_id = ? AND term_key = ?', uid, key);
    if (dup) return { id: dup.id, existed: true };
    const res = run(
      `INSERT INTO words (user_id, term, term_key, pos, ipa, audio, meaning, definition, examples, synonyms, collocations, note, tags,
                          source_type, video_id, video_time, topic_id, lexicon_id, known)
       VALUES (:uid, :term, :key, :pos, :ipa, :audio, :meaning, :definition, :examples, :synonyms, :collocations, :note, :tags,
               :sourceType, :videoId, :videoTime, :topicId, :lexiconId, :known)`,
      {
        uid,
        term,
        key,
        pos,
        ipa,
        audio,
        meaning,
        definition,
        examples: JSON.stringify(examples.slice(0, 12)),
        synonyms: JSON.stringify(synonyms),
        collocations: JSON.stringify(collocations),
        note: input.note ?? '',
        tags: JSON.stringify(input.tags ?? []),
        sourceType,
        videoId: input.videoId ?? null,
        videoTime: input.videoTime ?? null,
        topicId: input.topicId ?? null,
        lexiconId: lex?.id ?? null,
        known: input.known ? 1 : 0,
      },
    );
    addActivity({ new_words: 1, xp: XP.newWord });
    return { id: Number(res.lastInsertRowid), existed: false };
  });
  return { word: getWord(saved.id), existed: saved.existed };
}

// ---------- Sửa / xoá / trạng thái ----------

export const updateSchema = z.object({
  term: z.string().trim().min(1).max(120).optional(),
  meaning: z.string().max(500).optional(),
  definition: z.string().max(1000).optional(),
  note: z.string().max(2000).optional(),
  pos: z.string().max(40).nullable().optional(),
  ipa: z.string().max(80).nullable().optional(),
  audio: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  examples: z
    .array(
      z.object({
        en: z.string().max(1000),
        vi: z.string().max(1000).optional(),
        source: z.enum(['video', 'dictionary', 'user', 'topic']).optional(),
        videoId: z.string().optional(),
        time: z.number().optional(),
      }),
    )
    .max(20)
    .optional(),
  synonyms: z.array(z.string().max(80)).max(30).optional(),
  collocations: z.array(z.string().max(120)).max(30).optional(),
  starred: z.boolean().optional(),
  known: z.boolean().optional(),
});

export function updateWord(id: number, patch: z.infer<typeof updateSchema>): WordDTO {
  if (!getWordRow(id)) notFound();
  const sets: string[] = [];
  const params: Record<string, string | number | null> = { id, uid: currentUserId() };
  const jsonFields = new Set(['tags', 'examples', 'synonyms', 'collocations']);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const col = k;
    if (k === 'term') {
      const key = termKey(String(v));
      const dup = get<{ id: number }>('SELECT id FROM words WHERE user_id = ? AND term_key = ? AND id != ?', params.uid, key, id);
      if (dup) {
        const err = new Error('Từ này đã có trong sổ') as Error & { status: number };
        err.status = 409;
        throw err;
      }
      sets.push('term_key = :term_key');
      params.term_key = key;
    }
    sets.push(`${col} = :${col}`);
    params[col] = jsonFields.has(k) ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | null);
  }
  if (sets.length) {
    run(`UPDATE words SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = :id AND user_id = :uid`, params);
  }
  return getWord(id);
}

export function deleteWord(id: number) {
  const res = run('DELETE FROM words WHERE id = ? AND user_id = ?', id, currentUserId());
  if (!res.changes) notFound();
}

const RESET_SQL = `state = 0, due = strftime('%Y-%m-%dT%H:%M:%fZ','now'), stability = 0, difficulty = 0, elapsed_days = 0,
  scheduled_days = 0, learning_steps = 0, reps = 0, lapses = 0, last_review = NULL`;

export function resetWord(id: number) {
  const res = run(`UPDATE words SET ${RESET_SQL}, known = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?`, id, currentUserId());
  if (!res.changes) notFound();
  return getWord(id);
}

export const bulkSchema = z.object({
  action: z.enum(['delete', 'known', 'unknown', 'reset', 'star', 'unstar', 'tag']),
  ids: z.array(z.number().int()).min(1).max(1000),
  tag: z.string().max(40).optional(),
});

export function bulkAction({ action, ids, tag }: z.infer<typeof bulkSchema>) {
  const placeholders = ids.map(() => '?').join(',');
  const uid = currentUserId();
  const mine = `user_id = ${Number(uid)} AND id IN (${placeholders})`;
  tx(() => {
    switch (action) {
      case 'delete':
        run(`DELETE FROM words WHERE ${mine}`, ...ids);
        break;
      case 'known':
      case 'unknown':
        run(`UPDATE words SET known = ? WHERE ${mine}`, action === 'known' ? 1 : 0, ...ids);
        break;
      case 'star':
      case 'unstar':
        run(`UPDATE words SET starred = ? WHERE ${mine}`, action === 'star' ? 1 : 0, ...ids);
        break;
      case 'reset':
        run(`UPDATE words SET ${RESET_SQL}, known = 0 WHERE ${mine}`, ...ids);
        break;
      case 'tag':
        if (!tag?.trim()) break;
        for (const id of ids) {
          const row = get<{ tags: string }>('SELECT tags FROM words WHERE id = ? AND user_id = ?', id, uid);
          if (!row) continue;
          const tags = new Set(parseJson<string[]>(row.tags, []));
          tags.add(tag.trim());
          run('UPDATE words SET tags = ? WHERE id = ?', JSON.stringify([...tags]), id);
        }
        break;
    }
  });
  return { ok: true, count: ids.length };
}

export function wordOccurrences(id: number) {
  const word = getWord(id);
  return findOccurrences(word.term).map((o) => ({
    videoId: o.video_id,
    videoTitle: o.title,
    start: o.start,
    end: o.end,
    text: o.text,
  }));
}

// ---------- Xuất dữ liệu ----------

function csvCell(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportWords(format: 'csv' | 'anki') {
  const rows = all<WordRow>(`${WORD_SELECT} WHERE w.user_id = ? ORDER BY w.created_at`, currentUserId()).map(toWordDTO);
  if (format === 'anki') {
    // Anki: Import → "Fields separated by: Tab", cho phép HTML
    return rows
      .map((w) => {
        const front = `${w.term}${w.ipa ? `<br><small>${w.ipa}</small>` : ''}`;
        const ex = w.examples[0] ? `<br><i>${w.examples[0].en}</i>${w.examples[0].vi ? `<br><small>${w.examples[0].vi}</small>` : ''}` : '';
        const back = `<b>${w.meaning}</b>${w.pos ? ` <small>(${w.pos})</small>` : ''}${w.definition ? `<br>${w.definition}` : ''}${ex}`;
        return [front, back, w.tags.join(' ')].map((s) => s.replace(/[\t\n]/g, ' ')).join('\t');
      })
      .join('\n');
  }
  const header = ['term', 'ipa', 'pos', 'meaning', 'definition', 'example', 'example_vi', 'tags', 'status', 'note', 'created_at'];
  const lines = rows.map((w) =>
    [w.term, w.ipa, w.pos, w.meaning, w.definition, w.examples[0]?.en, w.examples[0]?.vi, w.tags.join('; '), w.status, w.note, w.createdAt]
      .map(csvCell)
      .join(','),
  );
  return '﻿' + [header.join(','), ...lines].join('\n');
}
