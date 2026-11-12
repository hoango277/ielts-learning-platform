import { z } from 'zod';
import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { startOfLocalDay } from '../lib/time.ts';
import { inflectionRegex, irregularVariants, shuffle } from '../lib/text.ts';
import { addActivity, XP } from './activity.service.ts';
import { toPhraseDTO, type PhraseRow } from './phrases.service.ts';
import { translateText } from './translate/index.ts';
import type { Example } from './words.service.ts';

/**
 * Luyện nói lại không cần AI chấm điểm:
 *  - cloze: nhìn câu đã lưu bị che cụm cần học, nói cả câu → kiểm tra có nói đúng cụm không
 *  - delayed: nghe đoạn gốc, chờ vài giây rồi nói lại → so từng từ (máy khách tính điểm)
 *  - own: tự đặt câu với từ trong sổ → kiểm tra có dùng từ (kể cả dạng chia) và câu đủ dài
 *  - vi: thấy nghĩa tiếng Việt của cụm ngắn → nói cụm tiếng Anh
 */
export const MODES = ['cloze', 'delayed', 'own', 'vi'] as const;
export type SpeakMode = (typeof MODES)[number];

export const sessionSchema = z.object({
  mode: z.enum(MODES).default('cloze'),
  count: z.coerce.number().int().min(1).max(30).default(5),
  videoId: z.string().optional(),
});

interface OwnWordRow {
  id: number;
  term: string;
  meaning: string;
  pos: string | null;
  ipa: string | null;
  audio: string | null;
  collocations: string;
  examples: string;
}

export function createSession({ mode, count, videoId }: z.infer<typeof sessionSchema>) {
  const uid = currentUserId();
  const now = new Date().toISOString();
  if (mode === 'own') {
    // Ưu tiên từ đang học/đang ôn, ít khi được tự đặt câu
    const rows = all<OwnWordRow>(
      `SELECT w.id, w.term, w.meaning, w.pos, w.ipa, w.audio, w.collocations, w.examples
         FROM words w
        WHERE w.user_id = ? AND w.known = 0 AND w.meaning != '' AND length(w.term) <= 40
        ORDER BY (SELECT COUNT(*) FROM speaking_attempts s WHERE s.word_id = w.id AND s.user_id = w.user_id AND s.passed = 1),
                 CASE WHEN w.state IN (1,2,3) THEN 0 ELSE 1 END, random()
        LIMIT ?`,
      uid,
      count,
    );
    return {
      mode,
      phrases: [],
      words: rows.map((r) => ({
        id: r.id,
        term: r.term,
        meaning: r.meaning,
        pos: r.pos,
        ipa: r.ipa,
        audio: r.audio,
        collocations: parseJson<string[]>(r.collocations, []).slice(0, 4),
        example: parseJson<Example[]>(r.examples, [])[0]?.en ?? null,
      })),
    };
  }
  const filters = ['p.user_id = :uid'];
  if (mode === 'cloze') filters.push("p.chunk != ''");
  if (mode === 'vi') filters.push("p.chunk != '' AND p.chunk_vi != '' AND length(p.chunk) <= 60");
  if (videoId) filters.push('p.video_id = :videoId');
  // Câu đến hạn ôn trước, rồi câu ít luyện nói nhất
  const rows = all<PhraseRow>(
    `SELECT p.*, v.title AS video_title FROM phrases p LEFT JOIN videos v ON v.id = p.video_id
      WHERE ${filters.join(' AND ')}
      ORDER BY CASE WHEN p.state != 0 AND p.due <= :now THEN 0 ELSE 1 END, p.speak_count, random()
      LIMIT :count`,
    { uid, now, count, videoId: videoId ?? null },
  );
  return { mode, phrases: shuffle(rows).map(toPhraseDTO), words: [] };
}

export const attemptSchema = z.object({
  mode: z.enum(MODES),
  phraseId: z.number().int().optional(),
  wordId: z.number().int().optional(),
  // Không nhận lượt nói rỗng (lỗi micro, không nghe thấy gì) — không được tính là một lần thử
  transcript: z.string().trim().min(1, 'Chưa nghe thấy câu trả lời — hãy thử lại.').max(2000),
  /** Điểm khớp từng từ (0–1) do máy khách tính cho bài nghe–chờ–nói */
  score: z.number().min(0).max(1).optional(),
});

const wordCount = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Kiểm tra cụm/từ đích có xuất hiện trong câu nói (chấp nhận dạng chia -s/-ed/-ing). */
export function findTarget(target: string, transcript: string) {
  if (!target.trim()) return null;
  for (const t of [target, ...irregularVariants(target)]) {
    const m = transcript.match(inflectionRegex(t));
    if (m) return m[0];
  }
  return null;
}

export function recordAttempt(input: z.infer<typeof attemptSchema>) {
  const uid = currentUserId();
  let passed = false;
  let matched: string | null = null;
  let target = '';
  let score = input.score ?? null;
  const words = wordCount(input.transcript);

  if (input.mode === 'own') {
    const w = get<{ term: string }>('SELECT term FROM words WHERE id = ? AND user_id = ?', input.wordId ?? 0, uid);
    if (!w) throw Object.assign(new Error('Không tìm thấy từ'), { status: 404 });
    target = w.term;
    matched = findTarget(w.term, input.transcript);
    passed = Boolean(matched) && words >= 5;
    score = passed ? 1 : matched ? 0.5 : 0;
  } else {
    const p = get<{ chunk: string; sentence: string }>('SELECT chunk, sentence FROM phrases WHERE id = ? AND user_id = ?', input.phraseId ?? 0, uid);
    if (!p) throw Object.assign(new Error('Không tìm thấy mẫu câu'), { status: 404 });
    target = p.chunk;
    matched = p.chunk ? findTarget(p.chunk, input.transcript) : null;
    if (input.mode === 'delayed') passed = (score ?? 0) >= 0.8;
    else {
      passed = Boolean(matched);
      score = passed ? 1 : 0;
    }
  }

  const xp = passed ? XP.speakPassed : input.transcript.trim() ? XP.speakTried : 0;
  tx(() => {
    run(
      'INSERT INTO speaking_attempts (user_id, mode, phrase_id, word_id, transcript, score, passed) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid,
      input.mode,
      // Chỉ lưu id đã kiểm tra thuộc người dùng ở trên (từ ở chế độ tự đặt câu, mẫu câu ở các chế độ còn lại)
      input.mode === 'own' ? null : (input.phraseId ?? null),
      input.mode === 'own' ? (input.wordId ?? null) : null,
      input.transcript.trim(),
      score,
      passed ? 1 : 0,
    );
    if (input.mode !== 'own' && input.phraseId) {
      run(
        'UPDATE phrases SET speak_count = speak_count + 1, best_score = MAX(COALESCE(best_score, 0), ?) WHERE id = ? AND user_id = ?',
        score ?? 0,
        input.phraseId,
        uid,
      );
    }
    addActivity({ speaking_items: 1, xp });
  });
  return { passed, matched, target, wordCount: words, score, xp };
}

export const ownExampleSchema = z.object({ wordId: z.number().int(), sentence: z.string().trim().min(5).max(500) });

/** Lưu câu tự đặt làm ví dụ riêng của từ (đặt lên đầu danh sách ví dụ). */
export async function saveOwnExample({ wordId, sentence }: z.infer<typeof ownExampleSchema>) {
  const uid = currentUserId();
  const row = get<{ examples: string; term: string }>('SELECT examples, term FROM words WHERE id = ? AND user_id = ?', wordId, uid);
  if (!row) throw Object.assign(new Error('Không tìm thấy từ'), { status: 404 });
  const text = sentence.charAt(0).toUpperCase() + sentence.slice(1).replace(/\s+/g, ' ');
  const en = /[.!?]$/.test(text) ? text : `${text}.`;
  const vi = (await translateText(en).catch(() => null))?.translation;
  const examples = parseJson<Example[]>(row.examples, []).filter((e) => e.en.toLowerCase() !== en.toLowerCase());
  examples.unshift({ en, vi, source: 'user' });
  tx(() => {
    run("UPDATE words SET examples = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?", JSON.stringify(examples.slice(0, 12)), wordId, uid);
    addActivity({ xp: XP.ownSentence });
  });
  return { ok: true, example: examples[0], xp: XP.ownSentence };
}

/** Số lượt luyện nói hôm nay theo dạng bài (cho kế hoạch học trong ngày). */
export function todayCounts() {
  const rows = all<{ mode: string; n: number }>(
    'SELECT mode, COUNT(*) AS n FROM speaking_attempts WHERE user_id = ? AND created_at >= ? GROUP BY mode',
    currentUserId(),
    startOfLocalDay().toISOString(),
  );
  return Object.fromEntries(rows.map((r) => [r.mode, r.n])) as Partial<Record<SpeakMode, number>>;
}

export function stats() {
  const uid = currentUserId();
  const r = get<{ total: number; passed: number; own: number }>(
    `SELECT COUNT(*) AS total, SUM(passed) AS passed, SUM(CASE WHEN mode = 'own' AND passed = 1 THEN 1 ELSE 0 END) AS own
       FROM speaking_attempts WHERE user_id = ?`,
    uid,
  )!;
  const phrases = get<{ n: number }>('SELECT COUNT(*) AS n FROM phrases WHERE user_id = ?', uid)!.n;
  const chunks = get<{ n: number }>("SELECT COUNT(*) AS n FROM phrases WHERE user_id = ? AND chunk != ''", uid)!.n;
  const words = get<{ n: number }>("SELECT COUNT(*) AS n FROM words WHERE user_id = ? AND known = 0 AND meaning != ''", uid)!.n;
  return { total: r.total ?? 0, passed: r.passed ?? 0, ownSentences: r.own ?? 0, phrases, chunks, words, today: todayCounts() };
}
