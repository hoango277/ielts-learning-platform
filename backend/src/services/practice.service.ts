import { Rating } from 'ts-fsrs';
import { z } from 'zod';
import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { inflectionRegex, shuffle, termKey, uniqBy } from '../lib/text.ts';
import { addActivity, XP } from './activity.service.ts';
import { applyRating } from './review.service.ts';
import { assertTopicVisible, SHARED_LEXICON_SQL, visibleTopicsSql } from './topics.service.ts';
import { collocationQuestions, synonymItems, upgradeQuestions, wordFormQuestions } from './practice-extra.service.ts';
import type { Example } from './words.service.ts';

export const sessionSchema = z.object({
  mode: z.enum(['quiz', 'cloze', 'listening', 'spelling', 'match', 'mixed', 'collocation', 'wordform', 'synonym', 'upgrade']).default('mixed'),
  source: z.enum(['all', 'due', 'weak', 'new', 'recent', 'starred', 'topic', 'video']).default('all'),
  topicId: z.coerce.number().int().optional(),
  videoId: z.string().optional(),
  count: z.coerce.number().int().min(4).max(50).default(10),
});

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
  /** Giải thích hiện sau khi trả lời (sắc thái, collocation, họ từ) */
  explain?: string;
}

interface WordLike {
  id: number;
  term: string;
  meaning: string;
  pos: string | null;
  ipa: string | null;
  audio: string | null;
  definition: string;
  examples: string;
}

function fromWord(r: WordLike): PracticeItem {
  return {
    key: `w:${r.id}`,
    wordId: r.id,
    lexiconId: null,
    term: r.term,
    meaning: r.meaning,
    pos: r.pos,
    ipa: r.ipa,
    audio: r.audio,
    definition: r.definition,
    examples: parseJson<Example[]>(r.examples, []),
  };
}

interface LexRow {
  id: number;
  word: string;
  meaning_vi: string;
  pos: string | null;
  ipa: string | null;
  ipa_us: string | null;
  audio: string | null;
  audio_us: string | null;
  definitions: string;
  examples: string;
  word_id: number | null;
}

function fromLexicon(r: LexRow): PracticeItem {
  return {
    key: `l:${r.id}`,
    wordId: r.word_id,
    lexiconId: r.id,
    term: r.word,
    meaning: r.meaning_vi,
    pos: r.pos,
    ipa: r.ipa_us ?? r.ipa,
    audio: r.audio_us ?? r.audio,
    definition: parseJson<{ definition: string }[]>(r.definitions, [])[0]?.definition ?? '',
    examples: parseJson<Example[]>(r.examples, []),
  };
}

const WORD_COLS = 'id, term, meaning, pos, ipa, audio, definition, examples';

export function pickItems(source: z.infer<typeof sessionSchema>['source'], count: number, topicId?: number, videoId?: string): PracticeItem[] {
  const now = new Date().toISOString();
  const pool = Math.max(count * 3, 30);
  const uid = Number(currentUserId());
  let rows: WordLike[] = [];
  switch (source) {
    case 'due':
      rows = all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND known = 0 AND state != 0 AND due <= ? ORDER BY due LIMIT ?`, now, count);
      break;
    case 'weak':
      rows = all<WordLike>(
        `SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND (wrong_count > 0 OR lapses > 0)
         ORDER BY (wrong_count + lapses * 2 - correct_count) DESC, difficulty DESC LIMIT ?`,
        count,
      );
      break;
    case 'new':
      rows = all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND state = 0 AND known = 0 ORDER BY created_at DESC LIMIT ?`, count);
      break;
    case 'recent':
      rows = shuffle(all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} ORDER BY created_at DESC LIMIT ?`, pool)).slice(0, count);
      break;
    case 'starred':
      rows = all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND starred = 1 ORDER BY random() LIMIT ?`, count);
      break;
    case 'video':
      rows = all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND video_id = ? ORDER BY random() LIMIT ?`, videoId ?? '', count);
      break;
    case 'topic': {
      // Bộ riêng của người khác → 404 (không lộ từ trong "Bộ từ của tôi" của ai khác)
      if (topicId) assertTopicVisible(topicId);
      const lex = all<LexRow>(
        `SELECT l.*, w.id AS word_id FROM topic_words tw JOIN lexicon l ON l.id = tw.lexicon_id
           LEFT JOIN words w ON w.term_key = l.word AND w.user_id = ${uid}
          WHERE tw.topic_id = ? AND l.meaning_vi != '' ORDER BY random() LIMIT ?`,
        topicId ?? 0,
        count,
      );
      return lex.map(fromLexicon);
    }
    default:
      rows = all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND known = 0 ORDER BY random() LIMIT ?`, count);
      if (rows.length < count) {
        rows.push(...all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND known = 1 ORDER BY random() LIMIT ?`, count - rows.length));
      }
  }
  return rows.filter((r) => r.meaning?.trim()).map(fromWord);
}

/** Kho đáp án nhiễu: từ trong sổ + từ điển chủ đề. */
function distractorPool(exclude: Set<string>, topicId?: number): PracticeItem[] {
  const uid = Number(currentUserId());
  const words = all<WordLike>(`SELECT ${WORD_COLS} FROM words WHERE user_id = ${uid} AND meaning != '' ORDER BY random() LIMIT 150`).map(fromWord);
  const lex = all<LexRow>(
    topicId
      ? `SELECT l.*, NULL AS word_id FROM topic_words tw JOIN lexicon l ON l.id = tw.lexicon_id
          WHERE tw.topic_id = ${Number(topicId)} AND tw.topic_id IN (${visibleTopicsSql(uid)}) AND l.meaning_vi != '' ORDER BY random() LIMIT 150`
      : // Chỉ lấy từ của bộ chung (không lấy từ trong bộ riêng của người khác làm đáp án nhiễu)
        `SELECT l.*, NULL AS word_id FROM lexicon l WHERE l.meaning_vi != '' AND l.id IN (${SHARED_LEXICON_SQL}) ORDER BY random() LIMIT 150`,
  ).map(fromLexicon);
  return uniqBy([...words, ...lex], (i) => termKey(i.term)).filter((i) => !exclude.has(termKey(i.term)));
}

function pickOptions(target: PracticeItem, pool: PracticeItem[], field: 'meaning' | 'term', n = 4): string[] {
  const norm = (s: string) => s.toLowerCase().trim();
  const answer = target[field];
  const samePos = pool.filter((p) => p.pos && target.pos && p.pos === target.pos);
  const candidates = uniqBy([...shuffle(samePos), ...shuffle(pool)], (p) => norm(p[field])).filter(
    (p) => p[field] && norm(p[field]) !== norm(answer) && !norm(p[field]).includes(norm(answer)) && !norm(answer).includes(norm(p[field])),
  );
  return shuffle([answer, ...candidates.slice(0, n - 1).map((p) => p[field])]);
}

function maskHint(term: string) {
  return term
    .split(' ')
    .map((w) => w[0] + w.slice(1).replace(/[\p{L}]/gu, '_'))
    .join(' ');
}

function buildCloze(item: PracticeItem): Pick<Question, 'sentence' | 'sentenceVi' | 'accept'> | null {
  const re = inflectionRegex(item.term);
  for (const ex of shuffle(item.examples)) {
    const m = ex.en.match(re);
    if (m && m.index !== undefined) {
      return {
        sentence: ex.en.slice(0, m.index) + '_____' + ex.en.slice(m.index + m[0].length),
        sentenceVi: ex.vi,
        accept: [...new Set([item.term, m[0]])],
      };
    }
  }
  return null;
}

function makeQuestion(item: PracticeItem, type: QuestionType, pool: PracticeItem[], idx: number): Question {
  const id = `${item.key}:${idx}`;
  switch (type) {
    case 'mcq_meaning':
      return { id, type, item, prompt: item.term, options: pickOptions(item, pool, 'meaning'), answer: item.meaning };
    case 'mcq_term':
      return { id, type, item, prompt: item.meaning, options: pickOptions(item, pool, 'term'), answer: item.term };
    case 'mcq_definition':
      return { id, type, item, prompt: item.definition, options: pickOptions(item, pool, 'term'), answer: item.term };
    case 'cloze': {
      const cloze = buildCloze(item);
      if (cloze) return { id, type, item, prompt: item.meaning, ...cloze, hint: maskHint(item.term), answer: item.term };
      return makeQuestion(item, 'spelling', pool, idx);
    }
    case 'listening':
      return { id, type, item, prompt: 'Nghe và gõ lại từ', hint: maskHint(item.term), answer: item.term, accept: [item.term] };
    case 'spelling':
    default:
      return { id, type: 'spelling', item, prompt: item.meaning, hint: maskHint(item.term), answer: item.term, accept: [item.term] };
  }
}

function typesFor(mode: z.infer<typeof sessionSchema>['mode'], item: PracticeItem): QuestionType[] {
  const hasCloze = item.examples.some((e) => inflectionRegex(item.term).test(e.en));
  const hasDef = Boolean(item.definition);
  switch (mode) {
    case 'quiz':
      return ['mcq_meaning', 'mcq_term', ...(hasDef ? (['mcq_definition'] as const) : [])];
    case 'cloze':
      return [hasCloze ? 'cloze' : 'spelling'];
    case 'listening':
      return ['listening'];
    case 'spelling':
      return ['spelling'];
    default:
      return ['mcq_meaning', 'mcq_term', 'listening', 'spelling', ...(hasCloze ? (['cloze', 'cloze'] as const) : []), ...(hasDef ? (['mcq_definition'] as const) : [])];
  }
}

export async function createSession(input: z.infer<typeof sessionSchema>) {
  // Bài về cách dùng từ: dữ liệu soạn sẵn + WordNet, không cần từ có nghĩa tiếng Việt
  if (input.mode === 'collocation') return { mode: input.mode, items: [] as PracticeItem[], questions: collocationQuestions(input.count) };
  if (input.mode === 'upgrade') return { mode: input.mode, items: [] as PracticeItem[], questions: upgradeQuestions(input.count) };
  if (input.mode === 'wordform') {
    const base = pickItems(input.source, input.count * 2, input.topicId, input.videoId);
    return { mode: input.mode, items: [] as PracticeItem[], questions: wordFormQuestions(input.count, base) };
  }
  if (input.mode === 'synonym') {
    const base = pickItems(input.source, 16, input.topicId, input.videoId);
    return { mode: input.mode, items: await synonymItems(Math.min(input.count, 8), base), questions: [] as Question[] };
  }
  const items = pickItems(input.source, input.mode === 'match' ? Math.min(input.count, 8) : input.count, input.topicId, input.videoId);
  if (input.mode === 'match') return { mode: input.mode, items, questions: [] as Question[] };
  const pool = distractorPool(new Set(items.map((i) => termKey(i.term))), input.topicId);
  const fullPool = [...items, ...pool];
  const questions = items.map((item, idx) => {
    const types = typesFor(input.mode, item);
    return makeQuestion(item, types[Math.floor(Math.random() * types.length)], fullPool.filter((p) => p.key !== item.key), idx);
  });
  return { mode: input.mode, items, questions };
}

export const answerSchema = z.object({
  wordId: z.number().int().nullable().optional(),
  correct: z.boolean(),
  mode: z.string().max(30).default('practice'),
});

/** Ghi nhận câu trả lời; nếu từ đang đến hạn ôn thì tính luôn như một lần ôn (Nhớ / Quên). */
export function recordAnswer({ wordId, correct, mode }: z.infer<typeof answerSchema>) {
  let rescheduled = false;
  tx(() => {
    if (wordId) {
      const row = get<{ id: number; known: number; state: number; due: string }>('SELECT id, known, state, due FROM words WHERE user_id = ? AND id = ?', currentUserId(), wordId);
      if (row) {
        run(
          `UPDATE words SET ${correct ? 'correct_count = correct_count + 1' : 'wrong_count = wrong_count + 1'} WHERE id = ? AND user_id = ?`,
          wordId,
          currentUserId(),
        );
        if (!row.known && row.state !== 0 && row.due <= new Date().toISOString()) {
          applyRating(wordId, correct ? Rating.Good : Rating.Again, `practice:${mode}`, 0);
          rescheduled = true;
        }
      }
    }
    addActivity({ practice_total: 1, practice_correct: correct ? 1 : 0, xp: correct ? XP.practiceCorrect : 0 });
  });
  return { ok: true, rescheduled, xp: correct ? XP.practiceCorrect : 0 };
}

export const completeSchema = z.object({
  mode: z.string().max(30),
  total: z.number().int().min(0).max(500),
  correct: z.number().int().min(0).max(500),
  durationSec: z.number().int().min(0).max(36000).default(0),
}).refine((d) => d.correct <= d.total, { message: 'Số câu đúng không thể lớn hơn tổng số câu' });

export function completeSession(input: z.infer<typeof completeSchema>) {
  const accuracy = input.total ? input.correct / input.total : 0;
  const bonus = input.total >= 4 ? XP.sessionBonus + (accuracy === 1 ? XP.perfectBonus : 0) : 0;
  tx(() => {
    run(
      'INSERT INTO practice_sessions (user_id, mode, total, correct, duration_sec, xp) VALUES (?, ?, ?, ?, ?, ?)',
      currentUserId(),
      input.mode,
      input.total,
      input.correct,
      input.durationSec,
      bonus,
    );
    addActivity({ xp: bonus });
  });
  return { bonusXp: bonus, accuracy };
}
