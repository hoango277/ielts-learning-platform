import { createLimiter, fetchJson } from '../../lib/http.ts';
import { stripHtml } from '../../lib/text.ts';

// Endpoint miễn phí "gtx" (giống tiện ích Google Dịch trên trình duyệt). Không cần API key.
const BASE = 'https://translate.googleapis.com/translate_a/single';
const limit = createLimiter(4, 60);

const POS_ENUM: Record<number, string> = {
  1: 'noun',
  2: 'verb',
  3: 'adjective',
  4: 'adverb',
  5: 'preposition',
  6: 'abbreviation',
  7: 'conjunction',
  8: 'pronoun',
  9: 'interjection',
  10: 'phrase',
  11: 'prefix',
  12: 'suffix',
  13: 'article',
  14: 'combining form',
  15: 'numeral',
  16: 'auxiliary verb',
  17: 'exclamation',
  18: 'plural',
  19: 'particle',
};

interface GtxResponse {
  sentences?: { trans?: string; orig?: string; src_translit?: string }[];
  dict?: { pos: string; pos_enum?: number; terms: string[]; base_form?: string; entry?: { word: string; score?: number }[] }[];
  alternative_translations?: { alternative?: { word_postproc: string }[] }[];
  definitions?: { pos: string; pos_enum?: number; base_form?: string; entry: { gloss: string; example?: string }[] }[];
  synsets?: { pos: string; pos_enum?: number; entry: { synonym: string[] }[] }[];
  examples?: { example?: { text: string }[] };
  src?: string;
}

export interface GoogleLookup {
  translation: string;
  translit?: string;
  baseForm?: string;
  dict: { pos: string; posEn?: string; terms: string[] }[];
  alternatives: string[];
  definitions: { pos: string; posEn?: string; gloss: string; example?: string }[];
  synonyms: string[];
  synonymsByPos: { posEn?: string; words: string[] }[];
  examples: string[];
}

// Google đôi khi trả tiếng Việt dạng tổ hợp (NFD) → chuẩn hoá để so sánh/loại trùng chính xác
const nfc = (s: string) => s.normalize('NFC').trim();

function buildUrl(params: Record<string, string>, dts: string[]) {
  const qs = new URLSearchParams({ client: 'gtx', dj: '1', ie: 'UTF-8', oe: 'UTF-8', ...params });
  for (const dt of dts) qs.append('dt', dt);
  return `${BASE}?${qs.toString()}`;
}

async function call(text: string, from: string, to: string, dts: string[]): Promise<GtxResponse> {
  const params = { sl: from, tl: to, hl: to };
  // Văn bản dài → POST để tránh URL quá dài
  if (text.length > 1500) {
    return limit(() =>
      fetchJson<GtxResponse>(buildUrl(params, dts), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ q: text }),
      }),
    );
  }
  return limit(() => fetchJson<GtxResponse>(buildUrl({ ...params, q: text }, dts)));
}

export async function googleTranslate(text: string, from: string, to: string): Promise<string> {
  const res = await call(text, from, to, ['t']);
  return nfc((res.sentences ?? []).map((s) => s.trans ?? '').join(''));
}

/** Tra từ/cụm từ ngắn: nghĩa chính + nghĩa theo từ loại + định nghĩa + ví dụ + đồng nghĩa. */
export async function googleLookup(text: string, from: string, to: string): Promise<GoogleLookup> {
  const res = await call(text, from, to, ['t', 'bd', 'at', 'rm', 'md', 'ex', 'ss']);
  const sentences = res.sentences ?? [];
  const translation = nfc(sentences.map((s) => s.trans ?? '').join(''));
  const translit = sentences.find((s) => s.src_translit)?.src_translit;
  const dict = (res.dict ?? []).map((d) => ({
    pos: nfc(d.pos),
    posEn: d.pos_enum ? POS_ENUM[d.pos_enum] : undefined,
    terms: [...new Set(d.terms.map(nfc))].slice(0, 8),
  }));
  const baseForm = res.dict?.find((d) => d.base_form)?.base_form ?? res.definitions?.find((d) => d.base_form)?.base_form;
  const alternatives = [
    ...new Set(
      (res.alternative_translations ?? []).flatMap((a) => (a.alternative ?? []).map((x) => nfc(x.word_postproc))),
    ),
  ].filter((a) => a && a.toLowerCase() !== translation.toLowerCase());
  const definitions = (res.definitions ?? []).flatMap((d) =>
    d.entry.slice(0, 3).map((e) => ({
      pos: d.pos,
      posEn: d.pos_enum ? POS_ENUM[d.pos_enum] : undefined,
      gloss: e.gloss,
      example: e.example ? stripHtml(e.example) : undefined,
    })),
  );
  const synonyms = [...new Set((res.synsets ?? []).flatMap((s) => s.entry.flatMap((e) => e.synonym)))].slice(0, 12);
  const synonymsByPos = (res.synsets ?? []).map((s) => ({
    posEn: s.pos_enum ? POS_ENUM[s.pos_enum] : undefined,
    words: [...new Set(s.entry.flatMap((e) => e.synonym))].slice(0, 10),
  }));
  const examples = (res.examples?.example ?? []).map((e) => stripHtml(e.text)).slice(0, 5);
  return {
    translation,
    translit,
    baseForm,
    dict,
    alternatives: alternatives.slice(0, 6),
    definitions,
    synonyms,
    synonymsByPos,
    examples,
  };
}

/**
 * Dịch nhiều câu trong một lần gọi: nối bằng "\n", tách kết quả theo dòng.
 * Nếu số dòng không khớp thì dịch lẻ từng câu.
 */
export async function googleTranslateBatch(texts: string[], from: string, to: string): Promise<string[]> {
  const out: string[] = new Array(texts.length).fill('');
  const chunks: number[][] = [];
  let current: number[] = [];
  let size = 0;
  texts.forEach((t, i) => {
    const len = t.length + 1;
    if (current.length && (size + len > 4000 || current.length >= 80)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(i);
    size += len;
  });
  if (current.length) chunks.push(current);

  await Promise.all(
    chunks.map(async (idxs) => {
      const joined = idxs.map((i) => texts[i].replace(/\s*\n\s*/g, ' ')).join('\n');
      const res = await call(joined, from, to, ['t']);
      const lines = (res.sentences ?? [])
        .map((s) => s.trans ?? '')
        .join('')
        .split('\n');
      if (lines.length === idxs.length) {
        idxs.forEach((i, k) => (out[i] = nfc(lines[k])));
      } else {
        await Promise.all(idxs.map(async (i) => (out[i] = await googleTranslate(texts[i], from, to))));
      }
    }),
  );
  return out;
}
