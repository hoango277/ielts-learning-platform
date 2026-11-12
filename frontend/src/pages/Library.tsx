import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookMarked, Clock, Mic, PenLine, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState, ErrorBox, Progress, Segmented, Skeleton } from '../components/ui/primitives';
import { DifficultyPill, useDifficultyBadges } from '../components/video/DifficultyBadge';
import { api } from '../lib/api';
import type { DifficultyBadge, VideoState } from '../lib/types';
import { formatTime, relativeTime } from '../lib/utils';

function LibraryItem({ v, tab, difficulty }: { v: VideoState; tab: 'history' | 'saved'; difficulty?: DifficultyBadge }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: async (): Promise<unknown> => (tab === 'saved' ? api.setSaved(v.id, { saved: false }) : api.removeHistory(v.id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['videos'] }),
  });
  return (
    <article className="card group flex flex-col gap-4 p-3 sm:flex-row">
      <Link to={`/watch/${v.id}${v.lastPosition > 5 ? `?t=${Math.floor(v.lastPosition)}` : ''}`} className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-surface-3 sm:w-64">
        <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        {v.durationSec > 0 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 text-xs font-semibold text-white">{formatTime(v.durationSec)}</span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
          <div className="h-full bg-rose-500" style={{ width: `${v.progress * 100}%` }} />
        </div>
        {difficulty && <DifficultyPill data={difficulty} className="absolute left-2 top-2 shadow" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link to={`/watch/${v.id}`} className="line-clamp-2 font-bold text-ink hover:text-brand-600">
          {v.title || v.id}
        </Link>
        <p className="mt-0.5 text-sm text-muted">{v.channel.name}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {Math.round(v.watchSeconds / 60)} phút đã xem
          </span>
          <span className="inline-flex items-center gap-1">
            <BookMarked className="h-3.5 w-3.5 text-sky-500" /> {v.wordCount} từ đã lưu
          </span>
          <span className="inline-flex items-center gap-1">
            <Mic className="h-3.5 w-3.5 text-fuchsia-500" /> {v.shadowCount} câu shadowing
          </span>
          <span className="inline-flex items-center gap-1">
            <PenLine className="h-3.5 w-3.5 text-amber-500" /> {v.dictationCount} câu chính tả
          </span>
        </div>
        <div className="mt-auto flex items-center gap-3 pt-3">
          <Progress value={v.progress} className="h-1.5 max-w-xs" barClassName="bg-rose-500" />
          <span className="text-xs text-muted">{Math.round(v.progress * 100)}%</span>
          <span className="ml-auto text-xs text-muted">{relativeTime(v.lastWatchedAt)}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => remove.mutate()}
            aria-label={tab === 'saved' ? 'Bỏ lưu video' : 'Xoá khỏi lịch sử'}
            title={tab === 'saved' ? 'Bỏ lưu' : 'Xoá khỏi lịch sử'}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function Library() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'saved' ? 'saved' : 'history';
  const q = useQuery({ queryKey: ['videos', tab], queryFn: () => api.videos(tab) });
  const badges = useDifficultyBadges((q.data ?? []).map((v) => v.id));
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Thư viện của tôi</h1>
          <p className="text-sm text-muted">Video đã học, tiến độ và số từ đã lưu từ mỗi video.</p>
        </div>
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'saved' ? { tab: 'saved' } : {})}
          options={[
            { value: 'history', label: <><Clock className="h-4 w-4" /> Đã xem</> },
            { value: 'saved', label: <><Bookmark className="h-4 w-4" /> Đã lưu</> },
          ]}
        />
      </div>
      {q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : q.data.length === 0 ? (
        <EmptyState
          icon={tab === 'saved' ? '🔖' : '🎬'}
          title={tab === 'saved' ? 'Chưa lưu video nào' : 'Chưa xem video nào'}
          description="Vào Khám phá để chọn video yêu thích và bắt đầu shadowing."
          action={
            <LinkButton to="/explore" variant="primary">Khám phá video</LinkButton>
          }
        />
      ) : (
        <div className="space-y-3">
          {q.data.map((v) => (
            <LibraryItem key={v.id} v={v} tab={tab} difficulty={badges?.[v.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
