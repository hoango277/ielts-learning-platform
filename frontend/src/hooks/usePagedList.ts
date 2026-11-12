import type { InfiniteData } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

/** Phần tối thiểu của useInfiniteQuery mà phân trang cần */
interface CursorQuery<T> {
  data: InfiniteData<{ items: T[] }> | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: () => unknown;
}

/**
 * Chia danh sách tải theo con trỏ (YouTube trả từng lô kèm "lô kế tiếp") thành các trang đánh số.
 * Không nhảy thẳng tới trang N được → tải lần lượt từng lô cho tới khi đủ video của trang N,
 * cộng thêm 1 video để biết còn trang sau hay không.
 */
export function usePagedList<T extends { id: string }>(q: CursorQuery<T>, page: number, pageSize: number) {
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (q.data?.pages.flatMap((p) => p.items) ?? []).filter((v) => !seen.has(v.id) && Boolean(seen.add(v.id)));
  }, [q.data]);

  // Lô cuối rỗng mà vẫn còn con trỏ → coi như hết, tránh tải vòng vòng
  const lastBatchEmpty = (q.data?.pages.at(-1)?.items.length ?? 1) === 0;
  const more = q.hasNextPage && !lastBatchEmpty;
  const need = page * pageSize + 1;

  const { isFetchingNextPage, isError, fetchNextPage } = q;
  useEffect(() => {
    if (items.length < need && more && !isFetchingNextPage && !isError) fetchNextPage();
  }, [items.length, need, more, isFetchingNextPage, isError, fetchNextPage]);

  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const knownPages = Math.max(1, Math.ceil(items.length / pageSize));
  return {
    pageItems,
    /** Trang hiện tại chưa đủ video và vẫn đang tải thêm */
    filling: pageItems.length < pageSize && more && !q.isError,
    /** Số trang đã biết chắc có video */
    knownPages,
    /** Còn video ở sau các trang đã biết */
    hasMore: more,
    /** Đã tải hết mà trang yêu cầu vượt quá số trang có thật (vd. sửa tay ?p=99) */
    outOfRange: !more && !q.isFetchingNextPage && items.length > 0 && page > knownPages,
  };
}
