import fs from 'node:fs';
import path from 'node:path';
import { ROOT_DIR } from '../config.ts';

/**
 * NGSL 1.2 (Browne, Culligan & Phillips — CC BY-SA 4.0): 2.809 từ gốc phổ biến nhất của tiếng Anh,
 * xếp hạng theo tần suất, kèm mọi dạng chia. Dùng làm mốc "từ đã biết" theo trình độ vì tần suất
 * của Datamuse bị nén ở nhóm từ rất phổ biến (the, would, could…).
 */
const DIR = path.join(ROOT_DIR, 'data', 'ngsl');

let cache: { rank: Map<string, number>; freq: Map<string, number>; sup: Set<string>; lemmas: { word: string; rank: number }[] } | null = null;

function load() {
  if (cache) return cache;
  const lemmaRank = new Map<string, number>();
  const lemmaFreq = new Map<string, number>();
  for (const line of fs.readFileSync(path.join(DIR, 'NGSL_12_stats.csv'), 'utf8').split(/\r?\n/).slice(1)) {
    const [w, r, , f] = line.split(',');
    if (!w) continue;
    lemmaRank.set(w.trim().toLowerCase(), Number(r));
    lemmaFreq.set(w.trim().toLowerCase(), Number(f));
  }
  const rank = new Map<string, number>();
  const freq = new Map<string, number>();
  for (const line of fs.readFileSync(path.join(DIR, 'NGSL_12_lemmatized_for_research.csv'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const forms = line.replace(/^﻿/, '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const r = lemmaRank.get(forms[0]);
    if (r === undefined) continue;
    for (const f of forms) {
      if ((rank.get(f) ?? Infinity) > r) {
        rank.set(f, r);
        freq.set(f, lemmaFreq.get(forms[0]) ?? 0);
      }
    }
  }
  const sup = new Set<string>();
  for (const line of fs.readFileSync(path.join(DIR, 'SUP_lemmatized.csv'), 'utf8').split(/\r?\n/)) {
    for (const f of line.replace(/^﻿/, '').split(',')) if (f.trim()) sup.add(f.trim().toLowerCase());
  }
  const lemmas = [...lemmaRank.entries()].map(([word, r]) => ({ word, rank: r })).sort((a, b) => a.rank - b.rank);
  cache = { rank, freq, sup, lemmas };
  return cache;
}

/** Danh sách từ gốc NGSL theo thứ hạng tần suất (1 = phổ biến nhất). */
export function ngslLemmas(): readonly { word: string; rank: number }[] {
  return load().lemmas;
}

/** Hạng NGSL của một dạng từ (1 = phổ biến nhất); 0 = từ bổ sung (thứ, tháng, số); null = ngoài danh sách. */
export function ngslRank(word: string): number | null {
  const { rank, sup } = load();
  const w = word.toLowerCase();
  if (sup.has(w)) return 0;
  return rank.get(w) ?? null;
}

/** Tần suất / triệu từ (đã điều chỉnh) của từ gốc NGSL chứa dạng này. */
export function ngslFrequency(word: string): number | null {
  return load().freq.get(word.toLowerCase()) ?? null;
}

export const NGSL_SIZE = 2809;
