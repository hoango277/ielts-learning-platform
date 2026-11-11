import { COLLOCATIONS } from '../data/collocations.ts';
import { UPGRADES } from '../data/upgrades.ts';
import { all, get, run } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { inflectionRegex, levelFromFrequency, termKey, uniqBy } from '../lib/text.ts';
import { baseForms, hasWord, POS_NAME, senses, synsets, tagCount, wordFamily, type WnPos } from '../lib/wordnet.ts';
import { datamuse, freqTag, posTags, type DmWord } from './datamuse.service.ts';
import { findOccurrences } from './transcript.service.ts';
import { registerLabels } from './wiktionary.service.ts';

/**
 * Hồ sơ từ: họ từ (WordNet), các nghĩa chính, từ đồng nghĩa kèm định nghĩa + độ phổ biến + nhãn văn phong,
 * collocation (Datamuse + danh sách soạn tay) và các câu chứa từ trong video người học đã xem.
 * Phần dùng chung được cache 30 ngày trong bảng word_profiles; phần riêng (video, sổ từ) tính theo request.
 */
const TTL_MS = 30 * 86400_000;
const DM_POS: Record<string, WnPos> = { n: 'n', v: 'v', adj: 'a', adv: 'r' };

export interface Synonym {
  word: string;
  pos: string | null;
  gloss: string;
  freq: number | null;
  level: string | null;
  labels: string[];
  collocations: string[];
}

export interface WordProfile {
  term: string;
  lemma: string;
  mainPos: string | null;
  labels: string[];
  family: { word: string; pos: string; meaning?: string }[];
  senses: { pos: string; gloss: string; examples: string[]; synonyms: string[] }[];
  synonyms: Synonym[];
  collocations: { label: string; items: { text: string; vi?: string }[] }[];
  upgrade: { basic: string; note: string } | null;
  sources: string[];
}

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

const STOP = new Set(
  'the a an of to in and or is are was were be been that this it its for on with as by at from not but so which what who whom whose how if than then there their his her my your our new other such more most some any all both either neither each whether where when why them him us me you one ones into onto upon about over under out off up down back away'.split(
    ' ',
  ),
);

async function adjNounCollocations(word: string, pos: WnPos) {
  const clean = (list: DmWord[]) => list.map((w) => w.word).filter((w) => /^[a-z-]{3,}$/.test(w) && !STOP.has(w));
  if (pos === 'n') return clean(await datamuse(`rel_jjb=${encodeURIComponent(word)}&max=20`)).slice(0, 8).map((a) => `${a} ${word}`);
  if (pos === 'a') return clean(await datamuse(`rel_jja=${encodeURIComponent(word)}&max=20`)).slice(0, 8).map((n) => `${word} ${n}`);
  if (pos === 'v') {
    // Danh từ hay đứng ngay sau động từ (bigram) — lọc bỏ hư từ
    const list = await datamuse(`rel_bga=${encodeURIComponent(word)}&md=p&max=80`);
    return list
      .filter((w) => w.tags?.includes('n') && !w.tags.includes('adv') && /^[a-z-]{4,}$/.test(w.word) && !STOP.has(w.word) && hasWord(w.word, 'n'))
      .slice(0, 6)
      .map((w) => `${word} ${w.word}`);
  }
  return [];
}

async function buildProfile(term: string): Promise<Omit<WordProfile, 'family'> & { family: { word: string; pos: string }[] }> {
  const key = termKey(term);
  const single = !/\s/.test(key);
  const bases = single ? baseForms(key) : [];
  // Ưu tiên dạng gốc có thật khác chính từ đó khi từ là dạng chia (studies → study)
  const lemma = hasWord(key) ? key : (bases[0]?.lemma ?? key);
  const posList = (['v', 'n', 'a', 'r'] as WnPos[]).filter((p) => hasWord(lemma, p)).sort((a, b) => tagCount(lemma, b) - tagCount(lemma, a));
  const mainPos = posList[0] ?? null;

  const family = single ? wordFamily(lemma).map((m) => ({ word: m.word, pos: POS_NAME[m.pos] })) : [];
  const senseList = senses(lemma, 2).slice(0, 5);

  // Từ đồng nghĩa: Datamuse "means like" (đã xếp hạng, có tần suất) + thành viên synset của WordNet
  const ml = await withTimeout(datamuse(`ml=${encodeURIComponent(lemma)}&md=fp&max=40`), 8000, [] as DmWord[]);
  const fromDm = ml
    .filter((w) => w.tags?.includes('syn') && /^[a-z][a-z -]*$/.test(w.word) && w.word.split(' ').length <= 2 && w.word !== lemma)
    .map((w) => ({ word: w.word, pos: posTags(w).map((p) => DM_POS[p]).find((p) => posList.includes(p)) ?? null, freq: freqTag(w) }));
  const fromWn = senseList.flatMap((s) => s.synonyms.filter((w) => w.split(' ').length <= 2).map((w) => ({ word: w, pos: s.pos, freq: null as number | null })));
  const candidates = uniqBy([...fromDm, ...fromWn], (s) => s.word).slice(0, 8);
  // Định nghĩa của nghĩa CHUNG giữa hai từ (synset chứa cả hai) — không phải nghĩa đầu tiên của từ đồng nghĩa
  const sharedGloss = new Map<string, string>();
  for (const ss of synsets(lemma)) for (const w of ss.words) if (!sharedGloss.has(w.toLowerCase())) sharedGloss.set(w.toLowerCase(), ss.gloss);

  const synonyms: Synonym[] = await Promise.all(
    candidates.map(async (c, i) => {
      const pos = c.pos ?? mainPos;
      const gloss = sharedGloss.get(c.word) ?? (pos ? synsets(c.word, pos)[0]?.gloss : undefined) ?? synsets(c.word)[0]?.gloss ?? '';
      const [labels, collocations] = await Promise.all([
        withTimeout(registerLabels(c.word), 6000, [] as string[]),
        i < 4 && pos ? withTimeout(adjNounCollocations(c.word, pos), 6000, [] as string[]) : Promise.resolve([] as string[]),
      ]);
      return {
        word: c.word,
        pos: pos ? POS_NAME[pos] : null,
        gloss,
        freq: c.freq,
        level: levelFromFrequency(c.freq, c.word.includes(' ')),
        labels,
        collocations: collocations.slice(0, 3),
      };
    }),
  );

  // Collocation: soạn tay (động từ + danh từ) và Datamuse (tính từ + danh từ...)
  const curated = COLLOCATIONS.filter((c) => {
    const parts = c.partner.toLowerCase().split(' ');
    return c.answer === lemma || parts.includes(lemma) || parts.some((p) => p.replace(/s$/, '') === lemma);
  }).map((c) => ({ text: `${c.answer} ${c.partner}`, vi: c.vi }));
  const collocations: WordProfile['collocations'] = [];
  if (curated.length) collocations.push({ label: 'Cụm hay dùng (soạn sẵn)', items: curated });
  for (const p of posList.slice(0, 2)) {
    const items = await withTimeout(adjNounCollocations(lemma, p), 8000, [] as string[]);
    if (items.length) {
      const label = p === 'n' ? `Tính từ + ${lemma}` : p === 'a' ? `${lemma} + danh từ` : p === 'v' ? `${lemma} + danh từ` : '';
      if (label) collocations.push({ label, items: items.map((text) => ({ text })) });
    }
  }

  const up = UPGRADES.find((u) => u.basic === lemma);
  const labels = single ? await withTimeout(registerLabels(lemma), 6000, [] as string[]) : [];
  return {
    term,
    lemma,
    mainPos: mainPos ? POS_NAME[mainPos] : null,
    labels,
    family,
    senses: senseList.map((s) => ({ pos: POS_NAME[s.pos], gloss: s.gloss, examples: s.examples.slice(0, 2), synonyms: s.synonyms.slice(0, 6) })),
    synonyms,
    collocations,
    upgrade: up ? { basic: up.basic, note: up.upgrades.map((x) => `${x.word}: ${x.note}`).join(' · ') } : null,
    sources: ['WordNet 3.1 (Princeton)', 'Datamuse API', 'Wiktionary (CC BY-SA)'],
  };
}

export async function wordProfile(term: string) {
  const key = termKey(term);
  if (!key) throw Object.assign(new Error('Từ không hợp lệ'), { status: 400 });
  const row = get<{ data: string; created_at: string }>('SELECT data, created_at FROM word_profiles WHERE lemma = ?', key);
  let profile: Awaited<ReturnType<typeof buildProfile>>;
  if (row && Date.now() - new Date(row.created_at).getTime() < TTL_MS) {
    profile = JSON.parse(row.data);
  } else {
    profile = await buildProfile(term);
    // Chỉ cache khi đã lấy được dữ liệu mạng (tránh lưu hồ sơ rỗng lúc mất mạng)
    if (profile.synonyms.length || profile.collocations.length || !profile.senses.length) {
      run(
        `INSERT INTO word_profiles (lemma, data, created_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(lemma) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
        key,
        JSON.stringify(profile),
      );
    }
  }

  // Phần riêng của người học: nghĩa tiếng Việt đã có trong sổ / bộ chủ đề, câu trong video đã xem
  const uid = currentUserId();
  const meaningOf = (w: string) =>
    get<{ meaning: string }>("SELECT meaning FROM words WHERE user_id = ? AND term_key = ? AND meaning != ''", uid, w)?.meaning ??
    get<{ meaning_vi: string }>("SELECT meaning_vi FROM lexicon WHERE word = ? AND meaning_vi != ''", w)?.meaning_vi;
  const family = profile.family.map((f) => ({ ...f, meaning: meaningOf(f.word) }));
  const occurrences = findOccurrences(profile.lemma, 6).map((o) => ({ videoId: o.video_id, videoTitle: o.title, start: o.start, text: o.text }));
  return { ...profile, family, occurrences } satisfies WordProfile & { occurrences: unknown[] };
}

/** Các thành viên họ từ kèm câu ví dụ chứa đúng dạng đó (cho bài điền dạng từ). */
export function familyExamples(lemma: string) {
  const fam = wordFamily(lemma);
  return fam.map((m) => {
    const re = inflectionRegex(m.word);
    const examples = synsets(m.word, m.pos)
      .flatMap((s) => s.examples)
      .filter((e) => re.test(e) && e.split(' ').length >= 5);
    return { word: m.word, pos: m.pos, examples };
  });
}

/** Từ trong sổ có liên quan đến danh sách nâng cấp (để gợi ý luyện). */
export function upgradeBasics() {
  const uid = currentUserId();
  const keys = new Set(all<{ term_key: string }>('SELECT term_key FROM words WHERE user_id = ?', uid).map((r) => r.term_key));
  return UPGRADES.map((u) => ({ basic: u.basic, pos: u.pos, upgrades: u.upgrades, inNotebook: u.upgrades.filter((x) => keys.has(x.word)).map((x) => x.word) }));
}
