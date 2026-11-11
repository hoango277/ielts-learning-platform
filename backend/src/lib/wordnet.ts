import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Đọc WordNet 3.1 (gói wordnet-db, dữ liệu offline của Princeton): nghĩa, từ đồng nghĩa và
 * quan hệ phái sinh giữa các từ (decide → decision → decisive → decisively).
 * Index nạp vào bộ nhớ một lần; dòng dữ liệu đọc theo byte offset khi cần.
 */
const require = createRequire(import.meta.url);
const DICT_DIR: string = (require('wordnet-db') as { path: string }).path;

export type WnPos = 'n' | 'v' | 'a' | 'r';
const FILE: Record<WnPos, string> = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
export const POS_NAME: Record<WnPos, string> = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };

interface IndexEntry {
  offsets: number[];
  /** Số lần các nghĩa được gắn nhãn trong ngữ liệu SemCor — xấp xỉ độ phổ biến. */
  tagCount: number;
}

export interface Synset {
  offset: number;
  pos: WnPos;
  words: string[];
  gloss: string;
  examples: string[];
  pointers: { symbol: string; offset: number; pos: WnPos; source: number; target: number }[];
}

let index: Map<string, Partial<Record<WnPos, IndexEntry>>> | null = null;

function loadIndex() {
  if (index) return index;
  const map = new Map<string, Partial<Record<WnPos, IndexEntry>>>();
  for (const pos of Object.keys(FILE) as WnPos[]) {
    const text = fs.readFileSync(path.join(DICT_DIR, `index.${FILE[pos]}`), 'utf8');
    for (const line of text.split('\n')) {
      if (!line || line.startsWith(' ')) continue;
      const parts = line.trim().split(' ');
      const synsetCnt = Number(parts[2]);
      const offsets = parts.slice(parts.length - synsetCnt).map(Number);
      const tagCount = Number(parts[parts.length - synsetCnt - 1]) || 0;
      const entry = map.get(parts[0]) ?? {};
      entry[pos] = { offsets, tagCount };
      map.set(parts[0], entry);
    }
  }
  index = map;
  return map;
}

const fds = new Map<WnPos, number>();
const synsetCache = new Map<string, Synset>();

const normPos = (p: string): WnPos => (p === 's' ? 'a' : (p as WnPos));
const toWord = (w: string) => w.replace(/\(.*\)$/, '').replace(/_/g, ' ');
const toKey = (w: string) => w.trim().toLowerCase().replace(/\s+/g, '_');

export function readSynset(pos: WnPos, offset: number): Synset {
  const key = `${pos}:${offset}`;
  const hit = synsetCache.get(key);
  if (hit) return hit;
  let fd = fds.get(pos);
  if (fd === undefined) {
    fd = fs.openSync(path.join(DICT_DIR, `data.${FILE[pos]}`), 'r');
    fds.set(pos, fd);
  }
  let size = 4096;
  let line = '';
  for (;;) {
    const buf = Buffer.alloc(size);
    const n = fs.readSync(fd, buf, 0, size, offset);
    const text = buf.subarray(0, n).toString('utf8');
    const nl = text.indexOf('\n');
    if (nl >= 0 || n < size) {
      line = nl >= 0 ? text.slice(0, nl) : text;
      break;
    }
    size *= 2;
  }
  const bar = line.indexOf(' | ');
  const head = (bar >= 0 ? line.slice(0, bar) : line).trim().split(' ');
  const glossRaw = bar >= 0 ? line.slice(bar + 3).trim() : '';
  const wCnt = parseInt(head[3], 16);
  const words: string[] = [];
  let i = 4;
  for (let k = 0; k < wCnt; k++, i += 2) words.push(toWord(head[i]));
  const pCnt = Number(head[i++]);
  const pointers: Synset['pointers'] = [];
  for (let k = 0; k < pCnt; k++, i += 4) {
    const st = head[i + 3];
    pointers.push({
      symbol: head[i],
      offset: Number(head[i + 1]),
      pos: normPos(head[i + 2]),
      source: parseInt(st.slice(0, 2), 16),
      target: parseInt(st.slice(2), 16),
    });
  }
  // Phần chú giải: "định nghĩa; "ví dụ 1"; "ví dụ 2""
  const examples = [...glossRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  const gloss = glossRaw.replace(/;?\s*"[^"]*"/g, '').replace(/;\s*$/, '').trim();
  const synset: Synset = { offset, pos, words, gloss, examples, pointers };
  synsetCache.set(key, synset);
  return synset;
}

export function hasWord(word: string, pos?: WnPos): boolean {
  const e = loadIndex().get(toKey(word));
  return Boolean(e && (pos ? e[pos] : Object.keys(e).length));
}

export function posOf(word: string): WnPos[] {
  const e = loadIndex().get(toKey(word));
  return e ? (Object.keys(e) as WnPos[]) : [];
}

export function tagCount(word: string, pos?: WnPos): number {
  const e = loadIndex().get(toKey(word));
  if (!e) return 0;
  if (pos) return e[pos]?.tagCount ?? 0;
  return Object.values(e).reduce((s, x) => s + (x?.tagCount ?? 0), 0);
}

export function synsets(word: string, pos?: WnPos): Synset[] {
  const e = loadIndex().get(toKey(word));
  if (!e) return [];
  const out: Synset[] = [];
  for (const p of pos ? [pos] : (['n', 'v', 'a', 'r'] as WnPos[])) {
    for (const off of e[p]?.offsets ?? []) out.push(readSynset(p, off));
  }
  return out;
}

/** Dạng gốc trong WordNet của một từ đã chia (studies → study, decided → decide, better → good không xử lý). */
export function baseForms(word: string): { lemma: string; pos: WnPos }[] {
  const w = word.toLowerCase();
  const out: { lemma: string; pos: WnPos }[] = [];
  const push = (lemma: string, pos: WnPos) => {
    if (hasWord(lemma, pos) && !out.some((o) => o.lemma === lemma && o.pos === pos)) out.push({ lemma, pos });
  };
  for (const p of posOf(w)) push(w, p);
  const rules: [RegExp, string, WnPos][] = [
    [/ies$/, 'y', 'n'],
    [/ses$/, 's', 'n'],
    [/xes$/, 'x', 'n'],
    [/ches$/, 'ch', 'n'],
    [/shes$/, 'sh', 'n'],
    [/s$/, '', 'n'],
    [/ies$/, 'y', 'v'],
    [/es$/, 'e', 'v'],
    [/es$/, '', 'v'],
    [/s$/, '', 'v'],
    [/ied$/, 'y', 'v'],
    [/ed$/, 'e', 'v'],
    [/ed$/, '', 'v'],
    [/([^aeiou])\1ed$/, '$1', 'v'],
    [/ing$/, 'e', 'v'],
    [/ing$/, '', 'v'],
    [/([^aeiou])\1ing$/, '$1', 'v'],
    [/er$/, '', 'a'],
    [/est$/, '', 'a'],
    [/ier$/, 'y', 'a'],
    [/iest$/, 'y', 'a'],
  ];
  for (const [re, rep, pos] of rules) if (re.test(w)) push(w.replace(re, rep), pos);
  return out;
}

const PREFIX = (a: string, b: string) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** Ứng viên phái sinh theo phụ tố quen thuộc (chỉ giữ từ có thật trong WordNet). */
function affixCandidates(word: string, pos: WnPos): { word: string; pos: WnPos }[] {
  const out: { word: string; pos: WnPos }[] = [];
  const stemY = word.endsWith('y') ? word.slice(0, -1) + 'i' : word;
  if (pos === 'a') {
    out.push({ word: word.endsWith('le') ? word.slice(0, -1) + 'y' : word.endsWith('ic') ? word + 'ally' : stemY + 'ly', pos: 'r' });
    out.push({ word: stemY + 'ness', pos: 'n' });
    for (const pre of ['un', 'in', 'im', 'ir', 'il', 'dis']) out.push({ word: pre + word, pos: 'a' });
  }
  if (pos === 'v') {
    out.push({ word: word + 'ment', pos: 'n' });
    out.push({ word: (word.endsWith('e') ? word.slice(0, -1) : word) + 'able', pos: 'a' });
    out.push({ word: (word.endsWith('e') ? word + 'r' : word + 'er'), pos: 'n' });
  }
  if (pos === 'n') out.push({ word: word + 'al', pos: 'a' });
  return out.filter((c) => hasWord(c.word, c.pos));
}

export interface FamilyMember {
  word: string;
  pos: WnPos;
  tagCount: number;
}

/**
 * Họ từ: đi theo con trỏ phái sinh (+), "phát sinh từ tính từ" (\) và phân từ (<) của WordNet tối đa 2 bước,
 * cộng thêm dạng có phụ tố quen thuộc. Chỉ giữ từ có chung phần đầu với từ gốc để loại liên kết ngữ nghĩa xa.
 */
export function wordFamily(word: string, max = 14): FamilyMember[] {
  const root = word.toLowerCase().trim();
  if (!root || /\s/.test(root)) return [];
  const starts = baseForms(root);
  const seen = new Map<string, FamilyMember>();
  const add = (w: string, pos: WnPos) => {
    const key = `${w}|${pos}`;
    if (seen.has(key) || /[\s_]/.test(w) || !/^[a-z-]+$/.test(w)) return false;
    seen.set(key, { word: w, pos, tagCount: tagCount(w, pos) });
    return true;
  };
  let frontier: { word: string; pos: WnPos }[] = [];
  for (const s of starts) {
    add(s.lemma, s.pos);
    frontier.push({ word: s.lemma, pos: s.pos });
  }
  const lemma = starts[0]?.lemma ?? root;
  const minPrefix = Math.min(4, Math.max(3, lemma.length - 2));
  for (let depth = 0; depth < 2 && frontier.length; depth++) {
    const next: { word: string; pos: WnPos }[] = [];
    for (const f of frontier) {
      for (const ss of synsets(f.word, f.pos)) {
        const idx = ss.words.findIndex((x) => x.toLowerCase() === f.word);
        if (idx < 0) continue;
        for (const p of ss.pointers) {
          if (!['+', '\\', '<'].includes(p.symbol) || p.source !== idx + 1 || !p.target) continue;
          const target = readSynset(p.pos, p.offset).words[p.target - 1]?.toLowerCase();
          if (!target || PREFIX(target, lemma) < minPrefix) continue;
          if (add(target, p.pos)) next.push({ word: target, pos: p.pos });
        }
      }
      for (const c of affixCandidates(f.word, f.pos)) if (add(c.word, c.pos)) next.push(c);
    }
    frontier = next;
  }
  // Bỏ phân từ thuần tuý (deciding, decided) — chỉ là dạng chia của động từ trong họ
  const verbs = [...seen.values()].filter((m) => m.pos === 'v').map((m) => m.word);
  const isInflection = (w: string) =>
    verbs.some((v) => w !== v && [v + 'ing', v.replace(/e$/, '') + 'ing', v + 'ed', v + 'd', v.replace(/y$/, 'i') + 'ed'].includes(w));
  const order: WnPos[] = ['v', 'n', 'a', 'r'];
  return [...seen.values()]
    .filter((m) => !isInflection(m.word))
    .sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos) || b.tagCount - a.tagCount || a.word.length - b.word.length)
    .slice(0, max);
}

export interface SynonymSense {
  pos: WnPos;
  gloss: string;
  examples: string[];
  synonyms: string[];
}

/** Các nghĩa chính của từ (mỗi từ loại tối đa `perPos` nghĩa) cùng các từ đồng nghĩa trong nghĩa đó. */
export function senses(word: string, perPos = 3): SynonymSense[] {
  const key = word.toLowerCase();
  const out: SynonymSense[] = [];
  const starts = baseForms(key);
  const lemma = starts[0]?.lemma ?? key;
  for (const pos of ['v', 'n', 'a', 'r'] as WnPos[]) {
    if (!hasWord(lemma, pos)) continue;
    for (const ss of synsets(lemma, pos).slice(0, perPos)) {
      out.push({
        pos,
        gloss: ss.gloss,
        examples: ss.examples,
        synonyms: ss.words.map((w) => w.toLowerCase()).filter((w) => w !== lemma),
      });
    }
  }
  // Nghĩa nhiều từ loại: xếp từ loại phổ biến nhất lên trước
  return out.sort((a, b) => tagCount(lemma, b.pos) - tagCount(lemma, a.pos));
}

/** Ví dụ có chứa đúng từ này trong các nghĩa của nó (dùng làm câu cho bài điền dạng từ). */
export function examplesFor(word: string, pos?: WnPos): string[] {
  const out: string[] = [];
  for (const ss of synsets(word, pos)) for (const ex of ss.examples) out.push(ex);
  return out;
}
