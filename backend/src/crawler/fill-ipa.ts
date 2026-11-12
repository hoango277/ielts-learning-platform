/**
 * Bổ sung phiên âm IPA còn thiếu trong bộ từ theo chủ đề (data/seed/topics.json) — không crawl lại toàn bộ.
 *
 *   npm run crawl:ipa                                  # tra từ đơn thiếu IPA + ghép IPA cho cụm từ → ghi topics.json
 *   npm run crawl:ipa -w backend -- --dry              # chỉ báo cáo, không ghi file
 *   npm run crawl:ipa -w backend -- --redo=transport,graduate   # tra lại cả những mục đã có IPA
 *
 * Free Dictionary API bỏ sót IPA của nhiều từ ("impact", "healthcare") và lần crawl đầu có lượt tra bị chặn
 * ("computer") → tra Wiktionary trước (chọn cách đọc theo từ loại), rồi tới Free Dictionary;
 * cụm từ ("global warming") → ghép IPA từng chữ. Trang đã tải được lưu ở data/crawl-cache để chạy lại nhanh.
 * App tự nạp lại dữ liệu khi file thay đổi (xem syncSeed trong db/seed.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import type { SeedFile, SeedLexicon } from '../db/seed.ts';
import { dictApiUrl, normalizeEntries, type RawEntry } from '../lib/dictapi.ts';
import { createLimiter, fetchJson, HttpError } from '../lib/http.ts';
import { bareIpa, cleanIpa, composePhraseIpa, derivedIpa, isMultiPart, spellingVariants, type IpaPair } from '../lib/ipa.ts';
import { sha1 } from '../lib/text.ts';
import { hasWord } from '../lib/wordnet.ts';
import { inflectIpa, parseWiktionaryIpa, wiktionaryTitles, wiktionaryUrl } from '../lib/wiktionary.ts';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const DRY = args.dry === 'true';
const REDO = new Set(String(args.redo ?? '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean));

// Cả hai nguồn đều chặn khi gọi dồn dập — đi chậm, bị chặn thì nghỉ hẳn một lúc rồi thử lại
const dictLimit = createLimiter(1, 900);
const wikiLimit = createLimiter(1, 2000);
const WIKI_UA = { 'User-Agent': 'ielts-learn/1.0 (personal vocabulary study app; IPA backfill)' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const data = JSON.parse(fs.readFileSync(config.seedPath, 'utf8')) as SeedFile;
for (const l of data.lexicon) {
  if (REDO.has(l.word.toLowerCase())) {
    l.ipa = null;
    l.ipaUs = null;
  }
}
const hasIpa = (l: SeedLexicon) => Boolean(bareIpa(l.ipa) || bareIpa(l.ipaUs));

// IPA đã có trong bộ từ → dùng luôn cho cụm, khỏi tra lại
const known = new Map<string, IpaPair>();
for (const l of data.lexicon) if (hasIpa(l)) known.set(l.word.toLowerCase(), { uk: l.ipa ?? null, us: l.ipaUs ?? null });

let requests = 0;

/** Cache trên đĩa (data/crawl-cache/<nguồn>/…) — chỉ lưu khi tải được (không có trang thì lưu null) */
async function diskCached<T>(source: string, key: string, fn: () => Promise<T | null>): Promise<T | null> {
  const file = path.join(config.crawlCacheDir, source, `${sha1(key)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T | null;
  const value = await fn();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
  return value;
}

/** Gọi API có thử lại khi bị chặn / lỗi mạng; 404 → null; thử mãi không được → ném lỗi (không cache) */
async function politeFetch<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      requests++;
      return await run();
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      const wait = 20_000 * (attempt + 1);
      console.warn(`  ! ${label}: ${(err as Error).message.slice(0, 80)} — chờ ${wait / 1000}s rồi thử lại`);
      await sleep(wait);
    }
  }
  throw new Error(`bỏ qua ${label}`);
}

const pages = new Map<string, Promise<string | null>>();
/** Mã nguồn trang Wiktionary (null nếu không có trang) */
function wikitext(title: string): Promise<string | null> {
  let p = pages.get(title);
  if (!p) {
    p = diskCached('wiktionary', title, async () => {
      const page = await politeFetch(`wiktionary "${title}"`, () =>
        wikiLimit(() => fetchJson<{ parse?: { wikitext?: string } }>(wiktionaryUrl(title), { headers: WIKI_UA, timeoutMs: 15000, retries: 1 })),
      );
      return page?.parse?.wikitext ?? null;
    }).catch(() => null);
    pages.set(title, p);
  }
  return p;
}

/** Wiktionary: IPA ghi trên trang (chọn theo từ loại); trang chỉ là dạng biến đổi ("accessories") thì suy từ từ gốc */
async function wiktionaryIpa(word: string, pos: string | null, depth: number): Promise<IpaPair | null> {
  for (const title of wiktionaryTitles(word)) {
    const text = await wikitext(title);
    const parsed = text ? parseWiktionaryIpa(text, pos) : null;
    if (parsed?.uk || parsed?.us) return { uk: parsed.uk, us: parsed.us };
    if (parsed?.formOf && depth < 1) {
      const { kind, base } = parsed.formOf;
      const baseIpa = await wordIpa(base, kind === 'past' || kind === 'third' || kind === 'ing' ? 'verb' : pos, depth + 1);
      if (!baseIpa) continue;
      if (kind === 'spelling') return baseIpa;
      return { uk: baseIpa.uk && inflectIpa(baseIpa.uk, kind), us: baseIpa.us && inflectIpa(baseIpa.us, kind) };
    }
  }
  return null;
}

/** Free Dictionary API (thử cả cách viết Anh ↔ Mỹ) */
async function dictIpa(word: string): Promise<IpaPair | null> {
  for (const w of [word, ...spellingVariants(word)]) {
    const raw = await diskCached('dictapi-ipa', w, () =>
      politeFetch(`dictionary "${w}"`, () => dictLimit(() => fetchJson<RawEntry[]>(dictApiUrl(w), { timeoutMs: 15000, retries: 1 }))),
    ).catch(() => null);
    const d = normalizeEntries(Array.isArray(raw) ? raw : []);
    const uk = d?.ipaUk ?? d?.ipa ?? null;
    const us = d?.ipaUs ?? d?.ipa ?? null;
    if (uk || us) return { uk, us };
  }
  return null;
}

/** Có phải từ thật không (WordNet offline + bộ từ) — để tách từ ghép mà không gọi mạng cho mảnh vô nghĩa */
const isWord = (w: string) => known.has(w) || hasWord(w);

const resolved = new Map<string, Promise<IpaPair | null>>();
/**
 * IPA một chữ: có sẵn trong bộ từ → Wiktionary → Free Dictionary API → suy theo cấu tạo từ
 * (tiền tố/hậu tố/từ ghép; không suy tiếp cho các phần của nó). Không ném lỗi.
 */
function wordIpa(word: string, pos: string | null, depth = 0, derive = true): Promise<IpaPair | null> {
  const key = word.toLowerCase();
  const hit = known.get(key);
  if (hit) return Promise.resolve(hit);
  const id = `${key}|${pos ?? ''}|${derive}`;
  let p = resolved.get(id);
  if (!p) {
    p = (async () =>
      (await wiktionaryIpa(key, pos, depth)) ??
      (await dictIpa(key)) ??
      (derive ? await derivedIpa(key, (w) => wordIpa(w, pos, 0, false), isWord) : null))();
    resolved.set(id, p);
  }
  return p;
}

const missing = data.lexicon.filter((l) => !hasIpa(l));
console.log(`Thiếu IPA: ${missing.length}/${data.lexicon.length} mục (cụm từ: ${missing.filter((l) => isMultiPart(l.word)).length})`);

// Từ đơn trước (kết quả dùng lại cho cụm), rồi tới cụm từ
const order = [...missing.filter((l) => !isMultiPart(l.word)), ...missing.filter((l) => isMultiPart(l.word))];
const unresolved: string[] = [];
let filled = 0;
for (const l of order) {
  // Chữ trong cụm danh từ ("public transport") thường là danh từ/tính từ → đọc theo danh từ
  const partPos = /verb/i.test(l.pos ?? '') ? 'verb' : 'noun';
  const r = isMultiPart(l.word) ? await composePhraseIpa(l.word, (w) => wordIpa(w, partPos)) : await wordIpa(l.word, l.pos ?? null);
  const uk = bareIpa(r?.uk ?? r?.us);
  const us = bareIpa(r?.us ?? r?.uk);
  if (!uk || !us) {
    unresolved.push(l.word);
    continue;
  }
  l.ipa = `/${uk}/`;
  l.ipaUs = `/${us}/`;
  known.set(l.word.toLowerCase(), { uk: l.ipa, us: l.ipaUs });
  filled++;
  console.log(`  ✓ ${l.word.padEnd(28)} ${l.ipa}  ${l.ipaUs}`);
}

// Chuẩn hoá cách viết IPA của mọi mục (cả mục có sẵn từ lần crawl trước)
let cleaned = 0;
for (const l of data.lexicon) {
  for (const k of ['ipa', 'ipaUs'] as const) {
    const v = l[k];
    if (!v) continue;
    const c = cleanIpa(v, l.word);
    if (c !== v) {
      l[k] = c;
      cleaned++;
    }
  }
}

console.log(`\nĐã bổ sung ${filled}/${missing.length} mục (${requests} lượt gọi mạng), chuẩn hoá ${cleaned} phiên âm.`);
if (unresolved.length) console.log(`Chưa tra được (${unresolved.length}): ${unresolved.join(', ')}`);
if (!DRY && (filled || cleaned)) {
  fs.writeFileSync(config.seedPath, JSON.stringify(data, null, 1));
  console.log(`→ đã ghi ${config.seedPath}. Khởi động lại app để nạp vào cơ sở dữ liệu.`);
}
