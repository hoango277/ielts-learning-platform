import { ngslRank } from './ngsl.ts';
import { lemmaCandidates } from './text.ts';

/**
 * Độ phủ từ vựng (lexical coverage) của một video: tỉ lệ số lượt từ người học đã biết.
 * Ngưỡng theo nghiên cứu: ~98% để hiểu thoải mái (Hu & Nation 2000), ~95% là đủ cho nghe hiểu
 * (van Zeeland & Schmitt 2013).
 */
export interface VideoWord {
  /** Dạng từ (chữ thường) */
  w: string;
  /** Số lần xuất hiện */
  n: number;
  /** Tần suất Datamuse / triệu từ (max của dạng chia và dạng gốc); null với từ thuộc NGSL */
  f: number | null;
  /** Câu đầu tiên chứa từ */
  s: number;
}

const CONTRACTION_BASE: Record<string, string> = { ca: 'can', wo: 'will', sha: 'shall', ai: 'am' };

// Thán từ, từ đệm, âm thanh: không tính vào độ phủ
export const IGNORE = new Set(['um', 'uh', 'uhm', 'erm', 'er', 'hmm', 'mm', 'mhm', 'ah', 'oh', 'ooh', 'wow', 'yeah', 'yep', 'nope', 'okay', 'ok', 'hey', 'huh', 'aha', 'ha', 'haha', 'la', 'na', 'whoa', 'yay', 'gonna', 'wanna', 'gotta']);

/** Tách lời thoại thành các từ để đếm (bỏ số, chuẩn hoá dạng rút gọn: don't → do, can't → can). */
export function tokenizeForCoverage(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().replace(/[’‘]/g, "'").split(/[^a-z']+/)) {
    let w = raw.replace(/^'+|'+$/g, '');
    if (!w) continue;
    const m = w.match(/^([a-z]+)(n't|'s|'re|'m|'ll|'ve|'d)$/);
    if (m) w = m[2] === "n't" ? (CONTRACTION_BASE[m[1]] ?? m[1]) : m[1];
    if (w.includes("'")) w = w.split("'")[0];
    if (!w || (w.length === 1 && w !== 'a' && w !== 'i') || IGNORE.has(w)) continue;
    out.push(w);
  }
  return out;
}

export const LEVEL_RANK: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

/**
 * Mốc theo trình độ: hạng NGSL tối đa coi là đã biết, và tần suất Datamuse tối thiểu cho từ ngoài NGSL.
 * Ngưỡng Datamuse hiệu chỉnh trên dữ liệu thật: trung vị ~77 ở hạng 1–1000, ~22 ở 1001–2000, ~14 ở 2001–2809.
 */
const BASELINE: Record<string, { ngsl: number; outsideFreq: number }> = {
  A2: { ngsl: 1000, outsideFreq: 80 },
  B1: { ngsl: 2000, outsideFreq: 40 },
  B2: { ngsl: Infinity, outsideFreq: 10 },
  C1: { ngsl: Infinity, outsideFreq: 3 },
};

/** Cấp độ ước lượng của một dạng từ (NGSL trước, ngoài NGSL thì theo tần suất). */
export function estimateLevel(w: string, f: number | null): string | null {
  const r = ngslRank(w);
  if (r !== null) return r <= 500 ? 'A1' : r <= 1000 ? 'A2' : r <= 2000 ? 'B1' : 'B2';
  if (f == null) return null;
  return f >= 40 ? 'B1' : f >= 10 ? 'B2' : f >= 3 ? 'C1' : 'C2';
}

export type NotebookStatus = 'new' | 'learning' | 'reviewing' | 'mastered' | 'known';

export interface CoverageInput {
  words: VideoWord[];
  /** Trình độ nền: từ có tần suất thuộc mức này trở xuống coi như đã biết */
  vocabLevel: string;
  /** term_key → trạng thái trong sổ từ */
  notebook: Map<string, NotebookStatus>;
}

export function wordKnown(w: VideoWord, input: Pick<CoverageInput, 'vocabLevel' | 'notebook'>): 'known' | 'learning' | 'unknown' {
  const keys = [w.w, ...lemmaCandidates(w.w)];
  for (const k of keys) {
    const st = input.notebook.get(k);
    if (!st) continue;
    return st === 'new' || st === 'learning' ? 'learning' : 'known';
  }
  const base = BASELINE[input.vocabLevel] ?? BASELINE.B1;
  for (const k of keys) {
    const r = ngslRank(k);
    if (r !== null && r <= base.ngsl) return 'known';
  }
  if (ngslRank(w.w) === null && w.f != null && w.f >= base.outsideFreq) return 'known';
  return 'unknown';
}

/** Độ "đáng học" của từ mới: từ NGSL hạng cao trước, rồi đến từ ngoài NGSL tần suất cao. */
function usefulness(w: VideoWord) {
  const r = ngslRank(w.w);
  return r !== null ? 1_000_000 - r : (w.f ?? 0);
}

export function difficultyLabel(coverage: number): 'easy' | 'fit' | 'hard' {
  if (coverage >= 0.98) return 'easy';
  if (coverage >= 0.95) return 'fit';
  return 'hard';
}

export function computeCoverage(input: CoverageInput) {
  let total = 0;
  let known = 0;
  let learning = 0;
  const unknown: VideoWord[] = [];
  const learningWords: VideoWord[] = [];
  for (const w of input.words) {
    total += w.n;
    const k = wordKnown(w, input);
    if (k === 'known') known += w.n;
    else if (k === 'learning') {
      learning += w.n;
      learningWords.push(w);
    } else unknown.push(w);
  }
  const coverage = total ? known / total : 0;
  // Từ mới đáng học trước: xuất hiện nhiều lần và tương đối phổ biến (bỏ từ cực hiếm thường là tên riêng / lỗi phụ đề)
  const topNew = [...unknown]
    .filter((w) => w.w.length > 2)
    .sort((a, b) => b.n - a.n || usefulness(b) - usefulness(a))
    .slice(0, 10);
  return {
    coverage,
    label: difficultyLabel(coverage),
    totalTokens: total,
    knownTokens: known,
    learningTokens: learning,
    newWords: unknown.length,
    learningWords: learningWords.length,
    topNew,
  };
}
