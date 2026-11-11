import { get, run } from '../../db/index.ts';
import { dedupe } from '../../lib/http.ts';
import { sha1 } from '../../lib/text.ts';
import { getSettings } from '../settings.service.ts';
import { googleLookup, googleTranslate, googleTranslateBatch, type GoogleLookup } from './google.ts';
import { hymtTranslate, isHymtConfigured } from './hymt.ts';
import { mymemoryTranslate } from './mymemory.ts';

export type Provider = 'google' | 'hymt' | 'mymemory';
export type ProviderChoice = 'google' | 'hymt' | 'auto';

// Circuit breaker: nguồn lỗi → tạm bỏ qua một lúc thay vì chờ timeout/429 liên tục
let hymtDownUntil = 0;
let googleDownUntil = 0;

export function providerStatus() {
  const now = Date.now();
  return {
    googleAvailable: now > googleDownUntil,
    googleRetryAt: googleDownUntil > now ? new Date(googleDownUntil).toISOString() : null,
    hymtAvailable: now > hymtDownUntil,
  };
}

function markGoogleDown(err: unknown) {
  googleDownUntil = Date.now() + 5 * 60_000;
  console.warn('[translate] Google tạm không dùng được (5 phút), chuyển sang MyMemory:', (err as Error).message);
}

export function resolveProvider(choice?: ProviderChoice): 'google' | 'hymt' {
  const s = getSettings();
  const wanted = choice ?? s.translateProvider;
  if (wanted === 'google') return 'google';
  const hymtReady = isHymtConfigured(s) && Date.now() > hymtDownUntil;
  if (wanted === 'hymt') return isHymtConfigured(s) ? 'hymt' : 'google';
  return hymtReady ? 'hymt' : 'google';
}

function cacheKey(...parts: string[]) {
  return sha1(parts.join('\u0001'));
}

function readCache<T>(key: string): T | undefined {
  const row = get<{ result: string }>('SELECT result FROM translation_cache WHERE key = ?', key);
  return row ? (JSON.parse(row.result) as T) : undefined;
}

function writeCache(key: string, value: unknown) {
  run(
    'INSERT INTO translation_cache (key, result) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET result = excluded.result',
    key,
    JSON.stringify(value),
  );
}

/** Khoá cache cho bản dịch máy (Google hoặc MyMemory dùng chung — đều là dịch không ngữ cảnh). */
const machineKey = (from: string, to: string, text: string) => cacheKey('t', 'google', '', from, to, '', text);

/** Dịch máy không ngữ cảnh: Google → (nếu bị chặn) MyMemory. */
async function machineTranslate(text: string, from: string, to: string): Promise<{ translation: string; provider: Provider }> {
  if (Date.now() > googleDownUntil) {
    try {
      return { translation: await googleTranslate(text, from, to), provider: 'google' };
    } catch (err) {
      markGoogleDown(err);
    }
  }
  return { translation: await mymemoryTranslate(text, from, to), provider: 'mymemory' };
}

const once = dedupe<unknown>();

export interface TranslateOptions {
  from?: string;
  to?: string;
  context?: string;
  provider?: ProviderChoice;
}

export interface TranslateResult {
  translation: string;
  provider: Provider;
  contextual: boolean;
  cached: boolean;
}

export async function translateText(text: string, opts: TranslateOptions = {}): Promise<TranslateResult> {
  const s = getSettings();
  const from = opts.from ?? 'en';
  const to = opts.to ?? s.targetLang;
  const provider = resolveProvider(opts.provider);
  const context = provider === 'hymt' ? opts.context?.trim() || '' : '';

  if (provider === 'hymt') {
    const key = cacheKey('t', 'hymt', s.hymtModel, from, to, context, text);
    const hit = readCache<{ translation: string }>(key);
    if (hit) return { translation: hit.translation, provider: 'hymt', contextual: Boolean(context), cached: true };
    return once(key, async () => {
      try {
        const translation = await hymtTranslate(text, to, s, { context });
        writeCache(key, { translation });
        return { translation, provider: 'hymt' as const, contextual: Boolean(context), cached: false };
      } catch (err) {
        console.warn('[translate] Hy-MT lỗi, chuyển sang dịch máy:', (err as Error).message);
        hymtDownUntil = Date.now() + 60_000;
        return translateText(text, { ...opts, provider: 'google' });
      }
    }) as Promise<TranslateResult>;
  }

  const key = machineKey(from, to, text);
  const hit = readCache<{ translation: string; provider?: Provider }>(key);
  if (hit) return { translation: hit.translation, provider: hit.provider ?? 'google', contextual: false, cached: true };
  return once(key, async () => {
    const r = await machineTranslate(text, from, to);
    writeCache(key, r);
    return { ...r, contextual: false, cached: false };
  }) as Promise<TranslateResult>;
}

export async function translateBatch(texts: string[], opts: TranslateOptions = {}) {
  const s = getSettings();
  const from = opts.from ?? 'en';
  const to = opts.to ?? s.targetLang;
  const provider = resolveProvider(opts.provider);
  const keyOf = (t: string) => (provider === 'hymt' ? cacheKey('t', 'hymt', s.hymtModel, from, to, '', t) : machineKey(from, to, t));
  const out: string[] = new Array(texts.length).fill('');
  const missing: number[] = [];
  texts.forEach((t, i) => {
    const hit = readCache<{ translation: string }>(keyOf(t));
    if (hit) out[i] = hit.translation;
    else if (t.trim()) missing.push(i);
  });
  if (!missing.length) return { translations: out, provider };

  let used: Provider = provider;
  let results: string[] | null = null;
  if (provider === 'hymt') {
    try {
      results = await Promise.all(missing.map((i) => hymtTranslate(texts[i], to, s)));
    } catch (err) {
      console.warn('[translate] Hy-MT batch lỗi, chuyển sang dịch máy:', (err as Error).message);
      hymtDownUntil = Date.now() + 60_000;
    }
  }
  if (!results && Date.now() > googleDownUntil) {
    try {
      results = await googleTranslateBatch(missing.map((i) => texts[i]), from, to);
      used = 'google';
    } catch (err) {
      markGoogleDown(err);
    }
  }
  if (!results) {
    used = 'mymemory';
    results = await Promise.all(missing.map((i) => mymemoryTranslate(texts[i], from, to).catch(() => '')));
  }
  missing.forEach((idx, k) => {
    out[idx] = results![k];
    if (!results![k]) return;
    if (used === 'hymt') writeCache(keyOf(texts[idx]), { translation: results![k] });
    else writeCache(machineKey(from, to, texts[idx]), { translation: results![k], provider: used });
  });
  return { translations: out, provider: used };
}

/** Dữ liệu từ điển song ngữ của Google (nghĩa theo từ loại, định nghĩa, ví dụ) — có cache. */
export async function lookupGoogle(text: string, from = 'en', to?: string): Promise<GoogleLookup | null> {
  const target = to ?? getSettings().targetLang;
  const key = cacheKey('g-lookup', from, target, text.toLowerCase());
  const cached = readCache<GoogleLookup>(key);
  if (cached) return cached;
  if (Date.now() < googleDownUntil) return null;
  try {
    const result = (await once(key, () => googleLookup(text, from, target))) as GoogleLookup;
    writeCache(key, result);
    return result;
  } catch (err) {
    markGoogleDown(err);
    return null;
  }
}
