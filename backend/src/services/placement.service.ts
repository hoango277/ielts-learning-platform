import { z } from 'zod';
import { PSEUDOWORDS } from '../data/pseudowords.ts';
import { all, get, parseJson, run } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { ngslLemmas, ngslRank } from '../lib/ngsl.ts';
import { shuffle } from '../lib/text.ts';
import { updateSettings, type Settings } from './settings.service.ts';

/**
 * Bài test ước lượng vốn từ ~3 phút, dạng "Biết / Không biết" có trộn từ giả (Meara & Buxton 1987; LexTALE):
 * từ được bốc theo 5 nhóm tần suất khớp đúng các mốc app dùng để tính độ khó video (NGSL theo hạng,
 * ngoài NGSL theo tần suất Datamuse). Tỉ lệ chọn "Biết" cho từ giả dùng để hiệu chỉnh đoán mò:
 * điểm nhóm = (tỉ lệ biết − tỉ lệ từ giả) / (1 − tỉ lệ từ giả).
 */
export interface Band {
  key: 'b1' | 'b2' | 'b3' | 'b4' | 'b5';
  label: string;
  /** Số từ (ước lượng) của nhóm — để quy đổi ra vốn từ */
  size: number;
}

export const BANDS: Band[] = [
  { key: 'b1', label: '1.000 từ phổ biến nhất', size: 1000 },
  { key: 'b2', label: '1.001–2.000', size: 1000 },
  { key: 'b3', label: '2.001–2.800 (hết NGSL)', size: 809 },
  { key: 'b4', label: 'Từ học thuật / chủ đề thường gặp', size: 2000 },
  { key: 'b5', label: 'Từ ít gặp hơn', size: 3000 },
];

const PER_BAND = 8;
const PSEUDO_COUNT = 12;
/** Ngưỡng "đã biết phần lớn nhóm này" */
const PASS = 0.8;
const PASS_UPPER = 0.7;

let lemmaRanks: Map<string, number> | null = null;

function bandOfWord(word: string, lexFreq: Map<string, number>): Band['key'] | 'pseudo' | null {
  const w = word.toLowerCase();
  if (PSEUDOWORDS.includes(w)) return 'pseudo';
  // Đề bốc theo hạng của từ gốc → chấm cũng theo hạng từ gốc (ngslRank trả hạng thấp nhất trong các từ gốc
  // có chung dạng chia, vd. "found" là quá khứ của "find", nên có thể lệch nhóm)
  lemmaRanks ??= new Map(ngslLemmas().map((l) => [l.word, l.rank]));
  const r = lemmaRanks.get(w) ?? ngslRank(w);
  if (r !== null && r > 0) return r <= 1000 ? 'b1' : r <= 2000 ? 'b2' : 'b3';
  const f = lexFreq.get(w);
  if (f == null) return null;
  return f >= 10 ? 'b4' : f >= 3 ? 'b5' : null;
}

function lexiconOutsideNgsl() {
  const rows = all<{ word: string; frequency: number }>(
    "SELECT word, frequency FROM lexicon WHERE instr(word, ' ') = 0 AND frequency IS NOT NULL AND length(word) >= 4",
  );
  return rows.filter((r) => /^[a-z]+$/.test(r.word) && ngslRank(r.word) === null);
}

/** Đề test: 40 từ thật (8 từ × 5 nhóm) + 12 từ giả, trộn ngẫu nhiên. */
export function createTest() {
  // Bỏ hư từ ngắn ở nhóm đầu (the, and…) — ai cũng biết, không đo được gì
  const lemmas = ngslLemmas().filter((l) => /^[a-z]{4,}$/.test(l.word));
  const pick = (from: number, to: number) => shuffle(lemmas.filter((l) => l.rank >= from && l.rank <= to)).slice(0, PER_BAND).map((l) => l.word);
  const outside = lexiconOutsideNgsl();
  const byFreq = (lo: number, hi: number) =>
    shuffle(outside.filter((r) => r.frequency >= lo && r.frequency < hi))
      .slice(0, PER_BAND)
      .map((r) => r.word);
  const words = [...pick(150, 1000), ...pick(1001, 2000), ...pick(2001, 2809), ...byFreq(10, 40), ...byFreq(3, 10), ...shuffle(PSEUDOWORDS).slice(0, PSEUDO_COUNT)];
  return { items: shuffle(words), bands: BANDS, perBand: PER_BAND, pseudo: PSEUDO_COUNT };
}

export const resultSchema = z.object({
  answers: z.array(z.object({ word: z.string().max(40), known: z.boolean() })).min(10).max(120),
  apply: z.boolean().default(false),
});

export interface BandScore extends Band {
  known: number;
  total: number;
  corrected: number;
}

/** Chấm điểm (hàm thuần — dùng cho unit test). */
export function scoreAnswers(answers: { band: Band['key'] | 'pseudo'; known: boolean }[]) {
  const pseudo = answers.filter((a) => a.band === 'pseudo');
  const falseAlarm = pseudo.length ? pseudo.filter((a) => a.known).length / pseudo.length : 0;
  const bands: BandScore[] = BANDS.map((b) => {
    const items = answers.filter((a) => a.band === b.key);
    const known = items.filter((a) => a.known).length;
    const hit = items.length ? known / items.length : 0;
    const corrected = falseAlarm >= 1 ? 0 : Math.max(0, (hit - falseAlarm) / (1 - falseAlarm));
    return { ...b, known, total: items.length, corrected: Math.round(corrected * 100) / 100 };
  });
  const c = Object.fromEntries(bands.map((b) => [b.key, b.corrected])) as Record<Band['key'], number>;
  // Mốc trình độ khớp với cách app tính "từ đã biết" khi đo độ khó video (xem lib/coverage.ts)
  let level: Settings['vocabLevel'] = 'A2';
  if (c.b1 >= PASS && c.b2 >= PASS) level = 'B1';
  if (level === 'B1' && c.b3 >= PASS && c.b4 >= PASS_UPPER) level = 'B2';
  if (level === 'B2' && c.b5 >= PASS_UPPER) level = 'C1';
  const size = Math.round(bands.reduce((s, b) => s + b.corrected * b.size, 0) / 100) * 100;
  return {
    level,
    size,
    falseAlarm: Math.round(falseAlarm * 100) / 100,
    bands,
    warning: falseAlarm > 0.25 ? 'Bạn chọn “Biết” cho khá nhiều từ không có thật — hãy chỉ chọn khi chắc chắn hiểu nghĩa. Kết quả có thể chưa chính xác.' : null,
  };
}

export function submitResult(input: z.infer<typeof resultSchema>) {
  const lexFreq = new Map(lexiconOutsideNgsl().map((r) => [r.word, r.frequency]));
  const graded = input.answers
    .map((a) => ({ band: bandOfWord(a.word, lexFreq), known: a.known }))
    .filter((a): a is { band: Band['key'] | 'pseudo'; known: boolean } => a.band !== null);
  const result = scoreAnswers(graded);
  run(
    'INSERT INTO placement_results (user_id, level, size, false_alarm, detail) VALUES (?, ?, ?, ?, ?)',
    currentUserId(),
    result.level,
    result.size,
    result.falseAlarm,
    JSON.stringify(result.bands),
  );
  if (input.apply) updateSettings({ vocabLevel: result.level });
  return { ...result, applied: input.apply };
}

export function lastResult() {
  const row = get<{ level: string; size: number; false_alarm: number; detail: string; created_at: string }>(
    'SELECT level, size, false_alarm, detail, created_at FROM placement_results WHERE user_id = ? ORDER BY id DESC LIMIT 1',
    currentUserId(),
  );
  return row ? { level: row.level, size: row.size, falseAlarm: row.false_alarm, bands: parseJson<BandScore[]>(row.detail, []), createdAt: row.created_at } : null;
}
