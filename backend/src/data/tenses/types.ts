import type { TenseForm } from '../../lib/tense.ts';

/**
 * Nội dung module "Thì" (soạn tay): 6 bài theo Ý NGHĨA (không theo công thức) + câu luyện.
 * Mỗi bài một file lesson-*.ts; index.ts gom lại; validate.ts kiểm tra nội dung bằng chính bộ nhận diện thì.
 */

export const LESSON_IDS = ['present-simple', 'continuous', 'past-simple', 'present-perfect', 'future', 'past-perfect'] as const;
export type LessonId = (typeof LESSON_IDS)[number];
export type Level = 'A2' | 'B1' | 'B2';

/**
 * Trục thời gian vẽ bằng SVG. Vị trí trên trục: 0 = quá khứ xa, 100 = tương lai xa; "bây giờ" mặc định ở 60.
 * - point: một việc xảy ra tại một thời điểm (dấu ×)
 * - span: một việc kéo dài (đoạn thẳng); open = đầu/cuối mờ dần (không rõ bắt đầu/kết thúc)
 * - repeat: lặp đi lặp lại (× × × ×) — thói quen
 * - progress: đang diễn ra (đường lượn sóng) — tiếp diễn
 * - link: mũi tên nối một việc trong quá khứ tới một mốc (thường là bây giờ) — hoàn thành
 * - ref: mốc tham chiếu (vạch đứt), vd. "lúc tôi đến"
 */
export type TimelineMark =
  | { type: 'point'; at: number; label?: string; tone?: 'main' | 'other' }
  | { type: 'span'; from: number; to: number; label?: string; tone?: 'main' | 'other'; open?: 'left' | 'right' | 'both' }
  | { type: 'repeat'; from: number; to: number; label?: string }
  | { type: 'progress'; from: number; to: number; label?: string; tone?: 'main' | 'other' }
  | { type: 'link'; from: number; to: number; label?: string }
  | { type: 'ref'; at: number; label: string };

export interface TimelineSpec {
  now?: number;
  marks: TimelineMark[];
  /** Một dòng chú thích ngắn dưới trục (tiếng Việt) */
  caption?: string;
}

export interface Example {
  en: string;
  vi: string;
}

/** Một cách dùng (ý nghĩa) của thì trong bài */
export interface LessonUse {
  title: string;
  /** Giải thích bằng ý nghĩa, 1–3 câu tiếng Việt dễ hiểu */
  explain: string;
  timeline: TimelineSpec;
  examples: Example[];
  /** Thì của cách dùng này (vd. bài "Tương lai" có will và be going to) */
  form: TenseForm;
}

/** Câu hỏi kiểm tra khái niệm (CCQ) trong bài: trả lời Có/Không */
export interface LessonCcq {
  sentence: string;
  question: string;
  answer: boolean;
  explain: string;
}

/** Cặp câu đối chiếu: hai câu gần giống nhau, khác thì → khác nghĩa */
export interface LessonContrast {
  a: Example & { form: TenseForm };
  b: Example & { form: TenseForm };
  /** Câu hỏi áp cho cả hai câu (tiếng Việt) */
  question: string;
  answerA: string;
  answerB: string;
  explain: string;
}

export interface Lesson {
  id: LessonId;
  order: number;
  title: string;
  emoji: string;
  /** Ý chính trong một câu (tiếng Việt) */
  idea: string;
  /** Mô tả ngắn cho thẻ bài học */
  summary: string;
  forms: TenseForm[];
  uses: LessonUse[];
  /** "Hình dạng" để tra cứu (không học thuộc): khẳng định / phủ định / câu hỏi */
  shapes: { form: TenseForm; affirmative: string; negative: string; question: string }[];
  ccq: LessonCcq[];
  contrasts: LessonContrast[];
  /** Đối chiếu với tiếng Việt: đã / đang / sẽ / rồi / từng / vừa… */
  vietnamese: { marker: string; english: string; note: string }[];
  /** Bẫy hay gặp của người Việt */
  traps: { wrong: string; right: string; why: string }[];
  /** Từ hay đi kèm — để nhận ra, nhưng không dựa vào chúng */
  signals: { words: string[]; note: string };
  /** Cụm làm sẵn để nói nhanh */
  chunks: Example[];
  /** Phát âm liên quan (đuôi -s, -ed, dạng rút gọn) */
  pronunciation?: { title: string; items: { text: string; note: string }[] };
}

interface BaseItem {
  id: string;
  lesson: LessonId;
  form: TenseForm;
  level: Level;
}

/** Nhận ra: câu này nói về khi nào / thế nào? (chọn 1 trong 3–4 mô tả ý nghĩa) */
export interface MeaningItem extends BaseItem {
  kind: 'meaning';
  sentence: string;
  question?: string;
  options: string[];
  answer: number;
  explain: string;
}

/** Nhận ra: câu hỏi kiểm tra khái niệm Có/Không */
export interface CcqItem extends BaseItem {
  kind: 'ccq';
  sentence: string;
  question: string;
  answer: boolean;
  explain: string;
}

/** Nghe: máy đọc một trong các câu (chỉ khác dạng động từ) → chọn câu nghe được */
export interface ListenItem extends BaseItem {
  kind: 'listen';
  options: { text: string; form: TenseForm; meaning: string }[];
  explain: string;
}

/** Phản xạ: nhìn gợi ý tiếng Việt → nói/gõ câu tiếng Anh, chấm động từ chính có đúng thì */
export interface ProduceItem extends BaseItem {
  kind: 'produce';
  /** 'translate' = câu tiếng Việt để nói lại; 'situation' = mô tả tình huống, tự nghĩ câu */
  cueType: 'translate' | 'situation';
  cue: string;
  /** Câu trả lời chấp nhận (câu đầu là câu mẫu) */
  answers: string[];
  /** Động từ chính cần chia (nguyên mẫu, vd. "live", "be") */
  verb: string;
  /** Thì chấp nhận cho động từ chính */
  accept: TenseForm[];
  /** Câu sai điển hình (để kiểm tra bộ chấm và cho bài "tìm lỗi") */
  wrong: string[];
  /** Câu hỏi gợi ý khi trả lời sai lần đầu (không lộ đáp án) */
  hint: string;
  /** Vì sao dùng thì này (theo ý nghĩa) */
  explain: string;
}

export type TenseItem = MeaningItem | CcqItem | ListenItem | ProduceItem;

/** Đề viết đoạn ngắn */
export interface WritingPrompt {
  id: string;
  lesson: LessonId | 'mixed';
  title: string;
  /** Yêu cầu bằng tiếng Việt */
  prompt: string;
  /** Câu hỏi gợi ý (tiếng Anh) */
  guide: string[];
  targets: TenseForm[];
  minSentences: number;
  /** Bài mẫu (tiếng Anh) */
  model: string;
  ielts?: 'speaking' | 'task1' | 'task2';
}

export interface LessonPack {
  lesson: Lesson;
  items: TenseItem[];
  prompts: WritingPrompt[];
}
