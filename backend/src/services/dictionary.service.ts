import { get, run } from '../db/index.ts';
import { dictApiUrl, normalizeEntries, type DictEntry, type RawEntry } from '../lib/dictapi.ts';
import { createLimiter, dedupe, fetchJson, HttpError } from '../lib/http.ts';

export type { DictEntry } from '../lib/dictapi.ts';

// Free Dictionary API — phiên âm IPA, audio, định nghĩa, ví dụ (cache trong SQLite)
const limit = createLimiter(3, 150);
const once = dedupe<DictEntry | null>();

export async function lookupDictionary(word: string): Promise<DictEntry | null> {
  const key = word.trim().toLowerCase();
  if (!key || key.length > 60) return null;
  const row = get<{ data: string; created_at: string }>('SELECT data, created_at FROM dictionary_cache WHERE word = ?', key);
  if (row) {
    const data = JSON.parse(row.data) as DictEntry | null;
    // "không tìm thấy" chỉ cache 7 ngày
    const stale = !data && Date.now() - new Date(row.created_at).getTime() > 7 * 86400_000;
    if (!stale) return data;
  }
  return once(key, async () => {
    let entry: DictEntry | null = null;
    try {
      const raw = await limit(() => fetchJson<RawEntry[]>(dictApiUrl(key), { timeoutMs: 10000, retries: 1 }));
      entry = normalizeEntries(Array.isArray(raw) ? raw : []);
    } catch (err) {
      if (!(err instanceof HttpError && err.status === 404)) {
        console.warn('[dictionary] lỗi tra từ', key, (err as Error).message);
        return null; // lỗi mạng: không cache
      }
    }
    run(
      `INSERT INTO dictionary_cache (word, data, created_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(word) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
      key,
      JSON.stringify(entry),
    );
    return entry;
  });
}
