import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { WordStatus } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Màu pháo giấy theo bảng màu “Mực ngọc” (mặc định của thư viện là màu cầu vồng rất rực) */
export const CONFETTI_COLORS = ['#4bb3a5', '#227f77', '#f09455', '#e7c351', '#7ec68e', '#fffdf7'];

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400_000],
    ['month', 30 * 86400_000],
    ['week', 7 * 86400_000],
    ['day', 86400_000],
    ['hour', 3600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return diff >= 0 ? 'ngay bây giờ' : 'vừa xong';
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Khuya rồi, học nhẹ nhàng thôi nhé';
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export const STATUS_META: Record<WordStatus, { label: string; className: string; dot: string; desc: string }> = {
  new: {
    label: 'Mới',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    dot: 'bg-sky-500',
    desc: 'Chưa ôn lần nào',
  },
  learning: {
    label: 'Đang học',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    dot: 'bg-amber-500',
    desc: 'Đang trong các bước học ngắn hạn',
  },
  reviewing: {
    label: 'Đang ôn',
    className: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    dot: 'bg-brand-500',
    desc: 'Đã nhớ, đang ôn theo lịch giãn cách',
  },
  mastered: {
    label: 'Thành thạo',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    desc: 'Nhớ ổn định ≥ 21 ngày',
  },
  known: {
    label: 'Đã thuộc',
    className: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
    dot: 'bg-teal-500',
    desc: 'Bạn đánh dấu đã thuộc — không cần ôn',
  },
};

export const LEVEL_CLASS: Record<string, string> = {
  A1: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  A2: 'bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300',
  B1: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  B2: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  C1: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  C2: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

/** Band IELTS tương ứng (ước lượng) cho mỗi cấp CEFR. */
export const LEVEL_BAND: Record<string, string> = {
  A1: 'Band 2–3',
  A2: 'Band 3–4',
  B1: 'Band 4–5',
  B2: 'Band 5.5–6.5',
  C1: 'Band 7–8',
  C2: 'Band 8.5–9',
};

export const POS_VI: Record<string, string> = {
  noun: 'danh từ',
  verb: 'động từ',
  adjective: 'tính từ',
  adverb: 'trạng từ',
  phrase: 'cụm từ',
  preposition: 'giới từ',
  pronoun: 'đại từ',
  conjunction: 'liên từ',
  interjection: 'thán từ',
  exclamation: 'thán từ',
  abbreviation: 'viết tắt',
  numeral: 'số từ',
};

export const posLabel = (pos?: string | null) => (pos ? (POS_VI[pos] ?? pos) : '');

/** Lớp màu tĩnh theo tên màu (Tailwind cần class đầy đủ trong mã nguồn). */
export const COLOR_CLASSES: Record<string, { gradient: string; hero: string; soft: string; tint: string; text: string; bar: string; ring: string }> = {
  violet: { gradient: 'from-brand-400 to-brand-600', hero: 'from-brand-600 via-brand-700 to-brand-800', soft: 'bg-brand-50 dark:bg-brand-500/10', tint: 'from-brand-100 dark:from-brand-500/15', text: 'text-brand-600 dark:text-brand-300', bar: 'bg-brand-500', ring: 'ring-brand-500/25' },
  purple: { gradient: 'from-purple-400 to-purple-600', hero: 'from-purple-600 via-purple-700 to-purple-800', soft: 'bg-purple-50 dark:bg-purple-500/10', tint: 'from-purple-100 dark:from-purple-500/15', text: 'text-purple-600 dark:text-purple-300', bar: 'bg-purple-500', ring: 'ring-purple-500/25' },
  fuchsia: { gradient: 'from-fuchsia-400 to-fuchsia-600', hero: 'from-fuchsia-600 via-fuchsia-700 to-fuchsia-800', soft: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', tint: 'from-fuchsia-100 dark:from-fuchsia-500/15', text: 'text-fuchsia-600 dark:text-fuchsia-300', bar: 'bg-fuchsia-500', ring: 'ring-fuchsia-500/25' },
  pink: { gradient: 'from-pink-400 to-pink-600', hero: 'from-pink-600 via-pink-700 to-pink-800', soft: 'bg-pink-50 dark:bg-pink-500/10', tint: 'from-pink-100 dark:from-pink-500/15', text: 'text-pink-600 dark:text-pink-300', bar: 'bg-pink-500', ring: 'ring-pink-500/25' },
  rose: { gradient: 'from-rose-400 to-rose-600', hero: 'from-rose-600 via-rose-700 to-rose-800', soft: 'bg-rose-50 dark:bg-rose-500/10', tint: 'from-rose-100 dark:from-rose-500/15', text: 'text-rose-600 dark:text-rose-300', bar: 'bg-rose-500', ring: 'ring-rose-500/25' },
  orange: { gradient: 'from-orange-400 to-orange-600', hero: 'from-orange-600 via-orange-700 to-orange-800', soft: 'bg-orange-50 dark:bg-orange-500/10', tint: 'from-orange-100 dark:from-orange-500/15', text: 'text-orange-600 dark:text-orange-300', bar: 'bg-orange-500', ring: 'ring-orange-500/25' },
  amber: { gradient: 'from-amber-400 to-amber-600', hero: 'from-amber-600 via-amber-700 to-amber-800', soft: 'bg-amber-50 dark:bg-amber-500/10', tint: 'from-amber-100 dark:from-amber-500/15', text: 'text-amber-600 dark:text-amber-300', bar: 'bg-amber-500', ring: 'ring-amber-500/25' },
  yellow: { gradient: 'from-yellow-400 to-yellow-600', hero: 'from-yellow-600 via-yellow-700 to-yellow-800', soft: 'bg-yellow-50 dark:bg-yellow-500/10', tint: 'from-yellow-100 dark:from-yellow-500/15', text: 'text-yellow-700 dark:text-yellow-300', bar: 'bg-yellow-500', ring: 'ring-yellow-500/25' },
  lime: { gradient: 'from-lime-400 to-lime-600', hero: 'from-lime-600 via-lime-700 to-lime-800', soft: 'bg-lime-50 dark:bg-lime-500/10', tint: 'from-lime-100 dark:from-lime-500/15', text: 'text-lime-700 dark:text-lime-300', bar: 'bg-lime-500', ring: 'ring-lime-500/25' },
  green: { gradient: 'from-green-400 to-green-600', hero: 'from-green-600 via-green-700 to-green-800', soft: 'bg-green-50 dark:bg-green-500/10', tint: 'from-green-100 dark:from-green-500/15', text: 'text-green-600 dark:text-green-300', bar: 'bg-green-500', ring: 'ring-green-500/25' },
  emerald: { gradient: 'from-emerald-400 to-emerald-600', hero: 'from-emerald-600 via-emerald-700 to-emerald-800', soft: 'bg-emerald-50 dark:bg-emerald-500/10', tint: 'from-emerald-100 dark:from-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-300', bar: 'bg-emerald-500', ring: 'ring-emerald-500/25' },
  teal: { gradient: 'from-teal-400 to-teal-600', hero: 'from-teal-600 via-teal-700 to-teal-800', soft: 'bg-teal-50 dark:bg-teal-500/10', tint: 'from-teal-100 dark:from-teal-500/15', text: 'text-teal-600 dark:text-teal-300', bar: 'bg-teal-500', ring: 'ring-teal-500/25' },
  cyan: { gradient: 'from-cyan-400 to-cyan-600', hero: 'from-cyan-600 via-cyan-700 to-cyan-800', soft: 'bg-cyan-50 dark:bg-cyan-500/10', tint: 'from-cyan-100 dark:from-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-300', bar: 'bg-cyan-500', ring: 'ring-cyan-500/25' },
  sky: { gradient: 'from-sky-400 to-sky-600', hero: 'from-sky-600 via-sky-700 to-sky-800', soft: 'bg-sky-50 dark:bg-sky-500/10', tint: 'from-sky-100 dark:from-sky-500/15', text: 'text-sky-600 dark:text-sky-300', bar: 'bg-sky-500', ring: 'ring-sky-500/25' },
  blue: { gradient: 'from-blue-400 to-blue-600', hero: 'from-blue-600 via-blue-700 to-blue-800', soft: 'bg-blue-50 dark:bg-blue-500/10', tint: 'from-blue-100 dark:from-blue-500/15', text: 'text-blue-600 dark:text-blue-300', bar: 'bg-blue-500', ring: 'ring-blue-500/25' },
  indigo: { gradient: 'from-indigo-400 to-indigo-600', hero: 'from-indigo-600 via-indigo-700 to-indigo-800', soft: 'bg-indigo-50 dark:bg-indigo-500/10', tint: 'from-indigo-100 dark:from-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-300', bar: 'bg-indigo-500', ring: 'ring-indigo-500/25' },
  slate: { gradient: 'from-slate-400 to-slate-600', hero: 'from-slate-600 via-slate-700 to-slate-800', soft: 'bg-slate-100 dark:bg-slate-500/10', tint: 'from-slate-100 dark:from-slate-500/15', text: 'text-slate-600 dark:text-slate-300', bar: 'bg-slate-500', ring: 'ring-slate-500/25' },
};

export const colorOf = (name: string) => COLOR_CLASSES[name] ?? COLOR_CLASSES.violet;

/** Lấy ID video từ link YouTube (watch, youtu.be, shorts, embed, live) hoặc ID trần. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s.startsWith('http') ? s : `https://${s}`);
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$|youtube-nocookie\.com$/.test(url.hostname)) return null;
    if (url.hostname.endsWith('youtu.be')) return url.pathname.slice(1, 12) || null;
    const v = url.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = url.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function parseStartTime(input: string): number {
  try {
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    const t = url.searchParams.get('t') ?? url.searchParams.get('start');
    if (!t) return 0;
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/);
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Khoá so khớp từ: chữ thường, bỏ dấu câu hai đầu (giống backend termKey). */
export function termKey(term: string) {
  return term
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

/** Các dạng gốc có thể có (studies → study, using → use) để nhận ra từ đã lưu. */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase();
  const out = new Set<string>([w]);
  if (w.endsWith('ies')) out.add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) out.add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) out.add(w.slice(0, -1));
  if (w.endsWith('ied')) out.add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) {
    out.add(w.slice(0, -2));
    out.add(w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) out.add(w.slice(0, -3));
  }
  if (w.endsWith('ing')) {
    out.add(w.slice(0, -3));
    out.add(w.slice(0, -3) + 'e');
    if (/(.)\1ing$/.test(w)) out.add(w.slice(0, -4));
  }
  if (w.endsWith("'s")) out.add(w.slice(0, -2));
  return [...out];
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ngày theo giờ địa phương dạng YYYY-MM-DD (khoá lưu tạm theo ngày). */
export function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
