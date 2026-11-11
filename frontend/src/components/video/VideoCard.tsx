import { Captions } from 'lucide-react';
import { Link } from 'react-router';
import type { DifficultyBadge, VideoCard as Video } from '../../lib/types';
import { cn } from '../../lib/utils';
import { Skeleton } from '../ui/primitives';
import { DifficultyPill } from './DifficultyBadge';

export function ChannelAvatar({ name, src, size = 36 }: { name?: string; src?: string; size?: number }) {
  if (src) {
    return <img src={src} alt="" width={size} height={size} loading="lazy" className="shrink-0 rounded-full bg-surface-3 object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {(name ?? '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

export function VideoCard({ video, progress, compact, difficulty }: { video: Video; progress?: number; compact?: boolean; difficulty?: DifficultyBadge }) {
  const href = `/watch/${video.id}`;
  if (compact) {
    return (
      <Link to={href} className="group flex gap-3 rounded-xl p-1.5 transition hover:bg-surface-2">
        <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg bg-surface-3">
          <img src={video.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
          {video.duration && (
            <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-semibold text-white">{video.duration}</span>
          )}
        </div>
        <div className="min-w-0 py-0.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{video.title}</h3>
          <p className="mt-1 truncate text-xs text-muted">{video.channel?.name}</p>
          <p className="truncate text-xs text-muted">{[video.views, video.published].filter(Boolean).join(' • ')}</p>
        </div>
      </Link>
    );
  }
  return (
    <article className="group">
      <Link to={href} className="block" aria-label={video.title}>
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface-3 shadow-sm">
          <img
            src={video.thumbnail}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
          {video.duration && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-white">
              {video.duration}
            </span>
          )}
          {video.hasCaptions && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white">
              <Captions className="h-3.5 w-3.5" /> CC
            </span>
          )}
          {difficulty && <DifficultyPill data={difficulty} className="absolute right-2 top-2 shadow" />}
          {progress !== undefined && progress > 0.01 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
              <div className="h-full bg-rose-500" style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/15 group-hover:opacity-100">
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-violet-700 shadow-lg">▶ Học với video này</span>
          </span>
        </div>
      </Link>
      <div className="mt-3 flex gap-3">
        {video.channel?.id ? (
          <Link to={`/channel/${video.channel.id}`} aria-label={video.channel.name}>
            <ChannelAvatar name={video.channel?.name} src={video.channel?.avatar} />
          </Link>
        ) : (
          <ChannelAvatar name={video.channel?.name} src={video.channel?.avatar} />
        )}
        <div className="min-w-0">
          <Link to={href}>
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink group-hover:text-violet-700 dark:group-hover:text-violet-300">
              {video.title}
            </h3>
          </Link>
          {video.channel?.id ? (
            <Link to={`/channel/${video.channel.id}`} className="mt-1 block truncate text-sm text-muted hover:text-ink">
              {video.channel.name}
            </Link>
          ) : (
            <p className="mt-1 truncate text-sm text-muted">{video.channel?.name}</p>
          )}
          <p className="truncate text-sm text-muted">{[video.views, video.published].filter(Boolean).join(' • ')}</p>
        </div>
      </div>
    </article>
  );
}

export function VideoGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4', className)}>{children}</div>;
}

export function VideoCardSkeleton() {
  return (
    <div>
      <Skeleton className="aspect-video w-full rounded-2xl" />
      <div className="mt-3 flex gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}
