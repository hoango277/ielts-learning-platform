import type { TenseForm, TenseLessonId, VerbForm } from '../../lib/types';

/**
 * Thông tin hiển thị của từng thì: tên, màu (biến màu Tailwind, khớp CSS [data-tense] trong index.css),
 * bài học tương ứng và một câu "vì sao dùng thì này" (theo ý nghĩa, không theo công thức).
 */
export const FORM_META: Record<VerbForm, { label: string; color: string; lesson: TenseLessonId | null; why: string }> = {
  'present-simple': { label: 'Hiện tại đơn', color: 'sky', lesson: 'present-simple', why: 'Chuyện “thường như vậy”: sự thật, thói quen, lịch cố định, trạng thái.' },
  'present-continuous': {
    label: 'Hiện tại tiếp diễn',
    color: 'emerald',
    lesson: 'continuous',
    why: 'Đang ở giữa việc: diễn ra quanh lúc nói, tạm thời, đang thay đổi — hoặc việc đã hẹn sắp tới.',
  },
  'past-simple': { label: 'Quá khứ đơn', color: 'amber', lesson: 'past-simple', why: 'Đã xong ở một lúc trong quá khứ, tách khỏi bây giờ (hoặc nghĩa “xa”: giả định, lịch sự).' },
  'past-continuous': { label: 'Quá khứ tiếp diễn', color: 'orange', lesson: 'continuous', why: 'Đang diễn ra tại một lúc trong quá khứ — thường làm “nền” cho việc khác xen vào.' },
  'present-perfect': { label: 'Hiện tại hoàn thành', color: 'violet', lesson: 'present-perfect', why: 'Nhìn lại từ bây giờ: kinh nghiệm, kết quả còn đó, hoặc khoảng thời gian kéo dài tới giờ.' },
  'present-perfect-continuous': {
    label: 'Hiện tại hoàn thành tiếp diễn',
    color: 'fuchsia',
    lesson: 'present-perfect',
    why: 'Một hoạt động kéo dài tới bây giờ (hoặc vừa dừng), nhấn vào quá trình.',
  },
  'past-perfect': { label: 'Quá khứ hoàn thành', color: 'rose', lesson: 'past-perfect', why: 'Xảy ra trước một mốc khác trong quá khứ — “quá khứ của quá khứ”.' },
  'future-will': { label: 'Tương lai (will)', color: 'teal', lesson: 'future', why: 'Quyết định ngay lúc nói, lời hứa / đề nghị, dự đoán theo ý kiến.' },
  'future-going-to': { label: 'Tương lai (be going to)', color: 'cyan', lesson: 'future', why: 'Kế hoạch đã định từ trước, hoặc dự đoán có dấu hiệu ngay bây giờ.' },
  'past-perfect-continuous': { label: 'Quá khứ hoàn thành tiếp diễn', color: 'pink', lesson: 'past-perfect', why: 'Một hoạt động đã kéo dài tới một mốc trong quá khứ.' },
  'future-continuous': { label: 'Tương lai tiếp diễn', color: 'lime', lesson: 'continuous', why: 'Sẽ đang diễn ra tại một lúc trong tương lai.' },
  'future-perfect': { label: 'Tương lai hoàn thành', color: 'indigo', lesson: 'future', why: 'Sẽ xong trước một mốc trong tương lai.' },
  modal: { label: 'Khuyết thiếu / would', color: 'slate', lesson: null, why: 'can, could, should, must, would… nói về khả năng, lời khuyên, giả định — không phải một thì.' },
};

/** Thứ tự hiển thị chú thích màu */
export const FORM_ORDER: VerbForm[] = [
  'present-simple',
  'present-continuous',
  'past-simple',
  'past-continuous',
  'present-perfect',
  'present-perfect-continuous',
  'past-perfect',
  'future-will',
  'future-going-to',
  'past-perfect-continuous',
  'future-continuous',
  'future-perfect',
  'modal',
];

export const tenseColor = (form: VerbForm) => `var(--color-${FORM_META[form]?.color ?? 'slate'}-500)`;
export const formLabel = (form: VerbForm | string | null | undefined) => (form && form in FORM_META ? FORM_META[form as VerbForm].label : (form ?? ''));

/** Định dạng thời gian phản hồi: 2,4 s */
export const seconds = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} s`);

export const LESSON_PATH = (id: TenseLessonId) => `/tenses/${id}`;

export const isTenseForm = (f: string): f is TenseForm => f in FORM_META && f !== 'modal' && !['past-perfect-continuous', 'future-continuous', 'future-perfect'].includes(f);
