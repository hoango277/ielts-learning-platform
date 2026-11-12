// Phiên âm IPA: ghép cho cụm từ, thử cách viết Anh ↔ Mỹ khi từ điển không có.

export interface IpaPair {
  uk: string | null;
  us: string | null;
}

/** Bỏ dấu "/" hoặc "[ ]" bao quanh: "/ˈwɜːld/" → "ˈwɜːld" */
export const bareIpa = (s?: string | null) => s?.trim().replace(/^[/[]+|[/\]]+$/g, '').trim() || null;

/**
 * Chuẩn hoá cách viết IPA: bỏ dấu chấm tách âm tiết đứng ngay trước dấu trọng âm ("stɪ.ˈkeɪ" → "stɪˈkeɪ");
 * từ đơn thì bỏ khoảng trắng lọt vào từ nguồn ("/ˌæn θrə pəˈdʒɛn ɪk/" → "/ˌænθrəpəˈdʒɛnɪk/").
 */
export function cleanIpa(ipa: string, term: string): string {
  let s = ipa.trim().replace(/\.(?=[ˈˌ])/g, '');
  if (!/[\s-]/.test(term.trim())) s = s.replace(/\s+/g, '');
  return s;
}

/** Chữ thành phần của cụm (tách theo khoảng trắng và gạch nối): "close-knit" → ["close", "knit"] */
export function phraseParts(term: string): string[] {
  return term
    .toLowerCase()
    .split(/[\s\-–]+/)
    .map((p) => p.replace(/[^a-z']/g, '').replace(/^'+|'+$/g, ''))
    .filter(Boolean);
}

export const isMultiPart = (term: string) => phraseParts(term).length > 1;

/** Cách viết khác (Anh ↔ Mỹ) đọc giống nhau: colonise → colonize, behavioural → behavioral, theatre → theater… */
export function spellingVariants(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set<string>();
  const rules: [RegExp, string][] = [
    [/is(e|ed|es|ing|ation|ations|er|ers)$/, 'iz$1'],
    [/ys(e|ed|es|ing)$/, 'yz$1'],
    [/our(s|al|ed|ing|er|ers|able|ite|ites|hood|hoods)?$/, 'or$1'],
    [/tre(s)?$/, 'ter$1'],
    [/ll(ed|ing|er|ers|ment)$/, 'l$1'],
    [/ageing$/, 'aging'],
    [/ogue$/, 'og'],
    [/(de|of)fence$/, '$1fense'],
    [/licence$/, 'license'],
    [/iz(e|ed|es|ing|ation|ations)$/, 'is$1'],
  ];
  for (const [re, rep] of rules) {
    const v = w.replace(re, rep);
    if (v !== w) out.add(v);
  }
  return [...out];
}

/** Hư từ nằm trong cụm đọc lướt (dạng yếu), khác khi tra riêng: "a" /eɪ/ → /ə/, "to" /tuː/ → /tə/ */
const WEAK_FORMS: Record<string, IpaPair> = {
  a: { uk: 'ə', us: 'ə' },
  an: { uk: 'ən', us: 'ən' },
  the: { uk: 'ðə', us: 'ðə' },
  of: { uk: 'əv', us: 'əv' },
  to: { uk: 'tə', us: 'tə' },
  and: { uk: 'ənd', us: 'ənd' },
  for: { uk: 'fə', us: 'fɚ' },
  at: { uk: 'ət', us: 'ət' },
  from: { uk: 'frəm', us: 'frəm' },
  as: { uk: 'əz', us: 'əz' },
};

/**
 * IPA cho cụm từ: ghép IPA của từng chữ ("global warming" → /ˈɡləʊbəl ˈwɔːmɪŋ/).
 * Chỉ trả kết quả khi tra được MỌI chữ (thiếu một chữ thì phiên âm sẽ sai, thà để trống).
 */
export async function composePhraseIpa(
  term: string,
  ipaOf: (word: string) => Promise<IpaPair | null>,
  maxParts = 5,
): Promise<IpaPair | null> {
  const parts = phraseParts(term);
  if (parts.length < 2 || parts.length > maxParts) return null;
  const found = await Promise.all(parts.map((p) => WEAK_FORMS[p] ?? ipaOf(p).catch(() => null)));
  const uk: string[] = [];
  const us: string[] = [];
  for (const f of found) {
    const a = bareIpa(f?.uk ?? f?.us);
    const b = bareIpa(f?.us ?? f?.uk);
    if (!a || !b) return null;
    uk.push(a);
    us.push(b);
  }
  return { uk: `/${uk.join(' ')}/`, us: `/${us.join(' ')}/` };
}

// ---------- Suy IPA theo cấu tạo từ (khi mọi từ điển đều không có) ----------

/** Tiền tố mang trọng âm phụ, phần gốc giữ trọng âm chính: undergraduate = ˌʌndə + ˈɡɹædʒuət */
const PREFIXES: [string, string, string][] = [
  ['inter', 'ˌɪntə', 'ˌɪntɚ'],
  ['under', 'ˌʌndə', 'ˌʌndɚ'],
  ['over', 'ˌəʊvə', 'ˌoʊvɚ'],
  ['photo', 'ˌfəʊtəʊ', 'ˌfoʊtoʊ'],
  ['geo', 'ˌdʒiːəʊ', 'ˌdʒioʊ'],
  ['multi', 'ˌmʌlti', 'ˌmʌlti'],
  ['non', 'ˌnɒn', 'ˌnɑn'],
  ['re', 'ˌɹiː', 'ˌɹi'],
  ['de', 'ˌdiː', 'ˌdi'],
  // un- thường không nhấn: unspoilt /ʌnˈspɔɪlt/
  ['un', 'ʌn', 'ʌn'],
];

/** Hậu tố không nhấn, ghép thẳng sau từ gốc: sponsorship = sponsor + ʃɪp, densely = dense + li */
const SUFFIXES: [string, string][] = [
  ['ship', 'ʃɪp'],
  ['ism', 'ɪzəm'],
  ['ist', 'ɪst'],
  ['ness', 'nəs'],
  ['ment', 'mənt'],
  ['ly', 'li'],
  ['ing', 'ɪŋ'],
];

const hasPrimary = (ipa: string) => ipa.includes('ˈ');
/** Từ một âm tiết thường không ghi trọng âm; khi thành phần đầu của từ dài hơn thì phải nhấn: work → ˈwork-load */
const stressFirst = (ipa: string) => (hasPrimary(ipa) ? ipa : `ˈ${ipa.replace(/^ˌ/, '')}`);
/** Hạ trọng âm chính xuống trọng âm phụ (phần sau của từ ghép, hoặc gốc trước đuôi -ation) */
const demote = (ipa: string) => (hasPrimary(ipa) ? ipa.replace(/ˈ/g, 'ˌ') : `ˌ${ipa}`);

function mapPair(p: IpaPair, f: (ipa: string, side: 'uk' | 'us') => string | null): IpaPair | null {
  const uk = bareIpa(p.uk ?? p.us);
  const us = bareIpa(p.us ?? p.uk);
  if (!uk || !us) return null;
  const a = f(uk, 'uk');
  const b = f(us, 'us');
  return a && b ? { uk: `/${a}/`, us: `/${b}/` } : null;
}

/**
 * Suy IPA cho từ phái sinh / từ ghép khi từ điển không có, theo quy tắc cấu tạo từ chuẩn:
 * tiền tố (inter-, under-, re-…) mang trọng âm phụ; hậu tố -ship/-ism/-ly/-ing… không nhấn; -ion + -al;
 * -isation/-ization dời trọng âm về "ˈzeɪʃən"; từ ghép hai từ tự do nhấn âm đầu (workload /ˈwɜːkˌləʊd/).
 * `isWord` lọc cách tách từ ghép (không gọi mạng cho những phần chắc chắn không phải từ).
 */
export async function derivedIpa(
  word: string,
  ipaOf: (w: string) => Promise<IpaPair | null>,
  isWord: (w: string) => boolean,
): Promise<IpaPair | null> {
  const w = word.toLowerCase();
  if (!/^[a-z]{5,}$/.test(w)) return null;
  const tryBase = async (base: string, f: (ipa: string, side: 'uk' | 'us') => string | null) => {
    if (base.length < 3) return null;
    const p = await ipaOf(base);
    return p ? mapPair(p, f) : null;
  };

  // -isation / -ization: urbanise → urbanisation (trọng âm dời về "-ˈzeɪʃən")
  const iz = w.match(/^(.+)i[sz]ation$/);
  if (iz) {
    for (const base of [`${iz[1]}ize`, `${iz[1]}ise`]) {
      const r = await tryBase(base, (ipa) => (/z$/.test(ipa) ? `${demote(ipa).replace(/z$/, '')}ˈzeɪʃən` : null));
      if (r) return r;
    }
  }
  // -ation dời trọng âm về "-ˈeɪʃən": domesticate → domestication, afforest → afforestation
  const at = w.match(/^(.+)ation$/);
  if (at && !iz) {
    for (const base of [`${at[1]}ate`, at[1], `${at[1]}e`]) {
      if (!isWord(base)) continue;
      const r = await tryBase(base, (ipa) => {
        const d = demote(ipa).replace(/eɪt$/, '');
        // Trọng âm đặt trước phụ âm cuối của gốc (đầu âm tiết mới): ...ɹɪsˈteɪʃən
        const m = d.match(/^(.*?)([^aeiouæɑɒɔəɛɪʊʌɜːˌ.()]?)$/);
        return m ? `${m[1]}ˈ${m[2]}eɪʃən` : null;
      });
      if (r) return r;
    }
  }
  // -ion + -al: instruction → instructional
  if (/ional$/.test(w)) {
    const r = await tryBase(w.slice(0, -2), (ipa) => `${ipa}əl`);
    if (r) return r;
  }
  for (const [suffix, ipa] of SUFFIXES) {
    if (!w.endsWith(suffix)) continue;
    const stem = w.slice(0, -suffix.length);
    // densely → dense + ly; environmentally → environmental + ly
    for (const base of suffix === 'ly' ? [stem, `${stem}e`] : [stem]) {
      if (!isWord(base)) continue;
      // environmental /…təl/ + ly → /…təli/ (không lặp /l/)
      const r = await tryBase(base, (b) => `${stressFirst(b)}${suffix === 'ly' && /l$/.test(b) ? 'i' : ipa}`);
      if (r) return r;
    }
  }
  for (const [prefix, uk, us] of PREFIXES) {
    const base = w.slice(prefix.length);
    if (!w.startsWith(prefix) || base.length < 4 || !isWord(base)) continue;
    // Gốc một âm tiết (không ghi trọng âm) vẫn là âm nhấn chính: over + ˈpriced
    const r = await tryBase(base, (b, side) => `${side === 'uk' ? uk : us}${hasPrimary(b) ? b : `ˈ${b.replace(/^ˌ/, '')}`}`);
    if (r) return r;
  }
  // Từ ghép: workload = work + load, hairstyle = hair + style (nhấn phần đầu)
  for (let i = 3; i <= w.length - 3; i++) {
    const a = w.slice(0, i);
    const b = w.slice(i);
    if (!isWord(a) || !isWord(b) || PREFIXES.some(([p]) => p === a)) continue;
    const [pa, pb] = [await ipaOf(a), await ipaOf(b)];
    if (!pa || !pb) continue;
    const r = mapPair(pa, (x, side) => {
      const y = bareIpa(side === 'uk' ? (pb.uk ?? pb.us) : (pb.us ?? pb.uk));
      return y ? `${stressFirst(x)}${demote(y)}` : null;
    });
    if (r) return r;
  }
  return null;
}
