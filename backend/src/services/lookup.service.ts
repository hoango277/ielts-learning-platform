import { get } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { isSingleWord, lemmaCandidates, termKey } from '../lib/text.ts';
import { lookupDictionary, type DictEntry } from './dictionary.service.ts';
import { getSettings } from './settings.service.ts';
import { lookupGoogle, resolveProvider, translateText, type Provider } from './translate/index.ts';

export interface LookupResult {
  term: string;
  lemma: string;
  ipa?: string;
  ipaUk?: string;
  ipaUs?: string;
  audio?: string;
  audioUk?: string;
  audioUs?: string;
  pos?: string;
  translation: string;
  provider: Provider;
  /** Nghĩa trong câu: Hy-MT dịch theo ngữ cảnh, hoặc nghĩa từ điển khớp với bản dịch của câu (Google). */
  contextual?: { text: string; provider: Provider; method: 'model' | 'match' };
  contextTranslation?: string;
  /** Nghĩa tiếng Anh (định nghĩa) phù hợp nhất với ngữ cảnh. */
  sense?: { pos: string; definition: string; example?: string };
  dict: { pos: string; posEn?: string; terms: string[] }[];
  meanings: DictEntry['meanings'];
  synonyms: string[];
  examples: string[];
  saved: { id: number; status: string } | null;
  lexiconId: number | null;
}

function savedWord(keys: string[]) {
  for (const k of keys) {
    const row = get<{ id: number; status: string }>(
      `SELECT id, CASE WHEN known = 1 THEN 'known' WHEN state = 0 THEN 'new' WHEN state IN (1,3) THEN 'learning'
              WHEN stability >= 21 THEN 'mastered' ELSE 'reviewing' END AS status
         FROM words WHERE user_id = ? AND term_key = ?`,
      currentUserId(),
      k,
    );
    if (row) return row;
  }
  return null;
}

const normVi = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Âm tiết quá phổ biến, khớp đơn lẻ dễ sai
const VI_STOP = new Set(['ra', 'có', 'là', 'của', 'một', 'và', 'các', 'những', 'được', 'cho', 'với', 'này', 'đó', 'thì', 'mà', 'đã', 'sẽ', 'đang', 'không', 'người', 'việc', 'sự', 'cái', 'con', 'lại', 'đi', 'vào', 'lên', 'bị', 'rất']);

/** Tìm nghĩa ứng viên (theo từ loại + bản dịch thay thế) xuất hiện trong bản dịch của cả câu. */
function matchInContext(candidates: { term: string; posEn?: string }[], contextVi: string) {
  const tokens = normVi(contextVi).split(' ');
  const joined = ` ${tokens.join(' ')} `;
  let best: { term: string; posEn?: string; score: number } | null = null;
  for (const c of candidates) {
    const t = normVi(c.term);
    if (!t) continue;
    const syl = t.split(' ');
    if (syl.length === 1 && (VI_STOP.has(t) || t.length < 2)) continue;
    let score = 0;
    if (joined.includes(` ${t} `)) {
      score = syl.length * 2 + (syl.length > 1 ? 1 : 0);
    } else if (syl.length > 1) {
      // các âm tiết xuất hiện theo thứ tự, cách nhau tối đa 3 từ ("trải ... ra")
      let pos = -1;
      let ok = true;
      for (const s of syl) {
        const next = tokens.indexOf(s, pos + 1);
        if (next < 0 || (pos >= 0 && next - pos > 4)) {
          ok = false;
          break;
        }
        pos = next;
      }
      if (ok) score = syl.length;
    }
    if (score && (!best || score > best.score)) best = { ...c, score };
  }
  return best;
}

const EN_STOP = new Set(
  'the a an of to in and or is are was were be been being that this these those it its for on with as by at from i you he she we they me him us them my your his her our their have has had do does did not but so which what who whom can could would should will just like about into than then there some any all more most very one something someone somebody person thing things used especially often usually way also such other when where how if no'.split(
    ' ',
  ),
);

function contentStems(text: string, exclude: string) {
  const ex = exclude.slice(0, 5);
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((w) => w.length > 2 && !EN_STOP.has(w))
      .map((w) => w.slice(0, 5))
      .filter((w) => w !== ex),
  );
}

/** Chọn định nghĩa có nhiều từ chung với câu ngữ cảnh nhất (ưu tiên đúng từ loại). */
function pickSense(context: string, meanings: DictEntry['meanings'], term: string, preferredPos?: string) {
  const ctx = contentStems(context, term);
  let best: { pos: string; definition: string; example?: string; score: number } | null = null;
  meanings.forEach((m, mi) => {
    m.definitions.forEach((d, di) => {
      const words = contentStems(`${d.definition} ${d.example ?? ''}`, term);
      let overlap = 0;
      for (const w of words) if (ctx.has(w)) overlap++;
      const score = overlap * 3 + (preferredPos && m.pos === preferredPos ? 2 : 0) - di * 0.1 - mi * 0.05;
      if (!best || score > best.score) best = { pos: m.pos, definition: d.definition, example: d.example, score };
    });
  });
  return best as { pos: string; definition: string; example?: string } | null;
}

/** Tra cứu đầy đủ cho popup: IPA + audio + nghĩa (theo ngữ cảnh nếu có Hy-MT) + định nghĩa + ví dụ. */
export async function lookupTerm(rawTerm: string, context?: string): Promise<LookupResult> {
  const term = rawTerm.trim().replace(/\s+/g, ' ');
  const key = termKey(term);
  const single = isSingleWord(key);
  const s = getSettings();
  const provider = resolveProvider();

  const [google, dictFirst, contextual] = await Promise.all([
    lookupGoogle(key, 'en', s.targetLang),
    key.split(' ').length <= 4 ? lookupDictionary(key) : Promise.resolve(null),
    // Dịch theo ngữ cảnh câu chỉ có ý nghĩa với Hy-MT (Google không nhận ngữ cảnh)
    provider === 'hymt' && context ? translateText(term, { context }).catch(() => null) : Promise.resolve(null),
  ]);

  // Không có trong từ điển → thử dạng gốc (studies → study)
  let lemma = key;
  let dict = dictFirst;
  if (single) {
    const candidates = [google?.baseForm?.toLowerCase(), ...lemmaCandidates(key)].filter(
      (c): c is string => Boolean(c && c !== key),
    );
    if (!dict) {
      for (const c of candidates.slice(0, 4)) {
        dict = await lookupDictionary(c);
        if (dict) {
          lemma = c;
          break;
        }
      }
    } else if (google?.baseForm && google.baseForm.toLowerCase() !== key) {
      lemma = google.baseForm.toLowerCase();
    }
  }

  let translation = google?.translation ?? '';
  let usedProvider: Provider = 'google';
  if (!translation || (provider === 'hymt' && !contextual)) {
    const t = await translateText(term).catch(() => null);
    if (t) {
      translation = t.translation;
      usedProvider = t.provider;
    }
  }

  const meanings: DictEntry['meanings'] =
    dict?.meanings ??
    (google?.definitions.length
      ? [
          {
            pos: google.definitions[0].posEn ?? '',
            definitions: google.definitions.map((d) => ({ definition: d.gloss, example: d.example })),
            synonyms: google.synonyms,
            antonyms: [],
          },
        ]
      : []);

  // Nghĩa trong ngữ cảnh: ưu tiên Hy-MT; nếu dùng Google thì khớp nghĩa từ điển với bản dịch cả câu
  let ctxMeaning: LookupResult['contextual'];
  let contextTranslation: string | undefined;
  let ctxPos: string | undefined;
  if (contextual?.contextual) {
    ctxMeaning = { text: contextual.translation, provider: contextual.provider, method: 'model' };
  } else if (context && google) {
    contextTranslation = (await translateText(context, { provider: 'google' }).catch(() => null))?.translation;
    if (contextTranslation) {
      const candidates = [
        ...google.dict.flatMap((d) => d.terms.map((t) => ({ term: t, posEn: d.posEn }))),
        ...google.alternatives.map((t) => ({ term: t })),
        { term: google.translation },
      ];
      const match = matchInContext(candidates, contextTranslation);
      if (match) {
        ctxMeaning = { text: match.term, provider: 'google', method: 'match' };
        ctxPos = match.posEn;
      }
    }
  }
  const sense = context ? pickSense(context, meanings, lemma, ctxPos) : null;

  const lexicon = get<{ id: number }>('SELECT id FROM lexicon WHERE word = ? OR word = ?', key, lemma);
  const examples = [
    ...((dict?.meanings.flatMap((m) => m.definitions.map((d) => d.example).filter(Boolean)) as string[]) ?? []),
    ...(google?.examples ?? []),
  ];

  return {
    term,
    lemma,
    // Không dùng src_translit của Google: đó là phiên âm kiểu từ điển Mỹ, không phải IPA
    ipa: dict?.ipa,
    ipaUk: dict?.ipaUk,
    ipaUs: dict?.ipaUs,
    audio: dict?.audio,
    audioUk: dict?.audioUk,
    audioUs: dict?.audioUs,
    pos: sense?.pos ?? ctxPos ?? dict?.meanings[0]?.pos ?? google?.dict[0]?.posEn,
    translation,
    provider: usedProvider,
    contextual: ctxMeaning,
    contextTranslation,
    sense: sense ?? undefined,
    dict: google?.dict ?? [],
    meanings,
    synonyms: [...new Set([...(dict?.meanings.flatMap((m) => m.synonyms) ?? []), ...(google?.synonyms ?? [])])].slice(0, 10),
    examples: [...new Set(examples)].slice(0, 5),
    saved: savedWord([key, lemma]),
    lexiconId: lexicon?.id ?? null,
  };
}
