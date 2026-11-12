/**
 * So khớp câu người học nói/gõ với câu gốc theo từng từ (LCS) — dùng cho chép chính tả và chấm shadowing.
 */

export type TokenState = 'correct' | 'wrong' | 'missing';

export interface DiffToken {
  word: string; // từ gốc (giữ dấu câu để hiển thị)
  state: TokenState;
  got?: string; // từ người học nhập ở vị trí đó (nếu sai)
}

export interface DiffResult {
  tokens: DiffToken[];
  extra: string[];
  correct: number;
  total: number;
  score: number;
}

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', ...Object.fromEntries(Object.entries(UNITS).map(([k, v]) => [k, String(v)])), ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19',
  ...Object.fromEntries(Object.entries(TENS).map(([k, v]) => [k, String(v)])), hundred: '100', thousand: '1000',
};
// Số ghép đã bỏ gạch nối: twentyfive → 25
const COMPOUND_NUMBER = new RegExp(`^(${Object.keys(TENS).join('|')})(${Object.keys(UNITS).join('|')})$`);

const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon't\b/g, 'will not'],
  [/\bcan't\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/n't\b/g, ' not'],
  [/'re\b/g, ' are'],
  [/'m\b/g, ' am'],
  [/'ll\b/g, ' will'],
  [/'ve\b/g, ' have'],
  [/'d\b/g, ' would'],
  // 's sau đại từ / từ hỏi là "is" (it's = it is); các trường hợp khác có thể là sở hữu nên giữ nguyên
  [/\b(it|that|there|what|he|she|here|where|who|how)'s\b/g, '$1 is'],
  [/\blet's\b/g, 'let us'],
  [/\bgonna\b/g, 'going to'],
  [/\bwanna\b/g, 'want to'],
];

export function normalizeWord(w: string): string {
  // Bỏ cả dấu nháy khi so sánh: it's ≈ its (lỗi nhỏ, không tính sai)
  let s = w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (NUMBER_WORDS[s]) s = NUMBER_WORDS[s];
  else {
    const m = s.match(COMPOUND_NUMBER);
    if (m) s = String(TENS[m[1]] + UNITS[m[2]]);
  }
  return s;
}

/** Tách câu thành các từ để so khớp (mở rộng dạng rút gọn: don't → do not). */
export function tokenize(text: string): { display: string; norm: string }[] {
  const out: { display: string; norm: string }[] = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    let expanded = raw.toLowerCase().replace(/[’‘]/g, "'");
    for (const [re, rep] of CONTRACTIONS) expanded = expanded.replace(re, rep);
    const parts = expanded.split(/\s+/).map(normalizeWord).filter(Boolean);
    if (!parts.length) continue;
    // từ hiển thị gắn với phần đầu, các phần mở rộng phía sau hiển thị rỗng
    parts.forEach((p, k) => out.push({ display: k === 0 ? raw : '', norm: p }));
  }
  return out;
}

function similar(a: string, b: string) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  // chấp nhận lỗi gõ 1 ký tự cho từ dài
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return Math.max(a.length, b.length) - i - j <= 1;
}

export function diffWords(target: string, attempt: string, opts: { lenient?: boolean } = {}): DiffResult {
  const t = tokenize(target);
  const a = tokenize(attempt);
  const eq = (x: string, y: string) => (opts.lenient ? similar(x, y) : x === y);
  // Bảng LCS
  const dp: number[][] = Array.from({ length: t.length + 1 }, () => new Array(a.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j >= 0; j--) {
      dp[i][j] = eq(t[i].norm, a[j].norm) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Truy vết các cặp khớp
  const matches: [number, number][] = [];
  for (let i = 0, j = 0; i < t.length && j < a.length; ) {
    if (eq(t[i].norm, a[j].norm)) {
      matches.push([i++, j++]);
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  matches.push([t.length, a.length]);

  // Giữa hai điểm khớp: ghép cặp theo vị trí → sai; thừa bên gốc → thiếu; thừa bên người học → từ thừa
  const tokens: DiffToken[] = [];
  const extra: string[] = [];
  let pi = 0;
  let pj = 0;
  for (const [mi, mj] of matches) {
    const segT = t.slice(pi, mi);
    const segA = a.slice(pj, mj);
    segT.forEach((tk, k) => {
      const got = segA[k];
      tokens.push(got ? { word: tk.display, state: 'wrong', got: got.display || got.norm } : { word: tk.display, state: 'missing' });
    });
    for (const x of segA.slice(segT.length)) extra.push(x.display || x.norm);
    if (mi < t.length) tokens.push({ word: t[mi].display, state: 'correct' });
    pi = mi + 1;
    pj = mj + 1;
  }

  // Gộp phần mở rộng của dạng rút gọn (display rỗng) vào từ trước
  const merged: DiffToken[] = [];
  for (const tk of tokens) {
    if (!tk.word && merged.length) {
      const prev = merged[merged.length - 1];
      if (tk.state !== 'correct' && prev.state === 'correct') prev.state = tk.state === 'missing' ? 'missing' : 'wrong';
      continue;
    }
    merged.push(tk);
  }
  const total = merged.length;
  const correct = merged.filter((x) => x.state === 'correct').length;
  return { tokens: merged, extra: extra.filter(Boolean), correct, total, score: total ? correct / total : 0 };
}

/**
 * Kiểm tra đáp án gõ tay (cho bài điền từ / nghe / chính tả), chấp nhận sai 1 ký tự với từ dài.
 * fuzzy = false: phải đúng hoàn toàn — dùng cho bài mà khác 1 chữ là từ khác (dạng từ: employer/employee; nghe: affect/effect).
 */
export function checkTyped(input: string, answers: string[], { fuzzy = true }: { fuzzy?: boolean } = {}): { ok: boolean; close: boolean } {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[^\p{L}\p{N}' -]+/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const v = norm(input);
  if (!v) return { ok: false, close: false };
  for (const a of answers) {
    const n = norm(a);
    if (v === n) return { ok: true, close: false };
  }
  if (!fuzzy) return { ok: false, close: false };
  for (const a of answers) {
    const n = norm(a);
    if (n.length >= 6 && levenshtein(v, n) <= 1) return { ok: true, close: true };
  }
  return { ok: false, close: false };
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
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
