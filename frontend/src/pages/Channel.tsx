import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState, ErrorBox, Skeleton } from '../components/ui/primitives';
import { ChannelAvatar, VideoCard, VideoCardSkeleton, VideoGrid } from '../components/video/VideoCard';
import { useInView } from '../hooks/misc';
import { api } from '../lib/api';

export default function Channel() {
  const { id = '' } = useParams();
  const q = useInfiniteQuery({
    queryKey: ['channel', id],
    queryFn: ({ pageParam }) => api.channelVideos(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
    staleTime: 10 * 60_000,
  });
  const channel = q.data?.pages.find((p) => p.channel)?.channel;
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const sentinel = useInView<HTMLDivElement>(() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage(), q.hasNextPage);

  return (
    <div className="space-y-6">
      <Link to="/explore" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Khám phá
      </Link>
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        {channel?.banner ? (
          <img src={channel.banner} alt="" className="h-28 w-full object-cover sm:h-40" />
        ) : (
          <div className="h-24 bg-linear-to-r from-rose-400 via-fuchsia-500 to-violet-600 sm:h-32" />
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

      {q.error ? (
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <VideoGrid>
          {Array.from({ length: 8 }, (_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </VideoGrid>
      ) : items.length === 0 ? (
        <EmptyState icon="📺" title="Kênh chưa có video" />
      ) : (
        <>
          <VideoGrid>
            {items.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
            {q.isFetchingNextPage && Array.from({ length: 4 }, (_, i) => <VideoCardSkeleton key={`s${i}`} />)}
          </VideoGrid>
          <div ref={sentinel} className="h-4" />
        </>
      )}
    </div>
  );
}
