/**
 * Chỉ số trôi chảy cho bài 4/3/2 (Nation 1989): tốc độ nói, quãng ngừng, độ dài đoạn nói liền, từ đệm.
 * Quãng ngừng đo ở máy khách từ âm lượng micro; ở đây chỉ đếm từ đệm và tính các tỉ lệ.
 */

// "kind of / sort of" chỉ tính là từ đệm khi không đứng sau mạo từ/từ hạn định (a kind of fruit là dùng thật)
const FILLER_PATTERNS: [string, RegExp][] = [
  ['um/uh', /\b(?:um+|uh+|uhm|erm|er|hmm+|ah+|mm+)\b/gi],
  ['you know', /\byou know\b(?!\s+(?:what|how|why|where|when|who|that|if|the|a|an|my|your|his|her|it|them))/gi],
  ['I mean', /\bi mean\b/gi],
  ['kind of / sort of', /(?<!\b(?:a|the|this|that|what|any|some|every|each|one|same|which|these|those|no)\s)\b(?:kind|sort) of\b/gi],
  ['basically', /\bbasically\b/gi],
  ['actually', /\bactually\b/gi],
  ['literally', /\bliterally\b/gi],
  ['like (quotative)', /\b(?:was|were|i'm|he's|she's|they're|we're) like\b(?!\s+(?:a|an|the|this|that|it|him|her|them|me|you|us)\b)/gi],
];

export function countFillers(text: string): { total: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};
  let total = 0;
  for (const [name, re] of FILLER_PATTERNS) {
    const n = text.match(re)?.length ?? 0;
    if (n) {
      byType[name] = n;
      total += n;
    }
  }
  return { total, byType };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export interface RoundInput {
  durationSec: number;
  speechSec: number;
  wordCount: number;
  pauseCount: number;
  longPauses: number;
  pauseSec: number;
}

/** Số từ/phút trên tổng thời gian và độ dài trung bình một đoạn nói liền (số từ / số đoạn). */
export function roundMetrics(r: RoundInput) {
  const minutes = Math.max(r.durationSec, 1) / 60;
  const wpm = r.wordCount / minutes;
  const runs = Math.max(1, r.pauseCount + 1);
  return {
    wpm: Math.round(wpm * 10) / 10,
    meanRun: Math.round((r.wordCount / runs) * 10) / 10,
    longPausesPerMin: Math.round((r.longPauses / minutes) * 10) / 10,
    speechRatio: r.durationSec ? Math.round((r.speechSec / r.durationSec) * 100) / 100 : 0,
  };
}
