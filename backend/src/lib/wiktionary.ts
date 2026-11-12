// Đọc phiên âm IPA từ mã nguồn trang Wiktionary (CC BY-SA) — dùng khi Free Dictionary API không có IPA
// (Free Dictionary API lấy dữ liệu từ Wiktionary nhưng bỏ sót nhiều mục: "impact", "project", "healthcare"…).

import { bareIpa, type IpaPair } from './ipa.ts';

export const wiktionaryUrl = (title: string) =>
  `https://en.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page=${encodeURIComponent(title)}`;

/** Trang Wiktionary theo chữ thường trước, rồi viết hoa chữ đầu (tên riêng: "Olympic") */
export const wiktionaryTitles = (word: string) => [...new Set([word, word.charAt(0).toUpperCase() + word.slice(1)])];

export type FormKind = 'plural' | 'third' | 'past' | 'ing' | 'spelling';

export interface WiktionaryIpa extends IpaPair {
  /** Mục chỉ là dạng biến đổi / cách viết khác của từ gốc (thường không ghi IPA riêng) */
  formOf?: { kind: FormKind; base: string };
}

const UK = /^(UK|RP|SSB|British|England|Southern England|Received Pronunciation)$/i;
const US = /^(US|GA|GenAm|General American|American|Canada|CA)$/i;

const FORM_TEMPLATES: [RegExp, FormKind][] = [
  [/^(plural of|en-plural of)$/, 'plural'],
  [/^(en-third-person singular of|en-third person singular of|third-person singular of)$/, 'third'],
  [/^(en-past of|en-simple past of|past participle of|en-past participle of|simple past of)$/, 'past'],
  [/^(alternative spelling of|alt sp|alt spelling|standard spelling of|alternative form of|alt form|American spelling of|British spelling of|en-US spelling of)$/, 'spelling'],
];

interface Candidate {
  pron: string;
  accents: string[];
}

/** Các phiên âm trong một đoạn mã nguồn, kèm giọng (UK/US/…) ghi trên cùng dòng */
function candidatesOf(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('*')) continue;
    // Giọng của cả dòng: "{{a|UK}}" (dạng cũ) hoặc "a=RP" ở mẫu bên cạnh ("{{enPR|…|a=RP}}, {{IPA|en|/…/}}")
    const lineAccents = [
      ...[...line.matchAll(/\{\{(?:a|accent)\|([^}]*)\}\}/g)].flatMap((m) => m[1].split('|')),
      ...[...line.matchAll(/\{\{(?!IPA\|)[^}]*\|a=([^|}]+)/g)].flatMap((m) => m[1].split(',')),
    ];
    for (const m of line.matchAll(/\{\{IPA\|en\|([^}]*)\}\}/g)) {
      const params = m[1].split('|').map((p) => p.trim());
      // Chỉ lấy phiên âm âm vị /…/ (bỏ phiên âm hẹp […])
      const pron = params.find((p) => /^\/[^/]+\/$/.test(p));
      if (!pron) continue;
      const own = params.find((p) => /^a=/.test(p))?.slice(2);
      out.push({ pron, accents: (own ? own.split(',') : lineAccents).map((a) => a.trim()).filter(Boolean) });
    }
  }
  return out;
}

const POS_HEADING = /^={3,5}\s*(Noun|Verb|Adjective|Adverb|Proper noun|Phrase|Prepositional phrase|Preposition|Idiom|Interjection)\s*={3,5}\s*$/gim;

/**
 * Lấy IPA Anh-Anh / Anh-Mỹ trong mục "English" của mã nguồn trang. Không có gì → null.
 * `pos` (từ loại trong bộ từ) giúp chọn đúng cách đọc khi danh từ và động từ đọc khác nhau:
 * chọn mục từ nguyên có từ loại đó ("graduate" danh từ /ˈɡɹæd͡ʒuət/ ≠ động từ /ˈɡɹædjueɪt/), và với danh từ/tính từ
 * thì ưu tiên cách đọc nhấn âm đầu khi trang ghi chung cả hai ("transport" /ˈtɹæns.pɔːt/ ≠ động từ /tɹænsˈpɔːt/).
 */
export function parseWiktionaryIpa(wikitext: string, pos?: string | null): WiktionaryIpa | null {
  const en = `\n${wikitext}`.split(/\n==(?!=)/).find((s) => s.startsWith('English=='));
  if (!en) return null;
  const want = pos?.toLowerCase().trim();
  // Mỗi mục từ nguyên ("===Etymology 2===") có phát âm và từ loại riêng; đoạn đầu có thể là phát âm dùng chung
  const blocks = en.split(/\n(?====\s*Etymology)/).map((text) => ({
    cands: candidatesOf(text),
    pos: [...text.matchAll(POS_HEADING)].map((m) => m[1].toLowerCase()),
  }));
  const withPos = want ? blocks.find((b) => b.pos.includes(want)) : undefined;
  const cands = (withPos?.cands.length ? withPos : blocks.find((b) => b.cands.length))?.cands ?? [];
  const initialFirst = want === 'noun' || want === 'adjective';
  const pick = (list: Candidate[]) =>
    (initialFirst ? list.find((c) => c.pron.startsWith('/ˈ')) : undefined)?.pron ?? list[0]?.pron;
  const generic = pick(cands.filter((c) => !c.accents.length));
  const any = pick(cands);
  const uk = pick(cands.filter((c) => c.accents.some((a) => UK.test(a))));
  const us = pick(cands.filter((c) => c.accents.some((a) => US.test(a))));
  let formOf: WiktionaryIpa['formOf'];
  for (const m of en.matchAll(/\{\{([^|}]+)\|([^}]*)\}\}/g)) {
    const name = m[1].trim();
    const params = m[2].split('|').map((p) => p.trim());
    if (params[0] === 'en') params.shift();
    const base = params[0];
    if (!base || base.includes('=')) continue;
    let kind = FORM_TEMPLATES.find(([re]) => re.test(name))?.[1];
    // "{{infl of|en|consume||ed-form}}", "{{inflection of|en|poach||ing-form}}"
    if (!kind && /^(infl of|inflection of)$/.test(name)) kind = inflKind(params.slice(1));
    if (kind) {
      formOf = { kind, base };
      break;
    }
  }
  const ukIpa = uk ?? generic ?? any ?? null;
  const usIpa = us ?? generic ?? any ?? null;
  if (!ukIpa && !usIpa && !formOf) return null;
  return { uk: ukIpa, us: usIpa, formOf };
}

/** Loại dạng biến đổi từ tham số của mẫu "infl of": ed-form, ing-form, s-verb-form, p… */
function inflKind(tags: string[]): FormKind | undefined {
  const t = tags.filter(Boolean).join(' ');
  if (/\bing-form\b|\bpres ptcp\b|\bpresent participle\b/.test(t)) return 'ing';
  if (/\bed-form\b|\bspast\b|\bpast\b/.test(t)) return 'past';
  if (/\bs-verb-form\b|\b3 s pres\b/.test(t)) return 'third';
  if (/^(p|pl|plural)$/.test(t)) return 'plural';
  return undefined;
}

/** IPA của dạng biến đổi từ IPA từ gốc: accessory /…ɹi/ → accessories /…ɹiz/, consume → consumed /…d/ */
export function inflectIpa(base: string, kind: Exclude<FormKind, 'spelling'>): string {
  const b = bareIpa(base) ?? '';
  const end = b.replace(/[ː.ˌˈ()͡]/g, '');
  let suffix: string;
  if (kind === 'ing') suffix = 'ɪŋ';
  else if (kind === 'past') suffix = /[td]$/.test(end) ? 'ɪd' : /(p|k|f|θ|s|ʃ|tʃ)$/.test(end) ? 't' : 'd';
  else suffix = /(s|z|ʃ|ʒ|tʃ|dʒ)$/.test(end) ? 'ɪz' : /(p|t|k|f|θ)$/.test(end) ? 's' : 'z';
  // Từ gốc một âm tiết (từ điển không ghi trọng âm) + đuôi thêm âm tiết → từ hai âm tiết, nhấn âm đầu: scorch → ˈscorching
  const stressed = suffix.length > 1 && !b.includes('ˈ') ? `ˈ${b}` : b;
  return `/${stressed}${suffix}/`;
}
