import crypto from 'node:crypto';

export const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

/** Khoá so khớp cho một từ/cụm từ: chữ thường, gọn khoảng trắng, bỏ dấu câu ở hai đầu. */
export function termKey(term: string): string {
  return term
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

/** Làm sạch một token lấy từ phụ đề (bỏ dấu câu dính hai đầu, giữ dấu nháy trong từ như don't). */
export function cleanToken(token: string): string {
  return token.replace(/[’‘]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '').replace(/^'+|'+$/g, '');
}

export function isSingleWord(term: string) {
  return !/\s/.test(term.trim());
}

/** Các dạng gốc có thể có của một từ tiếng Anh (heuristic, không cần thư viện NLP). */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set<string>();
  const add = (s: string) => s.length >= 2 && s !== w && out.add(s);
  if (w.endsWith('ies') && w.length > 4) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
  }
  if (w.endsWith('ing') && w.length > 5) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + 'e');
    if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
  }
  if (w.endsWith('ly') && w.length > 5) add(w.slice(0, -2));
  if (w.endsWith('er') && w.length > 4) add(w.slice(0, -2));
  if (w.endsWith('est') && w.length > 5) add(w.slice(0, -3));
  return [...out];
}

const FUNCTION_WORDS = new Set(['the', 'and', 'for', 'off', 'with', 'from', 'into', 'your', "one's", 'out', 'off', 'up']);

/** Regex tìm từ/cụm từ (kể cả biến thể -s/-ed/-ing, gấp đôi phụ âm: dropped out, studies) trong câu. */
export function inflectionRegex(term: string): RegExp {
  const parts = term
    .trim()
    .split(/\s+/)
    .map((part) => {
      let p = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (part.length < 3 || !/^[a-z'-]+$/i.test(part) || FUNCTION_WORDS.has(part.toLowerCase())) return p;
      if (/e$/i.test(part)) p = p.slice(0, -1) + 'e?';
      else if (part.length > 3 && /[^aeiou]y$/i.test(part)) p = p.slice(0, -1) + '(?:y|i)';
      return `${p}(?:[a-z]?(?:ed|ing)|s|es|d|'s)?`;
    });
  return new RegExp(`(?<![\\p{L}])(${parts.join('\\s+')})(?![\\p{L}])`, 'iu');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uniqBy<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Ước lượng cấp độ CEFR từ tần suất (số lần / triệu từ, Google Books ngram qua Datamuse). */
export function levelFromFrequency(freq: number | null | undefined, isPhrase = false): string | null {
  if (freq == null || !Number.isFinite(freq) || freq <= 0) return isPhrase ? 'B2' : null;
  const zipf = Math.log10(freq) + 3;
  if (zipf >= 5.7) return 'A1';
  if (zipf >= 5.1) return 'A2';
  if (zipf >= 4.6) return 'B1';
  if (zipf >= 4.0) return 'B2';
  if (zipf >= 2.7) return 'C1';
  return 'C2';
}

/** Động từ bất quy tắc thông dụng (gốc → các dạng) để nhận "made a decision" ≈ "make a decision". */
const IRREGULAR: Record<string, string[]> = {
  be: ['was', 'were', 'been', 'is', 'are', 'am'],
  become: ['became'],
  begin: ['began', 'begun'],
  break: ['broke', 'broken'],
  bring: ['brought'],
  build: ['built'],
  buy: ['bought'],
  catch: ['caught'],
  choose: ['chose', 'chosen'],
  come: ['came'],
  do: ['did', 'done', 'does'],
  draw: ['drew', 'drawn'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  fall: ['fell', 'fallen'],
  feel: ['felt'],
  find: ['found'],
  forget: ['forgot', 'forgotten'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone', 'goes'],
  grow: ['grew', 'grown'],
  have: ['had', 'has'],
  hear: ['heard'],
  hold: ['held'],
  keep: ['kept'],
  know: ['knew', 'known'],
  lead: ['led'],
  leave: ['left'],
  lose: ['lost'],
  make: ['made'],
  mean: ['meant'],
  meet: ['met'],
  pay: ['paid'],
  rise: ['rose', 'risen'],
  run: ['ran'],
  say: ['said'],
  see: ['saw', 'seen'],
  sell: ['sold'],
  send: ['sent'],
  speak: ['spoke', 'spoken'],
  spend: ['spent'],
  stand: ['stood'],
  take: ['took', 'taken'],
  teach: ['taught'],
  tell: ['told'],
  think: ['thought'],
  understand: ['understood'],
  win: ['won'],
  write: ['wrote', 'written'],
};
const IRREGULAR_BASE = new Map<string, string>(Object.entries(IRREGULAR).flatMap(([base, forms]) => forms.map((f) => [f, base] as [string, string])));

/** Các biến thể của cụm khi thay động từ bất quy tắc bằng dạng khác (make ↔ made, took ↔ take). */
export function irregularVariants(term: string): string[] {
  const words = term.trim().split(/\s+/);
  const out = new Set<string>();
  words.forEach((w, i) => {
    const lower = w.toLowerCase();
    const base = IRREGULAR[lower] ? lower : IRREGULAR_BASE.get(lower);
    if (!base) return;
    for (const form of [base, ...IRREGULAR[base]]) {
      if (form === lower) continue;
      out.add([...words.slice(0, i), form, ...words.slice(i + 1)].join(' '));
    }
  });
  return [...out];
}
