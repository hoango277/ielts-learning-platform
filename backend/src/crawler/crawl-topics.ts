/**
 * Crawler bộ từ vựng theo chủ đề IELTS.
 *
 *   npm run crawl                       # crawl tất cả chủ đề → data/seed/topics.json → nạp vào DB
 *   npm run crawl -- --topics=education,environment --per-topic=30
 *   npm run crawl -- --refresh          # bỏ qua cache trên đĩa
 *   npm run crawl -w backend -- --advanced   # chỉ thêm nhóm "Từ nâng cao" (C1–C2) vào file seed hiện có
 *
 * Nguồn dữ liệu (đều là API công khai, có giới hạn tốc độ lịch sự + cache trên đĩa):
 *   1. Datamuse API  — tìm từ liên quan tới chủ đề (rel_trg / ml), tần suất, collocation (rel_jjb / rel_jja / rel_bga)
 *   2. Free Dictionary API (Wiktionary, CC BY-SA) — IPA, audio Anh-Anh/Anh-Mỹ, định nghĩa, ví dụ, đồng/trái nghĩa
 *   3. Google Dịch (gtx) — nghĩa tiếng Việt theo từ loại + dịch câu ví dụ
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import type { SeedFile, SeedLexicon, SeedTopic } from '../db/seed.ts';
import { dictApiUrl, normalizeEntries, type DictEntry, type RawEntry } from '../lib/dictapi.ts';
import { createLimiter, fetchJson, HttpError } from '../lib/http.ts';
import { composePhraseIpa } from '../lib/ipa.ts';
import { inflectionRegex, levelFromFrequency, sha1, stripHtml } from '../lib/text.ts';
import { googleLookup, googleTranslateBatch, type GoogleLookup } from '../services/translate/google.ts';
import { mymemoryTranslate } from '../services/translate/mymemory.ts';
import { applyCuration } from './curate.ts';
import { ADVANCED as ADVANCED_WORDS, TOPICS, type TopicConfig } from './topics.config.ts';

// ---------- Tham số dòng lệnh ----------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const REFRESH = args.refresh === 'true';
const PER_TOPIC = Number(args['per-topic'] ?? 28);
const ONLY = args.topics ? new Set(String(args.topics).split(',')) : null;
const NO_DB = args['no-db'] === 'true';
const ADVANCED = args.advanced === 'true';

// ---------- Cache trên đĩa + giới hạn tốc độ ----------

async function cached<T>(source: string, key: string, fn: () => Promise<T>): Promise<T> {
  const file = path.join(config.crawlCacheDir, source, `${sha1(key)}.json`);
  if (!REFRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  const value = await fn();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
  return value;
}

const datamuseLimit = createLimiter(4, 60); // ~ < 100k request/ngày miễn phí
const dictLimit = createLimiter(2, 400); // lịch sự với dictionaryapi.dev
const googleLimit = createLimiter(2, 250);

interface DM {
  word: string;
  score: number;
  tags?: string[];
}

const datamuse = (qs: string) =>
  cached('datamuse', qs, () => datamuseLimit(() => fetchJson<DM[]>(`https://api.datamuse.com/words?${qs}`, { retries: 3 })));

const freqOf = (w: DM) => {
  const t = w.tags?.find((x) => x.startsWith('f:'));
  return t ? Number(t.slice(2)) : null;
};

async function fetchDict(word: string): Promise<DictEntry | null> {
  return cached('dictapi', word, async () => {
    try {
      const raw = await dictLimit(() => fetchJson<RawEntry[]>(dictApiUrl(word), { timeoutMs: 15000, retries: 3 }));
      return normalizeEntries(Array.isArray(raw) ? raw : []);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
  });
}

const fetchGoogle = (word: string) => cached<GoogleLookup>('google', word, () => googleLimit(() => googleLookup(word, 'en', 'vi')));

// Wikipedia REST (CC BY-SA): câu mở đầu bài viết làm câu ví dụ cho cụm từ học thuật ("Biodiversity is ...")
const wikiLimit = createLimiter(2, 200);
const WIKI_UA = { 'User-Agent': 'ielts-learn/1.0 (personal vocabulary study app; crawler)', 'Api-User-Agent': 'ielts-learn/1.0' };

async function wikipediaSentence(term: string): Promise<string | null> {
  const title = encodeURIComponent((term.charAt(0).toUpperCase() + term.slice(1)).replace(/ /g, '_'));
  const summary = await cached('wikipedia', term, async () => {
    try {
      return await wikiLimit(() =>
        fetchJson<{ type?: string; extract?: string }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
          headers: WIKI_UA,
          retries: 2,
        }),
      );
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return null;
      throw err;
    }
  });
  if (!summary || summary.type !== 'standard' || !summary.extract) return null;
  const re = inflectionRegex(term);
  const sentence = summary.extract
    .replace(/\s*\([^)]*\)/g, '')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .find((s) => re.test(s) && s.length >= 25 && s.length <= 220);
  return sentence ?? null;
}

// ---------- Chọn từ liên quan tới chủ đề ----------

const STOP = new Set(
  `about above after again against also although among another anything around because become been before being below
  between both cannot could does doing down during each either else enough even ever every first from further good great
  have having here however into itself just kind last least less like little made make many more most much must need
  never next none often only other others otherwise over part people perhaps place point quite rather really same seem
  several shall should since some something sometimes still such take than that their them then there these they thing
  things this those though through thus time today together under until upon used very want well were what when where
  whether which while whole whose will with within without would year years your yourself world life work woman women
  man men person child children example number system case group fact area level kind form side day days week thing`.split(/\s+/),
);

const PRONOUNS = new Set('their them this that these those your yours mine ours theirs its it his her him she they there here what which'.split(' '));

function isCandidate(w: DM) {
  if (!/^[a-z][a-z-]{3,}$/.test(w.word) || STOP.has(w.word)) return false;
  const tags = w.tags ?? [];
  if (tags.includes('prop')) return false;
  if (!tags.some((t) => ['n', 'v', 'adj', 'adv'].includes(t))) return false;
  const f = freqOf(w);
  return f != null && f >= 0.5 && f <= 120;
}

function singularForms(word: string): string[] {
  const out: string[] = [];
  if (word.endsWith('ies')) out.push(word.slice(0, -3) + 'y');
  if (word.endsWith('es')) out.push(word.slice(0, -2));
  if (word.endsWith('s') && !word.endsWith('ss')) out.push(word.slice(0, -1));
  return out;
}

async function gatherCandidates(topic: TopicConfig) {
  const agg = new Map<string, { score: number; hits: number; freq: number | null; pos: Set<string> }>();
  for (const seed of topic.seeds) {
    // rel_trg (từ hay xuất hiện cùng chủ đề) quan trọng hơn ml (từ gần nghĩa)
    const queries: [string, number][] = [
      [`rel_trg=${encodeURIComponent(seed)}&md=fp&max=80`, 1],
      [`ml=${encodeURIComponent(seed)}&md=fp&max=50`, 0.7],
    ];
    for (const [qs, weight] of queries) {
      const list = await datamuse(qs);
      const max = Math.max(1, ...list.map((w) => w.score));
      for (const w of list) {
        if (!isCandidate(w)) continue;
        const cur = agg.get(w.word) ?? { score: 0, hits: 0, freq: freqOf(w), pos: new Set<string>() };
        cur.score += (w.score / max) * weight;
        cur.hits++;
        for (const t of w.tags ?? []) if (['n', 'v', 'adj', 'adv'].includes(t)) cur.pos.add(t);
        agg.set(w.word, cur);
      }
    }
  }
  // Gộp số nhiều vào số ít nếu cả hai cùng xuất hiện
  for (const [word, v] of [...agg]) {
    const singular = singularForms(word).find((s) => s !== word && agg.has(s));
    if (singular) {
      const s = agg.get(singular)!;
      s.score += v.score;
      s.hits += v.hits;
      agg.delete(word);
    }
  }
  return [...agg.entries()]
    .map(([word, v]) => ({ word, score: v.score * (1 + 0.2 * (v.hits - 1)), freq: v.freq }))
    .sort((a, b) => b.score - a.score);
}

// ---------- Làm giàu dữ liệu cho từng mục từ ----------

const POS_MAP: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

async function frequencyOf(word: string): Promise<number | null> {
  const parts = word.split(/[\s-]+/).filter((p) => p.length > 2);
  const freqs: number[] = [];
  for (const p of parts.length ? parts : [word]) {
    const list = await datamuse(`sp=${encodeURIComponent(p)}&md=f&max=1`);
    const hit = list.find((w) => w.word === p.toLowerCase());
    const f = hit ? freqOf(hit) : null;
    if (f != null) freqs.push(f);
  }
  return freqs.length ? Math.min(...freqs) : null;
}

async function collocationsOf(word: string, pos: string | null): Promise<string[]> {
  if (/\s/.test(word)) return [];
  const pick = (list: DM[], n = 4) => list.filter((w) => /^[a-z-]{3,}$/.test(w.word) && !STOP.has(w.word) && !PRONOUNS.has(w.word)).slice(0, n);
  if (pos === 'noun') return pick(await datamuse(`rel_jjb=${encodeURIComponent(word)}&max=15`)).map((w) => `${w.word} ${word}`);
  if (pos === 'adjective') return pick(await datamuse(`rel_jja=${encodeURIComponent(word)}&max=15`)).map((w) => `${word} ${w.word}`);
  if (pos === 'verb') {
    const list = (await datamuse(`rel_bga=${encodeURIComponent(word)}&md=p&max=60`)).filter(
      (w) => w.tags?.includes('n') && !w.tags.includes('adv') && w.word.length > 3,
    );
    return pick(list).map((w) => `${word} ${w.word}`);
  }
  return [];
}

async function pickExamples(word: string, dict: DictEntry | null, google: GoogleLookup | null): Promise<string[]> {
  const re = inflectionRegex(word);
  // Ví dụ của Google (Oxford Languages) tự nhiên hơn → ưu tiên trước Wiktionary
  const all = [
    ...(google?.definitions.map((d) => d.example ?? '') ?? []),
    ...(google?.examples ?? []),
    ...(dict?.meanings.flatMap((m) => m.definitions.map((d) => d.example ?? '')) ?? []),
  ]
    .map((e) => stripHtml(e).replace(/\s+/g, ' ').trim())
    .filter((e) => e.length > 15 && e.length < 220 && re.test(e));
  const picked = [...new Set(all)].slice(0, 2);
  if (!picked.length) {
    const wiki = await wikipediaSentence(word).catch(() => null);
    if (wiki) picked.push(wiki);
  }
  return picked.map((e) => e.charAt(0).toUpperCase() + e.slice(1));
}

/** IPA cho cụm từ: ghép IPA của từng từ thành phần ("rote learning" → /ɹəʊt ˈlɜːnɪŋ/). */
async function phraseIpa(term: string): Promise<{ uk: string | null; us: string | null }> {
  const r = await composePhraseIpa(term, async (w) => {
    const d = await fetchDict(w);
    return d ? { uk: d.ipaUk ?? d.ipa ?? null, us: d.ipaUs ?? d.ipa ?? null } : null;
  });
  return r ?? { uk: null, us: null };
}

async function enrich(word: string, freqHint: number | null): Promise<SeedLexicon | null> {
  let term = word;
  let [google, dict] = await Promise.all([fetchGoogle(term).catch(() => null), fetchDict(term).catch(() => null)]);
  // "organisms" → "organism"
  const base = google?.baseForm?.toLowerCase();
  if (base && base !== term && !/\s/.test(term) && /s$/.test(term) && singularForms(term).includes(base)) {
    term = base;
    [google, dict] = await Promise.all([fetchGoogle(term).catch(() => null), fetchDict(term).catch(() => null)]);
  }
  if (!google?.translation) return null;

  const nfc = (s: string) => s.normalize('NFC').trim();
  const isPhrase = /\s/.test(term);
  const pos =
    dict?.meanings[0]?.pos ?? google.dict[0]?.posEn ?? google.definitions[0]?.posEn ?? (isPhrase ? 'phrase' : null);
  const freq = freqHint ?? (await frequencyOf(term));
  let level = levelFromFrequency(freq, isPhrase);
  if (isPhrase && (level === 'A1' || level === 'A2')) level = 'B1';

  const main = nfc(google.translation);
  const extras = [...new Set((google.dict[0]?.terms ?? []).map(nfc))]
    .filter((t) => t.toLowerCase() !== main.toLowerCase())
    .slice(0, 2);
  const definitions = dict?.meanings.length
    ? dict.meanings
        .flatMap((m) => m.definitions.slice(0, 2).map((d) => ({ pos: m.pos, definition: d.definition, example: d.example })))
        .slice(0, 4)
    : google.definitions.slice(0, 3).map((d) => ({ pos: d.posEn ?? '', definition: d.gloss, example: d.example }));
  // Đồng nghĩa: ưu tiên từ điển; của Google chỉ lấy nhóm cùng từ loại
  const googleSyn = (google.synonymsByPos ?? []).filter((s) => !s.posEn || s.posEn === pos).flatMap((s) => s.words);
  const synonyms = [...new Set([...(dict?.meanings.filter((m) => m.pos === pos).flatMap((m) => m.synonyms) ?? []), ...googleSyn])]
    .filter((s) => s.toLowerCase() !== term && !s.includes('/'))
    .slice(0, 8);
  const ipa = (isPhrase || term.includes('-')) && !dict?.ipa ? await phraseIpa(term) : null;

  return {
    word: term,
    pos,
    ipa: dict?.ipaUk ?? dict?.ipa ?? ipa?.uk ?? null,
    ipaUs: dict?.ipaUs ?? ipa?.us ?? null,
    audio: dict?.audioUk ?? null,
    audioUs: dict?.audioUs ?? dict?.audio ?? null,
    meaningVi: [main, ...extras].join(', '),
    meaningsVi: google.dict.map((d) => ({ pos: nfc(d.pos), terms: [...new Set(d.terms.map(nfc))].slice(0, 6) })),
    definitions,
    examples: (await pickExamples(term, dict, google)).map((en) => ({ en })),
    synonyms,
    antonyms: [...new Set(dict?.meanings.flatMap((m) => m.antonyms) ?? [])].slice(0, 6),
    collocations: await collocationsOf(term, pos),
    frequency: freq,
    level,
  };
}

/** Dịch câu ví dụ sang tiếng Việt theo lô, có cache từng câu. */
async function translateExamples(lexicon: SeedLexicon[]) {
  const pending = new Map<string, { en: string; vi?: string }[]>();
  for (const l of lexicon) {
    for (const ex of l.examples) {
      const file = path.join(config.crawlCacheDir, 'example-vi', `${sha1(ex.en)}.json`);
      if (!REFRESH && fs.existsSync(file)) ex.vi = (JSON.parse(fs.readFileSync(file, 'utf8')) as string).normalize('NFC');
      else pending.set(ex.en, [...(pending.get(ex.en) ?? []), ex]);
    }
  }
  const texts = [...pending.keys()];
  console.log(`📝 Dịch ${texts.length} câu ví dụ...`);
  for (let i = 0; i < texts.length; i += 40) {
    const chunk = texts.slice(i, i + 40);
    let out: string[] = [];
    // Google có thể trả 429 khi gọi dồn dập → thử lại 2 lần, sau đó chuyển sang MyMemory
    for (let attempt = 0; attempt < 2 && !out.length; attempt++) {
      try {
        out = await googleLimit(() => googleTranslateBatch(chunk, 'en', 'vi'));
      } catch (err) {
        console.warn(`  ⚠️ Google dịch ví dụ lỗi (${(err as Error).message})`);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    if (!out.length) {
      console.warn(`  ↪ dùng MyMemory cho ${chunk.length} câu`);
      out = await Promise.all(chunk.map((en) => mymemoryTranslate(en, 'en', 'vi').catch(() => '')));
    }
    chunk.forEach((en, k) => {
      if (!out[k]) return;
      for (const ex of pending.get(en)!) ex.vi = out[k];
      const file = path.join(config.crawlCacheDir, 'example-vi', `${sha1(en)}.json`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(out[k]));
    });
  }
}

// ---------- Chạy ----------

async function main() {
  const t0 = Date.now();
  const topics = TOPICS.filter((t) => !ONLY || ONLY.has(t.slug));
  console.log(`🕸️  Crawl ${topics.length} chủ đề (tối đa ${PER_TOPIC} từ liên quan / chủ đề)`);

  // 1. Danh sách từ cho từng chủ đề
  const topicWords = new Map<string, { word: string; group: 'core' | 'related'; freq: number | null }[]>();
  for (const t of topics) {
    const core = t.core.map((w) => ({ word: w.toLowerCase(), group: 'core' as const, freq: null }));
    const coreSet = new Set(core.map((c) => c.word));
    const all = await gatherCandidates(t);
    const known = new Set([...coreSet, ...all.map((c) => c.word)]);
    // Bỏ biến thể khi dạng gốc đã có trong chủ đề: sciences → science, competing → compete
    const isVariant = (w: string) =>
      (/s$/.test(w) && singularForms(w).some((s) => s !== w && known.has(s))) ||
      (/ing$/.test(w) && [w.slice(0, -3), `${w.slice(0, -3)}e`].some((b) => known.has(b)));
    const candidates = all.filter((c) => !coreSet.has(c.word) && !isVariant(c.word));
    const related = candidates.slice(0, PER_TOPIC).map((c) => ({ word: c.word, group: 'related' as const, freq: c.freq }));
    topicWords.set(t.slug, [...core, ...related]);
    console.log(`  ${t.icon} ${t.name}: ${core.length} cụm cốt lõi + ${related.length} từ liên quan (vd: ${related.slice(0, 6).map((r) => r.word).join(', ')})`);
  }

  // 2. Làm giàu từng mục từ (dùng chung giữa các chủ đề)
  const unique = new Map<string, number | null>();
  for (const list of topicWords.values()) for (const w of list) if (!unique.has(w.word)) unique.set(w.word, w.freq);
  console.log(`🔎 Làm giàu dữ liệu cho ${unique.size} mục từ...`);
  const results = new Map<string, SeedLexicon | null>();
  const queue = [...unique.entries()];
  let done = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const [word, freq] = queue.shift()!;
        try {
          results.set(word, await enrich(word, freq));
        } catch (err) {
          console.warn(`  ⚠️ ${word}: ${(err as Error).message}`);
          results.set(word, null);
        }
        if (++done % 50 === 0) console.log(`  ... ${done}/${unique.size} (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    }),
  );

  // 3. Gộp theo dạng gốc, bỏ mục không có nghĩa
  const lexicon = new Map<string, SeedLexicon>();
  const alias = new Map<string, string>();
  for (const [word, entry] of results) {
    if (!entry) continue;
    alias.set(word, entry.word);
    if (!lexicon.has(entry.word)) lexicon.set(entry.word, entry);
  }
  const lexList = [...lexicon.values()];
  await translateExamples(lexList);

  const seedTopics: SeedTopic[] = topics.map((t) => {
    const seen = new Set<string>();
    const words = (topicWords.get(t.slug) ?? [])
      .map((w) => ({ word: alias.get(w.word), group: w.group }))
      .filter((w): w is { word: string; group: 'core' | 'related' } => Boolean(w.word && !seen.has(w.word) && seen.add(w.word)))
      .map((w, rank) => ({ ...w, rank }));
    return {
      slug: t.slug,
      name: t.name,
      nameVi: t.nameVi,
      description: t.description,
      icon: t.icon,
      color: t.color,
      category: t.category,
      order: TOPICS.indexOf(t),
      words,
    };
  });

  // Gộp với file seed sẵn có khi chỉ crawl một phần chủ đề
  let output: SeedFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: ['Datamuse API (datamuse.com)', 'Free Dictionary API (dictionaryapi.dev — Wiktionary, CC BY-SA)', 'Google Translate'],
    topics: seedTopics,
    lexicon: lexList.sort((a, b) => a.word.localeCompare(b.word)),
  };
  if (ONLY && fs.existsSync(config.seedPath)) {
    const prev = JSON.parse(fs.readFileSync(config.seedPath, 'utf8')) as SeedFile;
    const lex = new Map(prev.lexicon.map((l) => [l.word, l]));
    for (const l of output.lexicon) lex.set(l.word, l);
    const tps = new Map(prev.topics.map((t) => [t.slug, t]));
    for (const t of output.topics) tps.set(t.slug, t);
    output = {
      ...output,
      topics: [...tps.values()].sort((a, b) => a.order - b.order),
      lexicon: [...lex.values()].sort((a, b) => a.word.localeCompare(b.word)),
    };
  }

  fs.mkdirSync(path.dirname(config.seedPath), { recursive: true });
  // Dữ liệu soạn tay (curated.ts): loại từ lạc đề, sửa nghĩa, bổ sung ví dụ/định nghĩa
  applyCuration(output);
  fs.writeFileSync(config.seedPath, JSON.stringify(output, null, 1));
  const withIpa = output.lexicon.filter((l) => l.ipa).length;
  const withAudio = output.lexicon.filter((l) => l.audio || l.audioUs).length;
  const withEx = output.lexicon.filter((l) => l.examples.length).length;
  console.log(
    `✅ Xong sau ${Math.round((Date.now() - t0) / 1000)}s: ${output.topics.length} chủ đề, ${output.lexicon.length} mục từ ` +
      `(IPA ${withIpa}, audio ${withAudio}, có ví dụ ${withEx}) → ${path.relative(process.cwd(), config.seedPath)}`,
  );

  if (!NO_DB) {
    const { seedTopics: load } = await import('../db/seed.ts');
    const r = load();
    console.log(`💾 Đã nạp vào SQLite: ${r.topics} chủ đề, ${r.lexicon} mục từ`);
  }
}

/**
 * Thêm nhóm "Từ nâng cao" (C1–C2) cho từng chủ đề vào file seed hiện có — không crawl lại các từ cũ.
 * Danh sách từ soạn tay (ADVANCED trong topics.config.ts); crawler chỉ tra nghĩa, phiên âm, ví dụ.
 */
async function advancedMain() {
  const t0 = Date.now();
  const seed = JSON.parse(fs.readFileSync(config.seedPath, 'utf8')) as SeedFile;
  const lexByWord = new Map(seed.lexicon.map((l) => [l.word, l]));
  const added: SeedLexicon[] = [];
  const topics = TOPICS.filter((t) => (!ONLY || ONLY.has(t.slug)) && ADVANCED_WORDS[t.slug]?.length);
  console.log(`🎓 Thêm từ nâng cao cho ${topics.length} chủ đề`);
  for (const t of topics) {
    const st = seed.topics.find((x) => x.slug === t.slug);
    if (!st) continue;
    // Chạy lại → thay nhóm nâng cao cũ của chủ đề
    st.words = st.words.filter((w) => w.group !== 'advanced');
    const inTopic = new Set(st.words.map((w) => w.word));
    const list = ADVANCED_WORDS[t.slug].map(([w, vi]) => [w.toLowerCase(), vi] as const);
    const entries = await Promise.all(list.map(async ([w]) => lexByWord.get(w) ?? (await enrich(w, null).catch(() => null))));
    const picked: SeedLexicon[] = [];
    entries.forEach((found, i) => {
      if (!found) return console.warn(`  ⚠️ ${list[i][0]}: không tra được — bỏ qua`);
      // Crawler có thể quy về dạng gốc (roadworks → roadwork) đã có trong file → sửa đúng mục đang lưu
      const e = lexByWord.get(found.word) ?? found;
      if (inTopic.has(e.word)) return;
      // Nghĩa tiếng Việt soạn tay theo ngữ cảnh chủ đề thay cho nghĩa Google (hay sai với từ hiếm)
      e.meaningVi = list[i][1];
      // Từ mới quá (overtourism, staycation) chưa có số liệu tần suất → coi là C1 (đã được chọn là từ nâng cao)
      e.level ??= 'C1';
      picked.push(e);
      inTopic.add(e.word);
    });
    const base = Math.max(0, ...st.words.map((w) => w.rank)) + 1;
    st.words.push(...picked.map((e, k) => ({ word: e.word, group: 'advanced' as const, rank: base + k })));
    for (const e of picked) {
      if (!lexByWord.has(e.word)) {
        lexByWord.set(e.word, e);
        added.push(e);
      }
    }
    console.log(`  ${t.icon} ${t.name}: +${picked.length} từ nâng cao (${picked.map((e) => `${e.word} ${e.level ?? '?'}`).join(', ')})`);
  }
  await translateExamples(added);
  // Bỏ mục từ không còn thuộc chủ đề nào (từ nâng cao của lần chạy trước bị loại)
  const used = new Set(seed.topics.flatMap((t) => t.words.map((w) => w.word)));
  seed.lexicon = [...lexByWord.values()].filter((l) => used.has(l.word)).sort((a, b) => a.word.localeCompare(b.word));
  seed.generatedAt = new Date().toISOString();
  applyCuration(seed);
  fs.writeFileSync(config.seedPath, JSON.stringify(seed, null, 1));
  console.log(
    `✅ Xong sau ${Math.round((Date.now() - t0) / 1000)}s: thêm ${added.length} mục từ mới → ${path.relative(process.cwd(), config.seedPath)}`,
  );
  console.log('   Chạy "npm run crawl:ipa" để bổ sung phiên âm còn thiếu; app tự nạp lại dữ liệu khi khởi động.');
}

(ADVANCED ? advancedMain() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
