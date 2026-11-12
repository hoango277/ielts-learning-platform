import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Emoji3D } from '../ui/Emoji3D';
import { Skeleton } from '../ui/primitives';

/**
 * Chọn một bộ chủ đề IELTS để luyện (thẻ có ảnh 3D thay cho ô dropdown).
 * layout="row": một hàng cuộn ngang (trang Luyện tập); "wrap": xuống dòng (màn "chưa đủ từ").
 */
export function TopicPicker({ value, onPick, layout = 'row', className }: { value?: number | ''; onPick: (id: number) => void; layout?: 'row' | 'wrap'; className?: string }) {
  const topics = useQuery({ queryKey: ['topics'], queryFn: api.topics, staleTime: 5 * 60_000 });
  if (!topics.data) return <Skeleton className={cn('h-14', className)} />;
  return (
    <div
      role="radiogroup"
      aria-label="Chọn bộ chủ đề"
      className={cn(layout === 'row' ? 'scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-2' : 'flex flex-wrap justify-center gap-2', className)}
    >
      {/* Luyện trắc nghiệm cần ít nhất 4 từ → ẩn bộ còn quá ít từ */}
      {topics.data.filter((t) => t.wordCount >= 4).map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
            }}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-2xl border-2 py-1.5 pl-1.5 pr-3 text-left transition-colors',
              active ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-line bg-surface hover:border-brand-300',
            )}
          >
            <Emoji3D emoji={t.icon} size={32} />
            <span>
              <span className="block whitespace-nowrap text-sm font-bold text-ink">{t.nameVi || t.name}</span>
              <span className="block whitespace-nowrap text-[11px] text-muted">
                {t.mine ? 'Bộ của tôi' : t.nameVi ? t.name : 'Bộ bổ sung'} · {t.wordCount} từ
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
