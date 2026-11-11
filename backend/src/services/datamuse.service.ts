import { all, get, run } from '../db/index.ts';
import { createLimiter, dedupe, fetchJson } from '../lib/http.ts';

/**
 * Datamuse (miễn phí, không cần khoá): tần suất từ, từ đồng nghĩa, collocation tính từ–danh từ.
 * Kết quả cache trong bảng ext_cache (30 ngày) và word_freq (dùng chung cho mọi người dùng).
 */
export interface DmWord {
  word: string;
  score: number;
  tags?: string[];
}

const limit = createLimiter(6, 30);
const once = dedupe<DmWord[]>();
const TTL_MS = 30 * 86400_000;

export async function datamuse(qs: string): Promise<DmWord[]> {
  const key = `dm:${qs}`;
  const row = get<{ data: string; created_at: string }>('SELECT data, created_at FROM ext_cache WHERE key = ?', key);
  if (row && Date.now() - new Date(row.created_at).getTime() < TTL_MS) return JSON.parse(row.data) as DmWord[];
  return once(key, async () => {
    const data = await limit(() => fetchJson<DmWord[]>(`https://api.datamuse.com/words?${qs}`, { timeoutMs: 10000, retries: 2 }));
    run(
      `INSERT INTO ext_cache (key, data, created_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
      key,
      JSON.stringify(data),
    );
    return data;
  });
}

export const freqTag = (w: DmWord) => {
  const t = w.tags?.find((x) => x.startsWith('f:'));
  return t ? Number(t.slice(2)) : null;
};

export const posTags = (w: DmWord) => (w.tags ?? []).filter((t) => ['n', 'v', 'adj', 'adv'].includes(t));

/** Tần suất (số lần / 1 triệu từ, Google Books Ngram) của nhiều từ; ưu tiên cache, còn thiếu thì hỏi Datamuse. */
export async function wordFrequencies(words: string[], opts: { onProgress?: (done: number, total: number) => void } = {}) {
  const uniq = [...new Set(words.map((w) => w.toLowerCase()).filter((w) => /^[a-z][a-z'-]*$/.test(w) && w.length <= 30))];
  const out = new Map<string, number | null>();
  for (let i = 0; i < uniq.length; i += 400) {
    const chunk = uniq.slice(i, i + 400);
    const rows = all<{ word: string; freq: number | null }>(
      `SELECT word, freq FROM word_freq WHERE word IN (${chunk.map(() => '?').join(',')})`,
      ...chunk,
    );
    for (const r of rows) out.set(r.word, r.freq);
  }
  // Bộ từ chủ đề đã có tần suất khi crawl
  const missingLex = uniq.filter((w) => !out.has(w));
  for (let i = 0; i < missingLex.length; i += 400) {
    const chunk = missingLex.slice(i, i + 400);
    for (const r of all<{ word: string; frequency: number | null }>(
      `SELECT word, frequency FROM lexicon WHERE frequency IS NOT NULL AND word IN (${chunk.map(() => '?').join(',')})`,
      ...chunk,
    )) {
      out.set(r.word, r.frequency);
      saveFreq(r.word, r.frequency);
    }
  }
  const missing = uniq.filter((w) => !out.has(w));
  let done = 0;
  await Promise.all(
    missing.map((w) =>
      limit(() => fetchJson<DmWord[]>(`https://api.datamuse.com/words?sp=${encodeURIComponent(w)}&md=f&max=1`, { timeoutMs: 10000, retries: 2 }))
        .then((list) => {
          const hit = list.find((x) => x.word === w);
          const f = hit ? freqTag(hit) : null;
          out.set(w, f);
          saveFreq(w, f);
        })
        .catch(() => {
          /* lỗi mạng: lần sau thử lại, không cache */
        })
        .finally(() => opts.onProgress?.(++done, missing.length)),
    ),
  );
  return out;
}

function saveFreq(word: string, freq: number | null) {
  run(
    `INSERT INTO word_freq (word, freq, fetched_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(word) DO UPDATE SET freq = excluded.freq, fetched_at = excluded.fetched_at`,
    word,
    freq,
  );
}
