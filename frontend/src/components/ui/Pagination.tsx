import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

/** Các số trang cần hiện: trang đầu, cuối, trang hiện tại ± 1; khoảng trống giữa chúng thành "…" */
function pageList(page: number, last: number): (number | 'gap')[] {
  const want = [...new Set([1, page - 1, page, page + 1, last])].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  want.forEach((p, i) => {
    if (i > 0 && p - want[i - 1] > 1) out.push(p - want[i - 1] === 2 ? p - 1 : 'gap');
    out.push(p);
  });
  return out;
}

/**
 * Thanh phân trang: ‹ Trước · 1 … 4 5 6 … 9 · Sau ›
 * `knownPages` = số trang đã có; `hasMore` = phía sau còn nữa (danh sách tải dần theo con trỏ, chưa biết tổng).
 */
export function Pagination({
  page,
  knownPages,
  hasMore,
  onChange,
  className,
}: {
  page: number;
  knownPages: number;
  hasMore: boolean;
  onChange: (page: number) => void;
  className?: string;
}) {
  const last = Math.max(knownPages, page);
  if (last <= 1 && !hasMore) return null;
  const canNext = page < knownPages || hasMore;
  return (
    <nav aria-label="Phân trang" className={cn('flex items-center justify-center gap-2', className)}>
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)} icon={<ChevronLeft className="h-4 w-4" />} aria-label="Trang trước">
        <span className="hidden sm:inline">Trước</span>
      </Button>

      {/* Điện thoại: chỉ ghi số trang cho gọn */}
      <span className="px-2 font-display text-sm font-extrabold text-ink sm:hidden" aria-live="polite">
        Trang {page}
        {!hasMore && <span className="font-semibold text-muted"> / {last}</span>}
      </span>

      <ol className="hidden items-center gap-1 sm:flex">
        {pageList(page, last).map((p, i) =>
          p === 'gap' ? (
            <li key={`g${i}`} aria-hidden className="w-6 text-center text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Trang ${p}`}
                className={cn(
                  'h-10 min-w-10 rounded-xl px-2 font-display text-sm font-extrabold transition',
                  p === page ? 'bg-ink text-bg' : 'text-ink hover:bg-surface-2',
                )}
              >
                {p}
              </button>
            </li>
          ),
        )}
        {hasMore && (
          <li aria-hidden className="w-6 text-center text-muted">
            …
          </li>
        )}
      </ol>

      <Button variant="outline" disabled={!canNext} onClick={() => onChange(page + 1)} aria-label="Trang sau">
        <span className="hidden sm:inline">Sau</span>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
