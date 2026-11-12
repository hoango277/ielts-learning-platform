import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui/primitives';
import { ChannelAvatar, VideoCard, VideoCardSkeleton, VideoGrid } from '../components/video/VideoCard';
import { usePagedList } from '../hooks/usePagedList';
import { api } from '../lib/api';

const PAGE_SIZE = 24;

export default function Channel() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(params.get('p'))) || 1);
  const q = useInfiniteQuery({
    queryKey: ['channel', id],
    queryFn: ({ pageParam }) => api.channelVideos(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
    staleTime: 10 * 60_000,
  });
  const channel = q.data?.pages.find((p) => p.channel)?.channel;
  const paged = usePagedList(q, page, PAGE_SIZE);
  const listTop = useRef<HTMLDivElement>(null);
  const goPage = (p: number, replace = false) => {
    setParams(p > 1 ? { p: String(p) } : {}, { replace });
    if (!replace) listTop.current?.scrollIntoView({ block: 'start' });
  };
  // Sửa tay ?p=99 mà kênh chỉ có 5 trang → về trang cuối
  useEffect(() => {
    if (paged.outOfRange) goPage(paged.knownPages, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.outOfRange, paged.knownPages]);

  return (
    <div className="space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Khám phá
      </Link>
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        {channel?.banner ? (
          <img src={channel.banner} alt="" className="h-28 w-full object-cover sm:h-40" />
        ) : (
          <div className="h-24 bg-hero sm:h-32" />
        )}
        <div className="flex items-center gap-4 p-5">
          {channel ? <ChannelAvatar name={channel.name} src={channel.avatar} size={72} /> : <Skeleton className="h-[72px] w-[72px] rounded-full" />}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold text-ink">{channel?.name ?? '…'}</h1>
            <p className="text-sm text-muted">{[channel?.handle, channel?.subscribers, channel?.videoCount].filter(Boolean).join(' • ')}</p>
            {channel?.description && <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-muted">{channel.description}</p>}
          </div>
        </div>
      </section>

      <div ref={listTop} aria-hidden className="scroll-mt-20" />
      {q.error && !paged.pageItems.length ? (
        <ErrorBox error={q.error} onRetry={() => (q.data ? q.fetchNextPage() : q.refetch())} />
      ) : q.isPending ? (
        <VideoGrid>
          {Array.from({ length: 8 }, (_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </VideoGrid>
      ) : !paged.pageItems.length && !paged.filling ? (
        <EmptyState icon="📺" title="Kênh chưa có video" />
      ) : (
        <>
          <VideoGrid>
            {paged.pageItems.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
            {paged.filling &&
              Array.from({ length: Math.min(8, PAGE_SIZE - paged.pageItems.length) }, (_, i) => <VideoCardSkeleton key={`s${i}`} />)}
          </VideoGrid>
          {q.error && <ErrorBox error={q.error} onRetry={() => q.fetchNextPage()} />}
          <Pagination page={page} knownPages={paged.knownPages} hasMore={paged.hasMore} onChange={(p) => goPage(p)} className="pt-2" />
        </>
      )}
    </div>
  );
}
