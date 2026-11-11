import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { DifficultyBadge as Badge, DifficultyLabel } from '../../lib/types';
import { cn } from '../../lib/utils';

/** Độ khó của các video đã được phân tích (video chưa phân tích không có nhãn). */
export function useDifficultyBadges(ids: string[]) {
  const key = [...new Set(ids)].slice(0, 100).sort();
  return useQuery({
    queryKey: ['difficulty-badges', key.join(',')],
    queryFn: () => api.difficultyBatch(key),
    enabled: key.length > 0,
    staleTime: 60_000,
  }).data;
}

export const DIFF_META: Record<DifficultyLabel, { label: string; className: string; desc: string }> = {
  easy: {
    label: 'Dễ',
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    desc: 'Bạn biết ≥98% số từ — xem thoải mái, hợp để luyện nghe nhanh và nói đuổi.',
  },
  fit: {
    label: 'Vừa sức',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    desc: 'Bạn biết 95–98% số từ — hiểu được ý chính và vẫn có từ mới để học. Mức lý tưởng.',
  },
  hard: {
    label: 'Khó',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    desc: 'Bạn biết dưới 95% số từ — nên học trước các từ mới hoặc chọn video dễ hơn.',
  },
};

export const coveragePct = (c: number) => `${(Math.floor(c * 1000) / 10).toFixed(c >= 0.995 ? 0 : 1).replace('.', ',')}%`;

/** Nhãn nhỏ "Biết 96,5% · Vừa sức" cho thẻ video (con số = % số từ trong video mà bạn đã biết). */
export function DifficultyPill({ data, className }: { data: Badge; className?: string }) {
  const m = DIFF_META[data.label];
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', m.className, className)}
      title={`${m.desc} (${data.newWords} từ mới)`}
    >
      Biết {coveragePct(data.coverage)} · {m.label}
    </span>
  );
}
