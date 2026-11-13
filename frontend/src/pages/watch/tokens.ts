import type { Sentence, VerbForm, WordKey, WordStatus } from '../../lib/types';
import { lemmaCandidates, termKey } from '../../lib/utils';

export interface Token {
  text: string; // hiển thị (giữ dấu câu)
  key: string; // dạng sạch để tra
  s: number;
  e: number;
  status?: WordStatus;
  /** Kính thì: thì của cụm động từ chứa từ này + mã nhóm (câu hỏi đảo có 2 đoạn chung một nhóm) */
  tense?: VerbForm;
  tenseG?: number;
}

export interface KeyIndex {
  single: Map<string, WordStatus>;
  phrases: Map<string, WordStatus>;
  maxPhraseLen: number;
}

export function buildKeyIndex(keys: WordKey[] | undefined): KeyIndex {
  const single = new Map<string, WordStatus>();
  const phrases = new Map<string, WordStatus>();
  let maxPhraseLen = 1;
  for (const k of keys ?? []) {
    const n = k.key.split(' ').length;
    if (n > 1) {
      phrases.set(k.key, k.status);
      maxPhraseLen = Math.max(maxPhraseLen, Math.min(n, 5));
    } else single.set(k.key, k.status);
  }
  return { single, phrases, maxPhraseLen };
}

export function cleanWord(w: string) {
  return termKey(w.replace(/[“”"()[\]{}]/g, ''));
}

/** Tách câu thành token có thể bấm + đánh dấu trạng thái các từ/cụm từ đã có trong sổ. */
export function tokenizeSentence(s: Sentence, index: KeyIndex): Token[] {
  const tokens: Token[] = s.words.map((w, i) => ({
    // viết hoa chữ đầu câu khi hiển thị (phụ đề tự động thường viết thường)
    text: i === 0 ? w.w.charAt(0).toUpperCase() + w.w.slice(1) : w.w,
    key: cleanWord(w.w),
    s: w.s,
    e: w.e,
  }));
  // cụm từ (ưu tiên cụm dài)
  if (index.phrases.size) {
    for (let len = index.maxPhraseLen; len >= 2; len--) {
      for (let i = 0; i + len <= tokens.length; i++) {
        if (tokens.slice(i, i + len).some((t) => t.status)) continue;
        const phrase = tokens
          .slice(i, i + len)
          .map((t) => t.key)
          .join(' ');
        const variants = [phrase, ...lemmaCandidates(tokens[i].key).map((first) => [first, ...tokens.slice(i + 1, i + len).map((t) => t.key)].join(' '))];
        const hit = variants.map((v) => index.phrases.get(v)).find(Boolean);
        if (hit) for (let k = i; k < i + len; k++) tokens[k].status = hit;
      }
    }
  }
  for (const t of tokens) {
    if (t.status || !t.key) continue;
    for (const c of lemmaCandidates(t.key)) {
      const st = index.single.get(c);
      if (st) {
        t.status = st;
        break;
      }
    }
  }
  return tokens;
}

/** Tìm câu chứa thời điểm t (tìm nhị phân). */
export function findSentenceIndex(sentences: Sentence[], t: number): number {
  let lo = 0;
  let hi = sentences.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentences[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
