import nlp from 'compromise';

/**
 * Nhận diện thì của động từ trong câu tiếng Anh (thư viện compromise, chạy offline) và soát các lỗi thì hay gặp
 * của người Việt. Dùng cho: tô màu thì trong phụ đề video ("Kính thì"), chấm câu luyện phản xạ, soát bài viết / lời nói.
 */

/** 9 thì được dạy trong module "Thì". */
export const TENSE_FORMS = [
  'present-simple',
  'present-continuous',
  'past-simple',
  'past-continuous',
  'present-perfect',
  'present-perfect-continuous',
  'past-perfect',
  'future-will',
  'future-going-to',
] as const;
export type TenseForm = (typeof TENSE_FORMS)[number];

/** Dạng gặp trong video nhưng không có bài riêng (chỉ hiện nhãn khi tô màu). */
export const EXTRA_FORMS = ['past-perfect-continuous', 'future-continuous', 'future-perfect', 'modal'] as const;
export type VerbForm = TenseForm | (typeof EXTRA_FORMS)[number];

export const FORM_LABEL: Record<VerbForm, string> = {
  'present-simple': 'Hiện tại đơn',
  'present-continuous': 'Hiện tại tiếp diễn',
  'past-simple': 'Quá khứ đơn',
  'past-continuous': 'Quá khứ tiếp diễn',
  'present-perfect': 'Hiện tại hoàn thành',
  'present-perfect-continuous': 'Hiện tại hoàn thành tiếp diễn',
  'past-perfect': 'Quá khứ hoàn thành',
  'future-will': 'Tương lai (will)',
  'future-going-to': 'Tương lai (be going to)',
  'past-perfect-continuous': 'Quá khứ hoàn thành tiếp diễn',
  'future-continuous': 'Tương lai tiếp diễn',
  'future-perfect': 'Tương lai hoàn thành',
  modal: 'Động từ khuyết thiếu / would',
};

export function isTenseForm(v: string): v is TenseForm {
  return (TENSE_FORMS as readonly string[]).includes(v);
}

/** Dạng của compromise (grammar.form) → thì trong bài học. null = không phải thì (mệnh lệnh, nguyên mẫu…). */
const FORM_MAP: Record<string, VerbForm | null> = {
  'simple-present': 'present-simple',
  'auxiliary-present': 'present-simple',
  'passive-present': 'present-simple',
  'simple-past': 'past-simple',
  'auxiliary-past': 'past-simple',
  'passive-past': 'past-simple',
  'present-progressive': 'present-continuous',
  'past-progressive': 'past-continuous',
  'present-perfect': 'present-perfect',
  'present-perfect-progressive': 'present-perfect-continuous',
  'past-perfect': 'past-perfect',
  'past-perfect-progressive': 'past-perfect-continuous',
  'simple-future': 'future-will',
  'passive-future': 'future-will',
  'auxiliary-future': 'future-going-to',
  'future-progressive': 'future-continuous',
  'future-perfect': 'future-perfect',
  'future-perfect-progressive': 'future-perfect',
  'present-conditional': 'modal',
  'past-conditional': 'modal',
  'modal-infinitive': 'modal',
  'modal-past': 'modal',
  'modal-perfect-progressive': 'modal',
  imperative: null,
  infinitive: null,
  'gerund-phrase': null,
};

export interface VerbSpan {
  /** Cụm động từ như trong câu (câu hỏi đảo: "Did … finish") */
  text: string;
  /** Các đoạn ký tự [start, end) trong câu — câu hỏi đảo có 2 đoạn (trợ động từ + động từ chính) */
  parts: [number, number][];
  form: VerbForm;
  /** Động từ nguyên mẫu của động từ chính (vd. "lived" → "live", "been" → "be") */
  lemma: string;
  negative: boolean;
  /** Từ thật của động từ chính trong câu (để soát lỗi dạng động từ) */
  root: string;
  auxiliary: string;
}

interface CTerm {
  text: string;
  tags: string[];
  offset?: { start: number; length: number };
}

interface CVerb {
  text: string;
  offset?: { start: number; length: number };
  terms?: CTerm[];
  verb?: {
    root?: string;
    infinitive?: string;
    auxiliary?: string;
    negative?: boolean;
    grammar?: { form?: string; tense?: string };
  };
}

/** Cụm động từ của compromise đã cắt trạng từ hai đầu ("actually is" → "is", "working now" → "working"). */
interface Chunk {
  v: CVerb;
  start: number;
  end: number;
  text: string;
  /** từ động từ chính (cuối cụm) */
  main: CTerm | undefined;
}

const AUX_ONLY = /^(do|does|did|have|has|had|will|would|shall|is|are|am|was|were|can|could|should|may|might|must)(n't| not)?$/i;
/** Cụm compromise hay nhận nhầm là động từ trong lời nói (right now, well…) */
const NOT_VERBS = new Set(['right', 'right now', 'now', 'well', 'so', 'okay', 'ok', 'yeah', 'thank', 'thanks', 'please', 'like']);
/** Từ đứng đầu mệnh đề trước trợ động từ của câu hỏi đảo */
const CLAUSE_LEAD =
  /(^|[.!?;:,]\s*|\b(and|but|so|then|well|okay|ok|now|what|where|when|why|how|who|which|whose|whom|how much|how many|how long|how often)\s+|\b(what|which|whose|how many|how much)\s+[\p{L}'-]+\s+)$/iu;
/** Động từ nguyên mẫu không "to" sau let / make / help / hear… + tân ngữ: "let you know", "make me feel" */
const BARE_INF_BEFORE = /\b(let|lets|let's|make|makes|made|help|helps|helped|hear|heard|hearing|see|saw|seeing|watch|watched|watching|feel|felt)\s+(\S+\s+){0,2}$/i;
/** Mạo từ / tính từ sở hữu đứng trước một từ đuôi -ed → đó là tính từ ("a married couple"), không phải động từ */
const DETERMINER_BEFORE = /\b(a|an|the|my|your|his|her|our|their|its)\s+$/i;
/** Tiểu từ của cụm động từ (get up, work out) — giữ trong nguyên mẫu; các từ khác (last, early, abroad…) bỏ đi */
const PARTICLES = new Set(['up', 'out', 'off', 'on', 'in', 'over', 'down', 'away', 'back', 'about', 'around', 'through', 'along', 'into', 'onto', 'by']);
/** Từ chỉ thời gian compromise đôi khi gắn nhãn động từ ("did you do last weekend" → "do last") */
const TIME_LIKE = new Set(['last', 'first', 'next', 'early', 'later', 'now', 'today', 'tonight', 'yesterday', 'tomorrow', 'again', 'ago', 'already', 'yet', 'still']);

const KEEP_EDGE = (t: CTerm) =>
  !TIME_LIKE.has(t.text.toLowerCase()) && t.tags.some((g) => g === 'Verb' || g === 'Auxiliary' || g === 'Modal' || g === 'Copula' || g === 'Negative' || g === 'Particle');

function toChunk(v: CVerb, sentence: string): Chunk | null {
  const terms = (v.terms ?? []).filter((t) => t.offset);
  let a = 0;
  let b = terms.length - 1;
  while (a <= b && !KEEP_EDGE(terms[a])) a++;
  while (b >= a && !KEEP_EDGE(terms[b])) b--;
  if (a > b || !terms[a]?.offset || !terms[b]?.offset) {
    // Không có thông tin từng từ: dùng cả cụm
    const start = v.offset?.start ?? sentence.indexOf(v.text);
    const text = v.text.replace(/[.,!?;:"“”()]+$/g, '').trim();
    if (start < 0 || !text) return null;
    return { v, start, end: start + text.length, text, main: undefined };
  }
  let start = terms[a].offset!.start;
  let end = terms[b].offset!.start + terms[b].offset!.length;
  // Dạng rút gọn ("He's been", "I've made") làm vị trí lệch vào khoảng trắng → cắt khoảng trắng hai đầu
  while (start < end && /\s/.test(sentence[start])) start++;
  while (end > start && /\s/.test(sentence[end - 1])) end--;
  if (end <= start) return null;
  const verbTerms = terms.slice(a, b + 1).filter((t) => t.tags.includes('Verb') && !t.tags.includes('Particle') && !TIME_LIKE.has(t.text.toLowerCase()));
  return { v, start, end, text: sentence.slice(start, end), main: verbTerms[verbTerms.length - 1] ?? terms[b] };
}

const infCache = new Map<string, string>();
/** Nguyên mẫu của một động từ đã chia ("went" → "go", "been" → "be"). */
function infinitiveOf(word: string) {
  const w = word.toLowerCase();
  let inf = infCache.get(w);
  if (inf === undefined) {
    inf = ((nlp(`they ${w}`).verbs().json() as CVerb[])[0]?.verb?.infinitive ?? w).toLowerCase();
    if (infCache.size > 5000) infCache.clear();
    infCache.set(w, inf);
  }
  return inf;
}

/** Nguyên mẫu của cụm: lấy của compromise, nhưng nếu nó lệch khỏi động từ chính (vd. "do last" → "last") thì tính lại. */
function lemmaOf(c: Chunk) {
  const lemma = cleanLemma(c.v.verb?.infinitive, c.main?.text ?? c.text);
  const main = c.main?.text.toLowerCase();
  if (!main) return lemma;
  const head = lemma.split(' ')[0];
  if (head === main) return lemma;
  // Nguyên mẫu đúng nếu một trong các dạng chia của nó trùng động từ chính (live → living / lived / lives)
  const conj = conjugate(head);
  if ([conj.Infinitive, conj.PastTense, conj.PresentTense, conj.Gerund, conj.Participle].some((f) => f?.toLowerCase() === main)) return lemma;
  return infinitiveOf(main);
}

/** Ánh xạ một cụm động từ của compromise sang thì. */
function mapForm(v: CVerb): VerbForm | null {
  const g = v.verb?.grammar;
  const form = g?.form ?? '';
  if (form === 'want-infinitive') return g?.tense === 'PastTense' ? 'past-simple' : 'present-simple';
  if (form in FORM_MAP) return FORM_MAP[form];
  if (g?.tense === 'PastTense') return 'past-simple';
  if (g?.tense === 'PresentTense') return 'present-simple';
  if (g?.tense === 'FutureTense') return 'future-will';
  return null;
}

function verbsOf(text: string): CVerb[] {
  return nlp(text).verbs().json({ offset: true, terms: { offset: true } }) as CVerb[];
}

/** Nguyên mẫu gọn: bỏ trạng từ dính vào cụm ("do last" → "do"), giữ tiểu từ ("get up"). */
function cleanLemma(inf: string | undefined, fallback: string) {
  const words = (inf || fallback).toLowerCase().split(/\s+/).filter(Boolean);
  const out = words.slice(0, 1);
  for (const w of words.slice(1)) {
    if (!PARTICLES.has(w)) break;
    out.push(w);
  }
  return out.join(' ');
}

/** Thì của cụm "trợ động từ + động từ chính" (dùng khi gộp câu hỏi đảo). */
function formOfMerged(aux: string, main: string): { form: VerbForm | null; v?: CVerb } {
  const [v] = verbsOf(`it ${aux.toLowerCase()} ${main.toLowerCase()}`);
  return { form: v ? mapForm(v) : null, v };
}

/** Các cụm động từ (đã gắn thì) trong một câu. */
export function analyzeSentence(sentence: string): VerbSpan[] {
  const chunks = verbsOf(sentence)
    .map((v) => toChunk(v, sentence))
    .filter((c): c is Chunk => Boolean(c));
  const out: VerbSpan[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const { v } = c;
    const lower = c.text.toLowerCase();
    if (!lower || NOT_VERBS.has(lower)) continue;
    const before = sentence.slice(0, c.start);

    // Câu hỏi đảo: "Did you finish…?", "Have you ever been…?" → compromise tách trợ động từ khỏi động từ chính
    const next = chunks[i + 1];
    if (AUX_ONLY.test(c.text) && next) {
      const between = sentence.slice(c.end, next.start);
      const subjectLike = /^\s*[\p{L}'’-]+(\s+[\p{L}'’-]+){0,3}\s*$/u.test(between) && !/[,.;:!?]/.test(between);
      if (subjectLike && CLAUSE_LEAD.test(before)) {
        const mainWord = next.main?.text ?? next.text.split(/\s+/).pop() ?? next.text;
        let merged = formOfMerged(c.text, mainWord);
        const parts: [number, number][] = [
          [c.start, c.end],
          [next.start, next.end],
        ];
        let skip = 1;
        // "Are you going to study…?" → tương lai với be going to (gộp luôn động từ sau "to")
        const after = sentence.slice(next.end);
        const afterNext = chunks[i + 2];
        if (/^going$/i.test(mainWord) && /^\s+to\s+\S/i.test(after)) {
          merged = { form: 'future-going-to', v: afterNext?.v };
          if (afterNext && /^\s+to\s+$/i.test(sentence.slice(next.end, afterNext.start))) {
            parts[1] = [next.start, afterNext.end];
            skip = 2;
          }
        }
        if (merged.form) {
          const mainChunk = skip === 2 ? afterNext! : next;
          out.push({
            text: parts.map(([a, b]) => sentence.slice(a, b)).join(' … '),
            parts,
            form: merged.form,
            lemma: lemmaOf(mainChunk),
            negative: Boolean(v.verb?.negative || next.v.verb?.negative),
            root: (mainChunk.main?.text ?? mainChunk.text).toLowerCase(),
            auxiliary: c.text.toLowerCase(),
          });
          i += skip;
          continue;
        }
      }
    }

    const form = mapForm(v);
    if (!form) continue;
    const tags = c.main?.tags ?? [];
    const single = !/\s/.test(c.text);
    const noAux = !(v.verb?.auxiliary ?? '').trim();
    const lemma = lemmaOf(c);
    // Không phải động từ chia theo thì: mệnh lệnh ("Look at…"), nguyên mẫu sau "to"/let/make…, V-ing đứng một mình,
    // tính từ đuôi -ed sau mạo từ ("a married couple")
    if (tags.includes('Imperative')) continue;
    const clauseStart = /(^|[.!?;:,]\s*|\b(and|so|then|now|please|just|okay|ok|first|next|also)\s+)$/i.test(before);
    if (clauseStart && noAux && form === 'present-simple' && c.text.toLowerCase().split(/\s+/)[0] === lemma.split(' ')[0]) continue;
    // Sau "to" là nguyên mẫu (to go, to be called…) — không phải động từ chia thì
    if (/\bto\s+$/i.test(before)) continue;
    if (single && form === 'present-simple' && BARE_INF_BEFORE.test(before)) continue;
    if (noAux && tags.includes('Gerund') && (form === 'present-simple' || form === 'present-continuous')) continue;
    if (single && /ed$/i.test(c.text) && DETERMINER_BEFORE.test(before)) continue;
    out.push({
      text: c.text,
      parts: [[c.start, c.end]],
      form,
      lemma,
      negative: Boolean(v.verb?.negative),
      root: (c.main?.text ?? v.verb?.root ?? c.text).toLowerCase(),
      auxiliary: (v.verb?.auxiliary ?? '').toLowerCase(),
    });
  }
  return out;
}

// ---------- Soát lỗi thì ----------

export type IssueType = 'finished-time-perfect' | 'past-marker-present' | 'since-past' | 'agreement' | 'did-past' | 'missing-be' | 'have-past';

export interface TenseIssue {
  type: IssueType;
  /** Đoạn ký tự [start, end) bị soát trong câu */
  start: number;
  end: number;
  text: string;
  /** Câu hỏi gợi ý để người học tự sửa trước (không lộ đáp án) */
  hint: string;
  /** Giải thích + cách sửa (hiện sau khi người học bấm xem) */
  explain: string;
  /** Gợi ý viết lại cụm động từ (nếu đoán được) */
  fix?: string;
}

const NUM = '(?:\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|a few|few|several|many|some)';
const UNIT = '(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?|centuries)';
const DAYS = '(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const MONTHS = '(?:january|february|march|april|may|june|july|august|september|october|november|december)';
const PERIODS = `(?:night|week|weekend|month|year|summer|winter|spring|autumn|fall|semester|term|time|${DAYS}|${MONTHS})`;
/** Mốc thời gian đã kết thúc (không dùng với thì hoàn thành, không dùng với hiện tại) */
const FINISHED_TIME = new RegExp(
  `\\b(yesterday|the day before yesterday|last ${PERIODS}|${NUM} (?:\\w+ )?${UNIT} ago|ago|in (?:19|20)\\d\\d|when i was (?:a |an )?(?:child|kid|boy|girl|student|teenager|young|little|small)|the other day)\\b`,
  'gi',
);
/** "since" + mốc thời gian (không phải "since" nghĩa "vì") */
const SINCE_POINT = new RegExp(`\\bsince (?:(?:19|20)\\d\\d|last ${PERIODS}|${DAYS}|${MONTHS}|then|yesterday|childhood|(?:this|that) (?:morning|time)|i was (?:a |an )?(?:child|kid|boy|girl|student|teenager|young|little|small))\\b`, 'i');

const SUBJECT_BEFORE = /\b(i|you|we|they|he|she|it)\s+$/i;
const PRESENT_FORMS = new Set<VerbForm>(['present-simple', 'present-continuous', 'present-perfect', 'present-perfect-continuous']);
const PAST_FORMS = new Set<VerbForm>(['past-simple', 'past-continuous', 'past-perfect', 'past-perfect-continuous']);
const ING_NOT_VERB = new Set([
  'thing', 'something', 'nothing', 'anything', 'everything', 'king', 'morning', 'evening', 'ceiling', 'during', 'spring', 'string', 'wing', 'ring',
  'sibling', 'darling', 'pudding', 'building', 'feeling', 'meeting', 'wedding', 'ending', 'beginning', 'clothing', 'housing', 'shopping',
]);

interface Conj {
  Infinitive?: string;
  PastTense?: string;
  PresentTense?: string;
  Gerund?: string;
  Participle?: string;
}

const conjCache = new Map<string, Conj>();
/** Các dạng của động từ. Đặt sau "they will" để compromise hiểu chắc là động từ ("live" đứng một mình bị hiểu là tính từ). */
function conjugate(lemma: string): Conj {
  let c = conjCache.get(lemma);
  if (!c) {
    c = ((nlp(`they will ${lemma}`).verbs().conjugate() as Conj[])[0] ?? {}) as Conj;
    if (conjCache.size > 2000) conjCache.clear();
    conjCache.set(lemma, c);
  }
  return c;
}

const participleOf = (lemma: string) => {
  const c = conjugate(lemma);
  return c.Participle || c.PastTense || lemma;
};

/** Chủ ngữ là đại từ đứng ngay trước cụm động từ (nếu có). */
function subjectBefore(sentence: string, start: number) {
  return SUBJECT_BEFORE.exec(sentence.slice(Math.max(0, start - 12), start))?.[1]?.toLowerCase() ?? null;
}

const beFor = (subj: string | null) => (subj === 'i' ? 'am' : subj === 'he' || subj === 'she' || subj === 'it' ? 'is' : 'are');
const haveFor = (subj: string | null) => (subj === 'he' || subj === 'she' || subj === 'it' ? 'has' : 'have');

/** Lỗi thì hay gặp trong một câu. */
export function findIssues(sentence: string, spans = analyzeSentence(sentence)): TenseIssue[] {
  const issues: TenseIssue[] = [];
  const lower = sentence.toLowerCase();
  const span0 = (s: VerbSpan) => s.parts[0][0];
  const spanEnd = (s: VerbSpan) => s.parts[s.parts.length - 1][1];
  const push = (s: VerbSpan, issue: Omit<TenseIssue, 'start' | 'end' | 'text'>) => {
    if (issues.some((x) => x.start === span0(s))) return; // mỗi cụm động từ báo một lỗi
    issues.push({ ...issue, start: span0(s), end: spanEnd(s), text: s.text });
  };

  // Mốc thời gian đã kết thúc (bỏ qua mốc đứng sau "since": "since last year" là hợp lệ với hoàn thành)
  const finished = [...lower.matchAll(FINISHED_TIME)].filter((m) => !/\bsince\s+$/.test(lower.slice(Math.max(0, (m.index ?? 0) - 8), m.index)));
  const marker = finished[0]?.[0];

  for (const s of spans) {
    // 1) Hoàn thành + mốc đã kết thúc: "I have seen him yesterday"
    if (marker && (s.form === 'present-perfect' || s.form === 'present-perfect-continuous')) {
      const past = conjugate(s.lemma).PastTense;
      push(s, {
        type: 'finished-time-perfect',
        hint: `Câu có “${marker}” — một mốc đã kết thúc. Việc này còn nối tới bây giờ, hay đã xong hẳn ở quá khứ?`,
        explain: `Có mốc thời gian đã kết thúc (“${marker}”) thì dùng quá khứ đơn, không dùng hiện tại hoàn thành. Hiện tại hoàn thành chỉ dùng khi không nói rõ lúc nào, hoặc khoảng thời gian còn kéo dài tới bây giờ.`,
        fix: past ? past : undefined,
      });
      continue;
    }
  }

  // 2) Mốc quá khứ nhưng mọi động từ đều ở hiện tại: "I go to school yesterday"
  if (marker && spans.length && spans.every((s) => PRESENT_FORMS.has(s.form) && s.form !== 'present-perfect' && s.form !== 'present-perfect-continuous')) {
    for (const s of spans) {
      const c = conjugate(s.lemma);
      const fix = s.form === 'present-continuous' ? `${['he', 'she', 'it', 'i'].includes(subjectBefore(sentence, span0(s)) ?? '') ? 'was' : 'were'} ${c.Gerund ?? s.root}` : c.PastTense;
      push(s, {
        type: 'past-marker-present',
        hint: `Câu có “${marker}”. Việc này xảy ra lúc nào — bây giờ hay trong quá khứ? Động từ đã cho người nghe biết điều đó chưa?`,
        explain: `Tiếng Việt chỉ cần “hôm qua” là đủ, nhưng tiếng Anh phải đổi cả động từ: việc đã xong trong quá khứ → quá khứ đơn${fix ? ` (“${fix}”)` : ''}.`,
        fix: fix || undefined,
      });
    }
  }

  // 3) "since + mốc" nhưng động từ chính ở quá khứ đơn: "I lived here since 2019"
  if (SINCE_POINT.test(lower)) {
    const sinceAt = lower.search(/\bsince\b/);
    for (const s of spans) {
      if (s.form !== 'past-simple' || span0(s) > sinceAt) continue; // chỉ xét động từ chính đứng trước "since"
      const subj = subjectBefore(sentence, span0(s));
      const fix = s.lemma === 'be' ? `${haveFor(subj)} been` : `${haveFor(subj)} ${participleOf(s.lemma)}`;
      push(s, {
        type: 'since-past',
        hint: '“since” nghĩa là “từ … đến giờ”. Việc này đã kết thúc chưa, hay vẫn còn kéo dài tới bây giờ?',
        explain: `“since + mốc” đo một khoảng kéo dài tới bây giờ → dùng hiện tại hoàn thành (“${fix}”), không dùng quá khứ đơn.`,
        fix,
      });
    }
  }

  for (const s of spans) {
    const subj = subjectBefore(sentence, span0(s));
    const words = s.parts.map(([a, b]) => sentence.slice(a, b)).join(' ').toLowerCase().split(/\s+/);
    const first = words[0];

    // 4) Hoà hợp chủ ngữ – động từ ở hiện tại đơn: "He go", "She don't", "They goes"
    if (s.form === 'present-simple' && subj && s.parts.length === 1) {
      const third = subj === 'he' || subj === 'she' || subj === 'it';
      const c = conjugate(s.lemma);
      if (third) {
        if (first === "don't" || first === 'do') {
          push(s, {
            type: 'agreement',
            hint: `Chủ ngữ là “${subj}” (một người/vật). Trợ động từ “do” cần đổi thế nào?`,
            explain: `Với he / she / it dùng “does / doesn't”, không dùng “do / don't”.`,
            fix: first === "don't" ? "doesn't" : 'does',
          });
        } else if (first === 'have') {
          push(s, { type: 'agreement', hint: `Chủ ngữ là “${subj}”. “have” cần đổi thế nào?`, explain: 'He / she / it dùng “has”, không dùng “have”.', fix: 'has' });
        } else if (first === 'are' || first === 'am') {
          push(s, { type: 'agreement', hint: `Chủ ngữ là “${subj}”. Động từ “be” đúng là gì?`, explain: 'He / she / it đi với “is”.', fix: 'is' });
        } else if (words.length === 1 && c.PresentTense && first === s.lemma && c.PresentTense !== s.lemma && !/n't$/.test(first)) {
          push(s, {
            type: 'agreement',
            hint: `Chủ ngữ là “${subj}” (ngôi thứ ba số ít). Động từ ở hiện tại đơn có thiếu gì không?`,
            explain: `Hiện tại đơn với he / she / it: động từ thêm -s / -es (“${c.PresentTense}”). Khi nói, nhớ bật rõ âm cuối /s/ /z/ /ɪz/.`,
            fix: c.PresentTense,
          });
        }
      } else {
        if (first === "doesn't" || first === 'does') {
          push(s, { type: 'agreement', hint: `Chủ ngữ là “${subj}”. Trợ động từ đúng là gì?`, explain: `Với ${subj} dùng “do / don't”.`, fix: first === "doesn't" ? "don't" : 'do' });
        } else if (first === 'has') {
          push(s, { type: 'agreement', hint: `Chủ ngữ là “${subj}”. “has” có hợp không?`, explain: `${subj === 'i' ? 'I' : subj} đi với “have”.`, fix: 'have' });
        } else if (first === 'is' && subj !== 'i') {
          push(s, { type: 'agreement', hint: `Chủ ngữ là “${subj}”. Động từ “be” đúng là gì?`, explain: `${subj} đi với “are”.`, fix: 'are' });
        } else if (words.length === 1 && c.PresentTense && first === c.PresentTense && c.PresentTense !== s.lemma) {
          push(s, {
            type: 'agreement',
            hint: `Chủ ngữ là “${subj}”. Động từ có cần đuôi -s không?`,
            explain: `Chỉ he / she / it mới thêm -s. Với “${subj}” dùng nguyên mẫu “${s.lemma}”.`,
            fix: s.lemma,
          });
        }
      }
    }
    if ((s.form === 'past-simple' || s.form === 'past-continuous') && subj && /^(was|were)$/.test(first)) {
      const want = subj === 'i' || subj === 'he' || subj === 'she' || subj === 'it' ? 'was' : 'were';
      if (first !== want) push(s, { type: 'agreement', hint: `Chủ ngữ là “${subj}”. “${first}” có hợp không?`, explain: `${subj} đi với “${want}”.`, fix: want });
    }

    // 5) did / didn't + động từ quá khứ: "I didn't went"
    if (/\bdid(n't| not)?\b/.test(s.auxiliary) || /^did/.test(first)) {
      const c = conjugate(s.lemma);
      if (s.root && s.root !== s.lemma && (s.root === c.PastTense || s.root === c.Participle)) {
        push(s, {
          type: 'did-past',
          hint: '“did / didn’t” đã cho biết là quá khứ rồi. Động từ phía sau cần ở dạng nào?',
          explain: `Sau did / didn't / did … ? dùng động từ nguyên mẫu (“${s.lemma}”), không chia quá khứ lần nữa.`,
          fix: s.lemma,
        });
      }
    }

    // 7) have / has / had + động từ quá khứ (không phải V3): "I have went"
    if (/\b(have|has|had|'ve|'s|'d)\b/.test(s.auxiliary) && (s.form === 'present-perfect' || s.form === 'past-perfect')) {
      const c = conjugate(s.lemma);
      if (c.Participle && c.PastTense && c.Participle !== c.PastTense && s.root === c.PastTense) {
        push(s, {
          type: 'have-past',
          hint: `Sau have / has / had cần dạng V3 (quá khứ phân từ). “${s.root}” có phải V3 không?`,
          explain: `“${s.lemma}” có V2 là “${c.PastTense}” nhưng V3 là “${c.Participle}”: have / has / had + ${c.Participle}.`,
          fix: c.Participle,
        });
      }
    }
  }

  // 6) Thiếu am / is / are trước V-ing: "I going to school", "She working now"
  for (const m of lower.matchAll(/\b(i|you|we|they|he|she|it)\s+([a-z]+ing)\b/g)) {
    const word = m[2];
    if (ING_NOT_VERB.has(word)) continue;
    const at = (m.index ?? 0) + m[1].length + 1;
    if (issues.some((x) => x.start <= at && at < x.end)) continue;
    // Chỉ báo khi V-ing thật sự là động từ (compromise gắn nhãn Gerund) và không có trợ động từ nào đi kèm
    if (!nlp(`${m[1]} ${word}`).has('#Gerund')) continue;
    const subj = m[1];
    issues.push({
      type: 'missing-be',
      start: at,
      end: at + word.length,
      text: word,
      hint: `“${subj} ${word}”: trong tiếng Việt “tôi đang đi” không cần thêm gì, nhưng tiếng Anh thì thiếu một từ. Thiếu từ nào?`,
      explain: `Tiếp diễn = am / is / are (was / were) + V-ing. Viết “${subj} ${beFor(subj)} ${word}”.`,
      fix: `${beFor(subj)} ${word}`,
    });
  }
  return issues.sort((a, b) => a.start - b.start);
}

// ---------- Phân tích cả đoạn ----------

export interface AnalyzedSentence {
  text: string;
  /** vị trí câu trong đoạn */
  offset: number;
  verbs: { text: string; form: VerbForm; lemma: string; parts: [number, number][] }[];
  issues: TenseIssue[];
}

/** Tách đoạn thành câu (giữ vị trí) rồi gắn thì + soát lỗi từng câu. */
export function analyzeText(text: string): { sentences: AnalyzedSentence[]; counts: Partial<Record<VerbForm, number>>; issueCount: number } {
  const sentences: AnalyzedSentence[] = [];
  const counts: Partial<Record<VerbForm, number>> = {};
  const re = /[^.!?\n]+[.!?]*/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const s = raw.trim();
    if (!/[\p{L}]/u.test(s)) continue;
    const spans = analyzeSentence(s);
    for (const v of spans) counts[v.form] = (counts[v.form] ?? 0) + 1;
    sentences.push({
      text: s,
      offset: (m.index ?? 0) + lead,
      verbs: spans.map((v) => ({ text: v.text, form: v.form, lemma: v.lemma, parts: v.parts })),
      issues: findIssues(s, spans),
    });
  }
  return { sentences, counts, issueCount: sentences.reduce((n, s) => n + s.issues.length, 0) };
}

// ---------- Kính thì: gắn thì theo từ của phụ đề ----------

export interface WordTenseSpan {
  /** chỉ số từ đầu / cuối (tính cả) trong câu phụ đề */
  from: number;
  to: number;
  form: VerbForm;
  /** cùng một cụm động từ (câu hỏi đảo có 2 đoạn) */
  g: number;
}

/** Gắn thì cho các từ của một câu phụ đề (mảng từ đã tách sẵn). */
export function tenseSpansForWords(words: string[]): WordTenseSpan[] {
  const ranges: [number, number][] = [];
  let pos = 0;
  for (const w of words) {
    ranges.push([pos, pos + w.length]);
    pos += w.length + 1;
  }
  const sentence = words.join(' ');
  const out: WordTenseSpan[] = [];
  analyzeSentence(sentence).forEach((v, g) => {
    for (const [a, b] of v.parts) {
      const idx = ranges.map(([s, e], i) => (s < b && e > a ? i : -1)).filter((i) => i >= 0);
      if (idx.length) out.push({ from: idx[0], to: idx[idx.length - 1], form: v.form, g });
    }
  });
  return out;
}

// ---------- Chấm câu luyện phản xạ ----------

export interface ProductionTarget {
  /** động từ chính cần chia (nguyên mẫu) */
  verb: string;
  /** các thì chấp nhận */
  accept: TenseForm[];
}

export interface ProductionCheck {
  correct: boolean;
  /** thì của động từ chính người học dùng (null nếu không tìm thấy) */
  used: VerbForm | null;
  usedText: string | null;
  /** người học dùng động từ khác nhưng đúng thì */
  paraphrase: boolean;
  reason: 'ok' | 'wrong-form' | 'no-verb' | 'issue';
  verbs: { text: string; form: VerbForm; lemma: string }[];
  issues: TenseIssue[];
}

/** Chấm câu người học nói/gõ: động từ chính có ở đúng thì không (cho phép đổi từ khác nhưng phải đúng thì). */
export function checkProduction(target: ProductionTarget, text: string): ProductionCheck {
  const { sentences } = analyzeText(text.trim().replace(/\s+/g, ' '));
  const entries = sentences.flatMap((s) => s.verbs.map((v) => ({ v, s })));
  const issues = sentences.flatMap((s) => s.issues);
  const accept = new Set<VerbForm>(target.accept);
  const head = (lemma: string) => lemma.toLowerCase().split(/\s+/)[0];
  const want = head(target.verb);
  /** Lỗi thì nằm ngay trên cụm động từ này (vd. "He go" → thiếu -s) */
  const issueOn = (e: (typeof entries)[number]) => e.s.issues.find((i) => e.v.parts.some(([a, b]) => i.start < b && i.end > a));
  const base = { verbs: entries.map(({ v }) => ({ text: v.text, form: v.form, lemma: v.lemma })), issues };
  const key = entries.find((e) => head(e.v.lemma) === want) ?? null;
  if (key) {
    if (!accept.has(key.v.form)) return { ...base, correct: false, used: key.v.form, usedText: key.v.text, paraphrase: false, reason: 'wrong-form' };
    if (issueOn(key)) return { ...base, correct: false, used: key.v.form, usedText: key.v.text, paraphrase: false, reason: 'issue' };
    return { ...base, correct: true, used: key.v.form, usedText: key.v.text, paraphrase: false, reason: 'ok' };
  }
  const alt = entries.find((e) => accept.has(e.v.form));
  if (alt) {
    const bad = issueOn(alt);
    return { ...base, correct: !bad, used: alt.v.form, usedText: alt.v.text, paraphrase: true, reason: bad ? 'issue' : 'ok' };
  }
  const main = entries.find((e) => e.v.form !== 'modal') ?? entries[0] ?? null;
  return { ...base, correct: false, used: main?.v.form ?? null, usedText: main?.v.text ?? null, paraphrase: false, reason: main ? 'wrong-form' : 'no-verb' };
}
