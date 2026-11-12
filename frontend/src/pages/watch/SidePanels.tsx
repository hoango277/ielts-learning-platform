import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPen, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button, LinkButton } from '../../components/ui/Button';
import { EmptyState, Skeleton, Textarea } from '../../components/ui/primitives';
import { VideoCard } from '../../components/video/VideoCard';
import { AudioButton, StatusBadge } from '../../components/word/bits';
import { useInView } from '../../hooks/misc';
import { api } from '../../lib/api';
import type { VideoDetails } from '../../lib/types';
import { formatTime } from '../../lib/utils';

export function SavedWordsPanel({ videoId, onSeek }: { videoId: string; onSeek: (t: number) => void }) {
  const { data, isPending } = useQuery({ queryKey: ['words', { videoId }], queryFn: () => api.words({ videoId, limit: 200, sort: 'oldest' }) });
  if (isPending) return <div className="space-y-2 p-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  if (!data?.items.length)
    return (
      <EmptyState
        icon="📝"
        title="Chưa lưu từ nào"
        description="Bấm vào từ bất kỳ trong phụ đề rồi chọn “Lưu vào sổ từ”. Câu chứa từ sẽ được lưu kèm làm ví dụ."
      />
    );
  return (
    <div className="flex h-full flex-col">
      <div className="scrollbar-thin flex-1 space-y-1.5 overflow-y-auto p-2">
        {data.items.map((w) => (
          <div key={w.id} className="flex items-start gap-2 rounded-xl p-2.5 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-ink">{w.term}</span>
                <AudioButton term={w.term} audio={w.audio} size="sm" />
                <StatusBadge status={w.status} />
              </div>
              <p className="text-sm text-muted">{w.meaning}</p>
            </div>
            {w.videoTime != null && (
              <button
                type="button"
                onClick={() => onSeek(w.videoTime!)}
                className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-semibold text-muted hover:text-brand-600"
                aria-label={`Tới ${formatTime(w.videoTime)}`}
              >
                {formatTime(w.videoTime)}
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <LinkButton to={`/practice/play?mode=mixed&source=video&videoId=${videoId}&count=${Math.min(20, Math.max(4, data.items.length))}`} variant="primary" className="w-full" icon={<Target className="h-4 w-4" />} disabled={data.items.length < 2}>
            Luyện tập {data.items.length} từ của video này
          </LinkButton>
      </div>
    </div>
  );
}

export function NotesPanel({ videoId, getTime, onSeek }: { videoId: string; getTime: () => number; onSeek: (t: number) => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const { data = [] } = useQuery({ queryKey: ['notes', videoId], queryFn: () => api.notes(videoId) });
  const add = useMutation({
    mutationFn: () => api.addNote(videoId, { content: text.trim(), time: getTime() }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['notes', videoId] });
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteNote(videoId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', videoId] }),
  });
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-line p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ghi chú cấu trúc hay, cách phát âm, ý tưởng cho IELTS Speaking…"
          aria-label="Nội dung ghi chú"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) add.mutate();
          }}
        />
        <Button variant="soft" size="sm" className="w-full" disabled={!text.trim()} loading={add.isPending} onClick={() => add.mutate()} icon={<NotebookPen className="h-4 w-4" />}>
          Thêm ghi chú tại {formatTime(getTime())}
        </Button>
      </div>
      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
        {!data.length && <p className="py-8 text-center text-sm text-muted">Chưa có ghi chú. Ghi chú gắn với mốc thời gian để xem lại nhanh.</p>}
        {data.map((n) => (
          <div key={n.id} className="group rounded-xl border border-line p-3">
            <div className="mb-1 flex items-center justify-between">
              {n.time != null ? (
                <button type="button" onClick={() => onSeek(n.time!)} className="font-mono text-xs font-semibold text-brand-600 hover:underline">
                  {formatTime(n.time)}
                </button>
              ) : (
                <span />
              )}
              <button type="button" onClick={() => del.mutate(n.id)} className="text-muted opacity-0 transition group-hover:opacity-100 hover:text-rose-500" aria-label="Xoá ghi chú">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{n.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UpNextPanel({ details }: { details: VideoDetails | undefined }) {
  const q = useInfiniteQuery({
    queryKey: ['related', details?.id],
    enabled: Boolean(details),
    queryFn: async ({ pageParam }) => (pageParam ? api.related(pageParam) : { items: details!.related, cursor: details!.relatedCursor }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
    staleTime: 10 * 60_000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const sentinel = useInView<HTMLDivElement>(() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage(), q.hasNextPage, '200px');
  if (!details) return <div className="space-y-2 p-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  return (
    <div className="scrollbar-thin h-full space-y-1 overflow-y-auto p-2">
      {items.map((v) => (
        <VideoCard key={v.id} video={v} compact />
      ))}
      <div ref={sentinel} className="h-2" />
      {q.isFetchingNextPage && <Skeleton className="h-20" />}
    </div>
  );
}
