import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Captions, Link2, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../components/ui/Button';
import { HeroArt } from '../components/ui/HeroArt';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorBox, Segmented, Skeleton, Switch } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { DifficultyPill, useDifficultyBadges } from '../components/video/DifficultyBadge';
import { ChannelAvatar, VideoCard, VideoCardSkeleton, VideoGrid } from '../components/video/VideoCard';
import { useDebounced } from '../hooks/misc';
import { usePagedList } from '../hooks/usePagedList';
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
        className="flex items-center rounded-2xl border border-line bg-surface shadow-sm focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/15"
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
        <ul role="listbox" className="absolute inset-x-0 top-14 z-20 overflow-hidden rounded-2xl border border-line bg-surface py-2 shadow-lift">
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
        <h2 className="text-lg font-extrabold text-ink">
          Vừa sức với bạn{' '}
          <span className="text-sm font-normal text-muted">
            · <Term k="vocab_level">trình độ nền</Term> {rec.data?.vocabLevel} · % là <Term k="coverage">số từ bạn đã biết</Term>
          </span>
        </h2>
        <span className="flex gap-3">
          <Link to="/placement" className="text-xs font-semibold text-brand-600 hover:underline">
            Làm bài test vốn từ
          </Link>
          <Link to="/settings#learning" className="text-xs font-semibold text-brand-600 hover:underline">
            Đổi trình độ
          </Link>
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">Đang đo độ khó {rec.data?.analyzing} video từ các kênh học tiếng Anh… gợi ý sẽ xuất hiện sau ít phút.</p>
      ) : (
        <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {items.map((v) => (
            <Link key={v.id} to={`/watch/${v.id}`} className="group w-60 shrink-0">
              <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-3 shadow-card transition-shadow group-hover:shadow-lift">
                <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                <DifficultyPill data={v} className="absolute right-1.5 top-1.5 shadow" />
                {v.durationSec > 0 && (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1 text-[11px] font-semibold text-white">{formatTime(v.durationSec)}</span>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:text-brand-700 dark:group-hover:text-brand-300">{v.title}</p>
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
              className="flex w-[132px] shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-center shadow-soft transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card"
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

/** 24 chia hết cho 1/2/3/4 cột của lưới video → trang nào cũng kín hàng */
const PAGE_SIZE = 24;

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Math.floor(Number(params.get('p'))) || 1);
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
  const paged = usePagedList(feed, page, PAGE_SIZE);
  const badges = useDifficultyBadges(paged.pageItems.map((v) => v.id));

  /** Đổi bộ lọc (từ khoá, chủ đề, độ dài…) → về trang 1; chỉ giữ số trang khi chính nó được đổi */
  const set = (patch: Record<string, string | null>, opts?: { replace?: boolean }) => {
    const next = new URLSearchParams(params);
    if (!('p' in patch)) next.delete('p');
    for (const [k, v] of Object.entries(patch)) v === null || v === '' ? next.delete(k) : next.set(k, v);
    setParams(next, opts);
  };
  const listTop = useRef<HTMLDivElement>(null);
  const goPage = (p: number) => {
    set({ p: p > 1 ? String(p) : null });
    // Về đầu danh sách (ngay dưới thanh chủ đề), không cuộn mượt cả trang dài
    listTop.current?.scrollIntoView({ block: 'start' });
  };
  // Sửa tay ?p=99 mà danh sách chỉ có 5 trang → về trang cuối
  useEffect(() => {
    if (paged.outOfRange) set({ p: paged.knownPages > 1 ? String(paged.knownPages) : null }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.outOfRange, paged.knownPages]);
  const topRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    // đổi từ khoá / chip → về đầu trang (không cuộn ở lần mở đầu tiên)
    if (mounted.current) window.scrollTo({ top: 0, behavior: 'smooth' });
    mounted.current = true;
  }, [q, chip]);

  return (
    <div className="space-y-6" ref={topRef}>
      <section className="relative z-10 rounded-3xl bg-hero [--hero-glow:var(--color-rose-400)] px-5 py-7 text-white shadow-glow sm:px-8">
        <HeroArt items={['🎬', '📺', '🍿']} />
        <h1 className="pr-14 xl:pr-0 relative text-2xl font-black sm:text-3xl">Khám phá video để học</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/85">
          Mở video có phụ đề để nói đuổi, chép chính tả và bấm vào từ để tra nghĩa ngay trong câu.
        </p>
        <div className="relative mt-5">
          <SearchBox initial={q} onSearch={(query) => set({ q: query, chip: null })} />
        </div>
      </section>

      {!q && <RecommendedRow />}

      {!q && (
        <section>
          <h2 className="mb-3 text-lg font-extrabold text-ink">Kênh học tiếng Anh nổi bật</h2>
          <ChannelsRow />
        </section>
      )}

      <div ref={listTop} aria-hidden className="scroll-mt-14" />
      <div className="sticky top-14 z-10 -mx-4 space-y-3 bg-bg px-4 py-2  sm:-mx-6 sm:px-6">
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

      {feed.error && !paged.pageItems.length ? (
        <ErrorBox error={feed.error} onRetry={() => (feed.data ? feed.fetchNextPage() : feed.refetch())} />
      ) : feed.isPending ? (
        <VideoGrid>
          {Array.from({ length: 8 }, (_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </VideoGrid>
      ) : !paged.pageItems.length && !paged.filling ? (
        <EmptyState icon="🔎" title="Không tìm thấy video" description="Thử từ khoá khác hoặc tắt bộ lọc phụ đề CC." />
      ) : (
        <>
          <VideoGrid>
            {paged.pageItems.map((v) => (
              <VideoCard key={v.id} video={v} progress={progressMap.get(v.id)} difficulty={badges?.[v.id]} />
            ))}
            {paged.filling &&
              Array.from({ length: Math.min(8, PAGE_SIZE - paged.pageItems.length) }, (_, i) => <VideoCardSkeleton key={`s${i}`} />)}
          </VideoGrid>
          {feed.error && <ErrorBox error={feed.error} onRetry={() => feed.fetchNextPage()} />}
          <Pagination page={page} knownPages={paged.knownPages} hasMore={paged.hasMore} onChange={goPage} className="pt-2" />
        </>
      )}
    </div>
  );
}
