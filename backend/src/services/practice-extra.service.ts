import { COLLOCATIONS } from '../data/collocations.ts';
import { UPGRADES } from '../data/upgrades.ts';
import { all, parseJson } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { inflectionRegex, shuffle, termKey, uniqBy } from '../lib/text.ts';
import { POS_NAME, senses, synsets, tagCount, wordFamily, type WnPos } from '../lib/wordnet.ts';
import { datamuse, freqTag, type DmWord } from './datamuse.service.ts';
import type { PracticeItem, Question } from './practice.service.ts';
import type { Example } from './words.service.ts';

/**
 * Bài tập về cách dùng từ (không cần AI): chọn collocation đúng, điền dạng từ, ghép từ đồng nghĩa,
 * nâng cấp từ cơ bản. Dữ liệu từ danh sách soạn tay + WordNet + sổ từ của người học.
 */

const POS_SHORT: Record<WnPos, string> = { v: 'v', n: 'n', a: 'adj', r: 'adv' };

// ---------- Collocation ----------

export function collocationQuestions(count: number): Question[] {
  const uid = currentUserId();
  const keys = new Set(all<{ term_key: string }>('SELECT term_key FROM words WHERE user_id = ?', uid).map((r) => r.term_key));
  // Ưu tiên collocation có từ đã nằm trong sổ của người học
  const related = COLLOCATIONS.map((c, i) => ({ c, i })).filter(({ c }) => keys.has(c.answer) || c.partner.split(' ').some((p) => keys.has(termKey(p))));
  const picked = uniqBy([...shuffle(related), ...shuffle(COLLOCATIONS.map((c, i) => ({ c, i })))], (x) => String(x.i)).slice(0, count);
  return picked.map(({ c, i }, idx) => {
    const filled = c.example.replace(/\{([^}]+)\}/, '$1');
    const item: PracticeItem = {
      key: `c:${i}`,
      wordId: null,
      lexiconId: null,
      term: `${c.answer} ${c.partner}`,
      meaning: c.vi,
      pos: null,
      ipa: null,
      audio: null,
      definition: '',
      examples: [{ en: filled }],
    };
    const also = c.also?.length ? ` Cũng nói: ${c.also.map((a) => `${a} ${c.partner}`).join(', ')}.` : '';
    return {
      id: `${item.key}:${idx}`,
      type: 'mcq_collocation' as const,
      item,
      prompt: `Từ nào đi với “${c.partner}” tự nhiên nhất?`,
      sentence: c.example.replace(/\{[^}]+\}/, '_____'),
      options: shuffle([c.answer, ...c.wrong]),
      answer: c.answer,
      explain: `${c.answer} ${c.partner} = ${c.vi}.${also}${c.note ? ` ${c.note}` : ''}`,
    };
  });
}

// ---------- Nâng cấp từ cơ bản ----------

export function upgradeQuestions(count: number): Question[] {
  const all = UPGRADES.flatMap((e) => e.sentences.map((s, si) => ({ e, s, si })));
  return shuffle(all)
    .slice(0, count)
    .map(({ e, s, si }, idx) => {
      const correct = shuffle(s.fits)[0];
      const exclude = new Set([...s.fits, ...e.upgrades.map((u) => u.word)]);
      const others = UPGRADES.filter((o) => o.group !== e.group);
      const samePos = shuffle(others.filter((o) => o.pos === e.pos).flatMap((o) => o.upgrades.map((u) => u.word)));
      const anyPos = shuffle(others.flatMap((o) => o.upgrades.map((u) => u.word)));
      const distractors = uniqBy([...samePos, ...anyPos], (w) => w)
        .filter((w) => !exclude.has(w))
        .slice(0, 3);
      const up = e.upgrades.find((u) => u.word === correct);
      const item: PracticeItem = {
        key: `u:${e.basic}:${si}`,
        wordId: null,
        lexiconId: null,
        term: correct,
        meaning: up?.vi ?? '',
        pos: null,
        ipa: null,
        audio: null,
        definition: up?.note ?? '',
        examples: [{ en: s.text.replace(/\[\[[^\]]+\]\]/, correct) }],
      };
      const fitsOther = s.fits.filter((f) => f !== correct);
      return {
        id: `${item.key}:${idx}`,
        type: 'mcq_upgrade' as const,
        item,
        prompt: `Thay “${e.basic}” bằng từ hay hơn mà vẫn giữ nghĩa`,
        sentence: s.text,
        options: shuffle([correct, ...distractors]),
        answer: correct,
        explain:
          e.upgrades.map((u) => `${u.word} (${u.vi}): ${u.note}`).join('\n') +
          (fitsOther.length ? `\nTrong câu này cũng dùng được: ${fitsOther.join(', ')}.` : ''),
      };
    });
}

// ---------- Điền dạng từ ----------

interface WordLike {
  id: number;
  term: string;
  meaning: string;
  examples: string;
}

function findMember(sentence: string, members: { word: string; pos: WnPos }[]) {
  for (const m of members) {
    const match = sentence.match(inflectionRegex(m.word));
    // Dạng chia phải bắt đầu bằng đúng từ (tránh "decide" khớp nhầm phần đầu của "decided" khi đang tìm "decided")
    if (match && match.index !== undefined) return { member: m, surface: match[0], index: match.index };
  }
  return null;
}

export function wordFormQuestions(count: number, items: PracticeItem[]): Question[] {
  const uid = currentUserId();
  // Nguồn: từ được chọn theo nguồn luyện tập + bù bằng từ trong sổ / bộ chủ đề
  const extra = all<WordLike>(
    "SELECT id, term, meaning, examples FROM words WHERE user_id = ? AND instr(term, ' ') = 0 ORDER BY random() LIMIT 60",
    uid,
  ).map((r) => ({ id: r.id, term: r.term, meaning: r.meaning, examples: parseJson<Example[]>(r.examples, []) }));
  const lex = all<{ word: string; meaning_vi: string; examples: string }>(
    "SELECT word, meaning_vi, examples FROM lexicon WHERE instr(word, ' ') = 0 ORDER BY random() LIMIT 80",
  ).map((r) => ({ id: null as number | null, term: r.word, meaning: r.meaning_vi, examples: parseJson<Example[]>(r.examples, []) }));
  const pool = uniqBy(
    [...items.filter((i) => !/\s/.test(i.term)).map((i) => ({ id: i.wordId, term: i.term, meaning: i.meaning, examples: i.examples })), ...extra, ...lex],
    (x) => x.term.toLowerCase(),
  );

  const questions: Question[] = [];
  for (const w of pool) {
    if (questions.length >= count) break;
    const family = wordFamily(w.term);
    if (family.length < 2) continue;
    const members = family.map((m) => ({ word: m.word, pos: m.pos }));
    // Câu ví dụ: của chính từ (video/từ điển) rồi đến ví dụ WordNet của các thành viên trong họ
    const sentences = [
      ...w.examples.map((e) => e.en),
      ...shuffle(members).flatMap((m) => synsets(m.word, m.pos).flatMap((s) => s.examples)),
    ].filter((s) => s.split(' ').length >= 5 && s.length <= 220);
    let built: Question | null = null;
    for (const sentence of shuffle(sentences)) {
      const hit = findMember(sentence, [...members].sort((a, b) => b.word.length - a.word.length));
      if (!hit) continue;
      // Từ gợi ý phải là thành viên KHÁC từ loại với đáp án
      const base = members.find((m) => m.pos !== hit.member.pos && m.word !== hit.member.word && (m.pos === 'v' || m.pos === 'n' || m.pos === 'a'));
      if (!base) continue;
      const blanked = sentence.slice(0, hit.index) + '_____' + sentence.slice(hit.index + hit.surface.length);
      const item: PracticeItem = {
        key: `f:${w.term}`,
        wordId: w.id,
        lexiconId: null,
        term: hit.member.word,
        meaning: w.meaning,
        pos: POS_NAME[hit.member.pos],
        ipa: null,
        audio: null,
        definition: '',
        examples: [{ en: sentence }],
      };
      built = {
        id: `${item.key}:${questions.length}`,
        type: 'wordform',
        item,
        prompt: base.word.toUpperCase(),
        sentence: blanked.charAt(0).toUpperCase() + blanked.slice(1),
        hint: `Dạng đúng của ${base.word.toUpperCase()} (cần ${POS_NAME[hit.member.pos]})`,
        answer: hit.surface,
        accept: [hit.surface],
        explain: `Họ từ: ${members.map((m) => `${m.word} (${POS_SHORT[m.pos]})`).join(' · ')}`,
      };
      break;
    }
    if (built) questions.push(built);
  }
  return questions;
}

// ---------- Ghép từ đồng nghĩa ----------

/**
 * Từ đồng nghĩa đáng tin cho bài ghép: phải nằm trong 2 nghĩa chính (WordNet) của từ loại phổ biến nhất,
 * ưu tiên từ Datamuse xếp hạng cao và đủ phổ biến. Không chắc chắn thì trả null (bỏ từ đó) — tránh cặp
 * sai kiểu "bank = swear" do khớp nghĩa hiếm.
 */
async function commonSynonym(word: string): Promise<string | null> {
  const main = (['n', 'v', 'a', 'r'] as WnPos[]).filter((p) => synsets(word, p).length).sort((a, b) => tagCount(word, b) - tagCount(word, a))[0];
  if (!main) return null;
  const membersOf = (i: number) =>
    new Set((synsets(word, main)[i]?.words ?? []).map((w) => w.toLowerCase()).filter((w) => w !== word && /^[a-z-]+$/.test(w)));
  const first = membersOf(0);
  const second = membersOf(1);
  if (!first.size && !second.size) return null;
  const list = await datamuse(`ml=${encodeURIComponent(word)}&md=f&max=30`).catch(() => [] as DmWord[]);
  const common = (w: DmWord) => (freqTag(w) ?? 0) >= 2;
  // Nghĩa thứ hai chỉ chấp nhận khi Datamuse cũng xếp từ đó trong top 3 (hai nguồn đồng ý)
  const hit = list.find((w) => first.has(w.word) && common(w)) ?? list.slice(0, 3).find((w) => second.has(w.word) && common(w));
  if (hit) return hit.word;
  return [...first].sort((a, b) => tagCount(b) - tagCount(a)).find((w) => tagCount(w) >= 3) ?? null;
}

export async function synonymItems(count: number, items: PracticeItem[]): Promise<PracticeItem[]> {
  const uid = currentUserId();
  const extra = all<{ id: number; term: string; meaning: string; synonyms: string }>(
    "SELECT id, term, meaning, synonyms FROM words WHERE user_id = ? AND instr(term, ' ') = 0 ORDER BY random() LIMIT 60",
    uid,
  );
  const lex = all<{ word: string; meaning_vi: string; synonyms: string }>(
    "SELECT word, meaning_vi, synonyms FROM lexicon WHERE instr(word, ' ') = 0 AND synonyms != '[]' ORDER BY random() LIMIT 80",
  );
  const candidates = uniqBy(
    [
      ...items.filter((i) => !/\s/.test(i.term)).map((i) => ({ id: i.wordId, term: i.term, meaning: i.meaning, stored: [] as string[] })),
      ...extra.map((r) => ({ id: r.id as number | null, term: r.term, meaning: r.meaning, stored: parseJson<string[]>(r.synonyms, []) })),
      ...lex.map((r) => ({ id: null as number | null, term: r.word, meaning: r.meaning_vi, stored: parseJson<string[]>(r.synonyms, []) })),
    ],
    (x) => x.term.toLowerCase(),
  );
  const out: PracticeItem[] = [];
  const used = new Set<string>();
  // Tra song song cho nhóm ứng viên đầu (Datamuse có cache), đủ dùng cho một ván ghép
  const head = candidates.slice(0, count * 3);
  const ranked = await Promise.all(head.map((c) => commonSynonym(c.term.toLowerCase())));
  const ok = (s: string, key: string) => /^[a-z-]+$/.test(s) && s !== key && !used.has(s) && !s.startsWith(key.slice(0, 4));
  for (const [i, c] of head.entries()) {
    if (out.length >= count) break;
    const key = c.term.toLowerCase();
    const syn = ranked[i] && ok(ranked[i], key) ? ranked[i] : null;
    if (!syn || used.has(key)) continue;
    used.add(key);
    used.add(syn);
    out.push({
      key: `s:${key}`,
      wordId: c.id,
      lexiconId: null,
      term: c.term,
      meaning: syn,
      pos: null,
      ipa: null,
      audio: null,
      definition: c.meaning,
      examples: [],
    });
  }
  return out;
}
