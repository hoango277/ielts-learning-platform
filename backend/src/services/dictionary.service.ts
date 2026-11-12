import { get, run } from '../db/index.ts';
import { dictApiUrl, normalizeEntries, type DictEntry, type RawEntry } from '../lib/dictapi.ts';
import { createLimiter, dedupe, fetchJson, HttpError } from '../lib/http.ts';
import type { IpaPair } from '../lib/ipa.ts';
import { inflectIpa, parseWiktionaryIpa, wiktionaryTitles, wiktionaryUrl } from '../lib/wiktionary.ts';

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
    saveCache(key, entry);
    return entry;
  });
}

function saveCache(key: string, data: unknown) {
  run(
    `INSERT INTO dictionary_cache (word, data, created_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(word) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
    key,
    JSON.stringify(data),
  );
}

// Wiktionary — phiên âm cho từ mà Free Dictionary API bỏ sót ("impact", "healthcare"…), cache cùng bảng với khoá "wikt:<từ>"
const wikiLimit = createLimiter(1, 1000);
const onceWiki = dedupe<IpaPair | null>();
const WIKI_UA = { 'User-Agent': 'ielts-learn/1.0 (personal vocabulary study app)' };

export async function wiktionaryIpa(word: string, depth = 0): Promise<IpaPair | null> {
  const key = word.trim().toLowerCase();
  if (!key || key.length > 60 || /\s/.test(key)) return null;
  const cacheKey = `wikt:${key}`;
  const row = get<{ data: string; created_at: string }>('SELECT data, created_at FROM dictionary_cache WHERE word = ?', cacheKey);
  if (row) {
    const data = JSON.parse(row.data) as IpaPair | null;
    const stale = !data && Date.now() - new Date(row.created_at).getTime() > 7 * 86400_000;
    if (!stale) return data;
  }
  return onceWiki(key, async () => {
    let result: IpaPair | null = null;
    try {
      for (const title of wiktionaryTitles(key)) {
        const page = await wikiLimit(() =>
          fetchJson<{ parse?: { wikitext?: string } }>(wiktionaryUrl(title), { headers: WIKI_UA, timeoutMs: 8000, retries: 1 }),
        );
        const parsed = page.parse?.wikitext ? parseWiktionaryIpa(page.parse.wikitext) : null;
        if (parsed?.uk || parsed?.us) {
          result = { uk: parsed.uk, us: parsed.us };
          break;
        }
        // "accessories" = số nhiều của "accessory" → IPA từ gốc + đuôi
        if (parsed?.formOf && depth < 1) {
          const d = await lookupDictionary(parsed.formOf.base);
          const base = d?.ipa || d?.ipaUk || d?.ipaUs ? { uk: d.ipaUk ?? d.ipa ?? null, us: d.ipaUs ?? d.ipa ?? null } : await wiktionaryIpa(parsed.formOf.base, depth + 1);
          if (!base) continue;
          const { kind } = parsed.formOf;
          result = kind === 'spelling' ? base : { uk: base.uk && inflectIpa(base.uk, kind), us: base.us && inflectIpa(base.us, kind) };
          break;
        }
      }
    } catch (err) {
      console.warn('[dictionary] lỗi tra Wiktionary', key, (err as Error).message);
      return null; // lỗi mạng / bị chặn: không cache
    }
    saveCache(cacheKey, result);
    return result;
  });
}
