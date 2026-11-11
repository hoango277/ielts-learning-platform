import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Captions, Link2, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorBox, Segmented, Skeleton, Switch } from '../components/ui/primitives';
import { DifficultyPill, useDifficultyBadges } from '../components/video/DifficultyBadge';
import { ChannelAvatar, VideoCard, VideoCardSkeleton, VideoGrid } from '../components/video/VideoCard';
import { useDebounced, useInView } from '../hooks/misc';
import { api, type SearchFilters } from '../lib/api';
import { cn, formatTime, parseStartTime, parseYouTubeId } from '../lib/utils';

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (q: string) => void }) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const navigate = useNavigate();
  const debounced = useDebounced(value, 200);
  const ytId = parseYouTubeId(value);
  const { data: suggestions = [] } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: ({ signal }) => api.suggest(debounced, signal),
    enabled: open && debounced.trim().length > 1 && !ytId,
    staleTime: 5 * 60_000,
  });
  useEffect(() => setValue(initial), [initial]);

  const submit = (q: string) => {
    setOpen(false);
    const id = parseYouTubeId(q);
    if (id) {
      const t = parseStartTime(q);
      navigate(`/watch/${id}${t ? `?t=${t}` : ''}`);
      return;
    }
    if (q.trim()) onSearch(q.trim());
  };

  return (
    <div className="relative w-full max-w-2xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(active >= 0 ? suggestions[active] : value);
        }}
        className="flex items-center rounded-2xl border border-line bg-surface shadow-sm focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-500/15"
      >
        {ytId ? <Link2 className="ml-4 h-5 w-5 text-rose-500" /> : <Search className="ml-4 h-5 w-5 text-muted" />}
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(suggestions.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Tìm video tiếng Anh hoặc dán link YouTube…"
          aria-label="Tìm video hoặc dán link YouTube"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink placeholder:text-muted focus:outline-none"
        />
        {value && (
          <button type="button" onClick={() => setValue('')} className="p-2 text-muted hover:text-ink" aria-label="Xoá">
            <X className="h-4 w-4" />
          </button>
        )}
        <Button type="submit" variant="primary" className="m-1 h-10 rounded-xl px-5">
          {ytId ? 'Mở video' : 'Tìm'}
        </Button>
      </form>
      {ytId && <p className="mt-1.5 pl-2 text-xs font-medium text-rose-500">Đã nhận diện link YouTube — bấm "Mở video" để học ngay.</p>}
      {open && suggestions.length > 0 && !ytId && (
        <ul role="listbox" className="absolute inset-x-0 top-14 z-20 overflow-hidden rounded-2xl border border-line bg-surface py-2 shadow-xl">
          {suggestions.map((s, i) => (
            <li key={s} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue(s);
                  submit(s);
                }}
                className={cn('flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-ink hover:bg-surface-2', i === active && 'bg-surface-2')}
              >
                <Search className="h-4 w-4 text-muted" />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Video vừa sức với vốn từ của người học (biết 95–98% số từ), phân tích dần ở máy chủ. */
function RecommendedRow() {
  const rec = useQuery({
    queryKey: ['recommended'],
    queryFn: api.recommended,
    staleTime: 60_000,
    refetchInterval: (q) => ((q.state.data?.analyzing ?? 0) > 0 ? 6000 : false),
  });
  const items = [...(rec.data?.fit ?? []), ...(rec.data?.easy ?? [])].slice(0, 12);
  if (rec.isPending || (!items.length && !rec.data?.analyzing)) return null;
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">
          Vừa sức với bạn <span className="text-sm font-normal text-muted">· trình độ nền {rec.data?.vocabLevel}</span>
        </h2>
        <Link to="/settings#learning" className="text-xs font-semibold text-violet-600 hover:underline">
          Đổi trình độ
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">Đang đo độ khó {rec.data?.analyzing} video từ các kênh học tiếng Anh… gợi ý sẽ xuất hiện sau ít phút.</p>
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {items.map((v) => (
            <Link key={v.id} to={`/watch/${v.id}`} className="group w-60 shrink-0">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-3">
                <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                <DifficultyPill data={v} className="absolute right-1.5 top-1.5 shadow" />
                {v.durationSec > 0 && (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 text-[11px] font-semibold text-white">{formatTime(v.durationSec)}</span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-violet-700 dark:group-hover:text-violet-300">{v.title}</p>
              <p className="truncate text-xs text-muted">
                {v.channelName} · {v.newWords} từ mới
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ChannelsRow() {
  const { data, isPending } = useQuery({ queryKey: ['channels'], queryFn: api.channels, staleTime: 3600_000 });
  return (
    <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
      {isPending
        ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[92px] w-[132px] shrink-0 rounded-2xl" />)
        : data?.map((c) => (
            <Link
              key={c.id}
              to={`/channel/${c.id}`}
              className="flex w-[132px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-center transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md"
            >
              <ChannelAvatar name={c.name} src={c.avatar} size={40} />
              <span className="line-clamp-2 text-xs font-semibold leading-tight text-ink">{c.name}</span>
            </Link>
          ))}
    </div>
  );
}

const DURATIONS: { value: '' | NonNullable<SearchFilters['duration']>; label: string }[] = [
  { value: '', label: 'Mọi độ dài' },
  { value: 'short', label: '< 4 phút' },
  { value: 'medium', label: '4–20 phút' },
  { value: 'long', label: '> 20 phút' },
];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const chip = params.get('chip') ?? 'all';
  const duration = (params.get('duration') ?? '') as '' | NonNullable<SearchFilters['duration']>;
  const captions = params.get('cc') !== '0';
  const [showFilters, setShowFilters] = useState(Boolean(params.get('duration')));
  const { data: chips } = useQuery({ queryKey: ['chips'], queryFn: api.chips, staleTime: Infinity });
  const history = useQuery({ queryKey: ['videos', 'history'], queryFn: () => api.videos('history') });
  const progressMap = useMemo(() => new Map((history.data ?? []).map((v) => [v.id, v.progress])), [history.data]);

  const feed = useInfiniteQuery({
    queryKey: q ? ['search', q, duration, captions] : ['feed', chip],
    queryFn: ({ pageParam }) =>
      q ? api.search(q, { duration: duration || undefined, captions }, pageParam) : api.feed(chip, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor,
    staleTime: 10 * 60_000,
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (feed.data?.pages.flatMap((p) => p.items) ?? []).filter((v) => !seen.has(v.id) && seen.add(v.id));
  }, [feed.data]);
  const badges = useDifficultyBadges(items.map((v) => v.id));
  const sentinel = useInView<HTMLDivElement>(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
  }, feed.hasNextPage);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v === null || v === '' ? next.delete(k) : next.set(k, v);
    setParams(next);
  };
  const topRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    // đổi từ khoá / chip → về đầu trang (không cuộn ở lần mở đầu tiên)
    if (mounted.current) window.scrollTo({ top: 0, behavior: 'smooth' });
    mounted.current = true;
  }, [q, chip]);

  return (
    <div className="space-y-6" ref={topRef}>
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-rose-500 via-fuchsia-500 to-violet-600 px-5 py-7 text-white sm:px-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-orange-300/30 blur-3xl" />
        <h1 className="text-2xl font-extrabold sm:text-3xl">Khám phá video để học</h1>
        <p className="mt-1 max-w-xl text-sm text-white/85">
          Lướt video như trên YouTube. Mở bất kỳ video nào có phụ đề để shadowing, chép chính tả, bấm vào từ để tra nghĩa và lưu vào sổ.
        </p>
        <div className="mt-5">
          <SearchBox initial={q} onSearch={(query) => set({ q: query, chip: null })} />
        </div>
      </section>

      {!q && <RecommendedRow />}

      {!q && (
        <section>
          <h2 className="mb-3 text-base font-bold text-ink">Kênh học tiếng Anh nổi bật</h2>
          <ChannelsRow />
        </section>
      )}

      <div className="sticky top-14 z-10 -mx-4 space-y-3 bg-bg/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
            {q && (
              <button
                type="button"
                onClick={() => set({ q: null })}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-semibold text-bg"
              >
                “{q}” <X className="h-4 w-4" />
              </button>
            )}
            {!q &&
              chips?.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => set({ chip: c.key === 'all' ? null : c.key })}
                  className={cn(
                    'h-9 shrink-0 rounded-xl px-3.5 text-sm font-semibold transition',
                    chip === c.key ? 'bg-ink text-bg' : 'bg-surface-2 text-ink hover:bg-surface-3',
                  )}
                >
                  {c.label}
                </button>
              ))}
          </div>
          {q && (
            <Button size="sm" variant={showFilters ? 'soft' : 'outline'} onClick={() => setShowFilters((v) => !v)} icon={<SlidersHorizontal className="h-4 w-4" />}>
              Bộ lọc
            </Button>
          )}
        </div>
        {q && showFilters && (
          <div className="flex flex-wrap items-center gap-3">
            <Segmented size="sm" value={duration} onChange={(v) => set({ duration: v || null })} options={DURATIONS} ariaLabel="Độ dài video" />
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <Switch checked={captions} onChange={(v) => set({ cc: v ? null : '0' })} label="Chỉ video có phụ đề CC" />
              <Captions className="h-4 w-4 text-muted" /> Chỉ video có phụ đề CC (chuẩn hơn phụ đề tự động)
            </label>
          </div>
        )}
      </div>

      {feed.error ? (
        <ErrorBox error={feed.error} onRetry={() => feed.refetch()} />
      ) : feed.isPending ? (
        <VideoGrid>
          {Array.from({ length: 8 }, (_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </VideoGrid>
      ) : items.length === 0 ? (
        <EmptyState icon="🔎" title="Không tìm thấy video" description="Thử từ khoá khác hoặc tắt bộ lọc phụ đề CC." />
      ) : (
        <>
          <VideoGrid>
            {items.map((v) => (
              <VideoCard key={v.id} video={v} progress={progressMap.get(v.id)} difficulty={badges?.[v.id]} />
            ))}
            {feed.isFetchingNextPage && Array.from({ length: 4 }, (_, i) => <VideoCardSkeleton key={`s${i}`} />)}
          </VideoGrid>
          <div ref={sentinel} className="h-4" />
          {!feed.hasNextPage && <p className="py-6 text-center text-sm text-muted">Bạn đã xem hết danh sách 🎉</p>}
        </>
      )}
    </div>
  );
}
