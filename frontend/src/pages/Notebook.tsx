import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookMarked,
  Check,
  CheckCheck,
  Download,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Star,
  Target,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { ConfirmDialog, Drawer, Modal } from '../components/ui/Modal';
import { Badge, EmptyState, ErrorBox, Field, Input, Select, Skeleton, Textarea } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { AudioButton, Highlight, StatusBadge } from '../components/word/bits';
import { LookupCard } from '../components/word/LookupCard';
import { WordProfileView } from '../components/word/WordProfileView';
import { useDebounced } from '../hooks/misc';
import { api } from '../lib/api';
import type { Word } from '../lib/types';
import { cn, formatTime, posLabel, relativeTime, STATUS_META } from '../lib/utils';

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'due', label: 'Đến hạn' },
  { key: 'new', label: STATUS_META.new.label },
  { key: 'learning', label: STATUS_META.learning.label },
  { key: 'reviewing', label: STATUS_META.reviewing.label },
  { key: 'mastered', label: STATUS_META.mastered.label },
  { key: 'known', label: STATUS_META.known.label },
  { key: 'starred', label: '⭐ Đánh dấu' },
];

function useInvalidateWords() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['words'] });
    qc.invalidateQueries({ queryKey: ['word'] });
    qc.invalidateQueries({ queryKey: ['word-keys'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
  };
}

function nextReviewLabel(w: Word) {
  if (w.known) return 'Không cần ôn';
  if (w.state === 0) return 'Chưa học';
  const d = new Date(w.due).getTime();
  return d <= Date.now() ? 'Đến hạn ôn' : `Ôn ${relativeTime(w.due)}`;
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [value, setValue] = useState('');
  const add = () => {
    const v = value.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setValue('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <Badge key={t} className="bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
          #{t}
          <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`Bỏ tag ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="+ thêm tag"
        aria-label="Thêm tag"
        className="h-7 w-28 rounded-lg bg-transparent px-1 text-sm text-ink placeholder:text-muted focus:outline-none"
      />
    </div>
  );
}

function WordDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const invalidate = useInvalidateWords();
  const { data: w, isPending } = useQuery({ queryKey: ['word', id], queryFn: () => api.word(id) });
  const occ = useQuery({ queryKey: ['word', id, 'occ'], queryFn: () => api.occurrences(id) });
  const [meaning, setMeaning] = useState('');
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => {
    if (w) {
      setMeaning(w.meaning);
      setNote(w.note);
    }
  }, [w]);

  const update = useMutation({
    mutationFn: (patch: Partial<Word>) => api.updateWord(id, patch),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error((e as Error).message),
  });
  const reset = useMutation({ mutationFn: () => api.resetWord(id), onSuccess: () => (invalidate(), toast.success('Đã đặt lại tiến độ học')) });
  const del = useMutation({
    mutationFn: () => api.deleteWord(id),
    onSuccess: () => {
      invalidate();
      toast.success('Đã xoá từ');
      onClose();
    },
  });

  const accuracy = w && w.correctCount + w.wrongCount ? Math.round((w.correctCount / (w.correctCount + w.wrongCount)) * 100) : null;

  return (
    <Drawer
      open
      onClose={onClose}
      title={w?.term ?? '…'}
      footer={
        w && (
          <>
            <Button
              variant={w.known ? 'soft' : 'success'}
              size="sm"
              icon={<CheckCheck className="h-4 w-4" />}
              onClick={() => update.mutate({ known: !w.known }, { onSuccess: () => toast.success(w.known ? 'Đưa lại vào lịch ôn' : 'Đã đánh dấu “Đã thuộc”') })}
            >
              {w.known ? 'Bỏ “Đã thuộc”' : 'Tôi đã thuộc'}
            </Button>
            <Button variant="outline" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => reset.mutate()}>
              Học lại từ đầu
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto text-rose-500" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>
              Xoá
            </Button>
          </>
        )
      }
    >
      {isPending || !w ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={w.status} />
            {w.pos && <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{posLabel(w.pos)}</Badge>}
            {w.ipa && <span className="font-ipa text-sm text-muted">{w.ipa}</span>}
            <AudioButton term={w.term} audio={w.audio} label="Nghe" />
            <button
              type="button"
              onClick={() => update.mutate({ starred: !w.starred })}
              className={cn('ml-auto rounded-lg p-1.5', w.starred ? 'text-amber-500' : 'text-muted hover:text-amber-500')}
              aria-label={w.starred ? 'Bỏ đánh dấu sao' : 'Đánh dấu sao'}
            >
              <Star className={cn('h-5 w-5', w.starred && 'fill-current')} />
            </button>
          </div>

          <Field label="Nghĩa tiếng Việt" htmlFor="meaning">
            <Input id="meaning" value={meaning} onChange={(e) => setMeaning(e.target.value)} onBlur={() => meaning !== w.meaning && update.mutate({ meaning })} />
          </Field>
          {w.definition && (
            <div>
              <p className="text-sm font-semibold text-ink">Định nghĩa (EN)</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{w.definition}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Câu ví dụ & ngữ cảnh</p>
            {w.examples.length === 0 && <p className="text-sm text-muted">Chưa có ví dụ.</p>}
            <ul className="space-y-2">
              {w.examples.map((ex, i) => (
                <li key={i} className={cn('rounded-xl p-3 text-sm', ex.source === 'video' ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-surface-2')}>
                  <p className="leading-relaxed text-ink">
                    <Highlight text={ex.en} term={w.term} />
                  </p>
                  {ex.vi && <p className="mt-1 text-muted">{ex.vi}</p>}
                  {ex.videoId && (
                    <Link
                      to={`/watch/${ex.videoId}?t=${Math.floor(ex.time ?? 0)}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                    >
                      <Video className="h-3.5 w-3.5" /> Xem đoạn video tại {formatTime(ex.time ?? 0)}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {(w.synonyms.length > 0 || w.collocations.length > 0) && (
            <div className="space-y-2">
              {w.collocations.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted">
                    <Term k="collocation">Hay đi cùng</Term>:
                  </span>
                  {w.collocations.map((c) => (
                    <Badge key={c} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
              {w.synonyms.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted">
                    <Term k="synonym">Đồng nghĩa</Term>:
                  </span>
                  {w.synonyms.map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {!/\s/.test(w.term.trim()) && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-500/30 dark:bg-sky-500/5">
              <button type="button" onClick={() => setShowProfile((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-bold text-sky-700 dark:text-sky-300" aria-expanded={showProfile}>
                🧬 Hồ sơ từ: các dạng của từ, từ đồng nghĩa & sắc thái, từ hay đi cùng
                <span className="text-xs font-semibold">{showProfile ? 'Thu gọn' : 'Mở'}</span>
              </button>
              {showProfile && (
                <div className="mt-3 space-y-3">
                  <WordProfileView term={w.term} compact />
                  <Link to={`/profile/${encodeURIComponent(w.term.toLowerCase())}`} className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
                    Mở trang hồ sơ đầy đủ →
                  </Link>
                </div>
              )}
            </div>
          )}

          <Field label="Ghi chú / mẹo nhớ" htmlFor="note">
            <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== w.note && update.mutate({ note })} placeholder="VD: procrastinate = pro (về sau) + crastinus (ngày mai)" />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">Tag</p>
            <TagEditor tags={w.tags} onChange={(tags) => update.mutate({ tags })} />
          </div>

          {(occ.data?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Xuất hiện trong các video bạn đã học</p>
              <ul className="space-y-1.5">
                {occ.data!.slice(0, 8).map((o) => (
                  <li key={`${o.videoId}-${o.start}`}>
                    <Link to={`/watch/${o.videoId}?t=${Math.floor(o.start)}`} className="block rounded-xl border border-line p-2.5 text-sm hover:bg-surface-2">
                      <p className="text-ink">
                        <Highlight text={o.text} term={w.term} />
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        ▶ {formatTime(o.start)} · {o.videoTitle}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-center text-sm">
            <div>
              <p className="font-bold text-ink">{w.reps}</p>
              <p className="text-xs text-muted">lượt ôn</p>
            </div>
            <div>
              <p className="font-bold text-ink">{w.lapses}</p>
              <p className="text-xs text-muted">lần quên</p>
            </div>
            <div>
              <p className="font-bold text-ink">{accuracy === null ? '—' : `${accuracy}%`}</p>
              <p className="text-xs text-muted">đúng khi luyện</p>
            </div>
            <p className="col-span-3 text-xs text-muted">
              {nextReviewLabel(w)} · Độ ổn định trí nhớ {w.stability.toFixed(1)} ngày · Nguồn:{' '}
              {w.sourceType === 'video' ? (w.videoTitle ?? 'video') : w.sourceType === 'topic' ? (w.topicName ?? 'chủ đề') : 'tự thêm'}
            </p>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => del.mutate()} title="Xoá từ này?" message={`“${w?.term}” và toàn bộ lịch sử ôn sẽ bị xoá.`} confirmLabel="Xoá" danger />
    </Drawer>
  );
}

function AddWordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (open) {
      setTerm('');
      setQuery('');
    }
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Thêm từ mới" description="Tự động điền phiên âm, nghĩa, định nghĩa và ví dụ.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term.trim());
        }}
        className="mb-4 flex gap-2"
      >
        <Input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="VD: mitigate, carbon footprint…" aria-label="Từ cần thêm" />
        <Button type="submit" variant="primary" disabled={!term.trim()}>
          Tra
        </Button>
      </form>
      {query && <LookupCard key={query} term={query} onSaved={onClose} />}
    </Modal>
  );
}

export default function Notebook() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'all';
  const openId = Number(params.get('word')) || null;
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const debouncedQ = useDebounced(q, 250);
  const invalidate = useInvalidateWords();
  const LIMIT = 40;

  const filters = { q: debouncedQ, status, source: source || undefined, tag: tag || undefined, sort, page, limit: LIMIT };
  const list = useQuery({ queryKey: ['words', filters], queryFn: () => api.words(filters), placeholderData: keepPreviousData });
  const tags = useQuery({ queryKey: ['words', 'tags'], queryFn: api.tags });
  useEffect(() => setPage(1), [debouncedQ, status, source, tag, sort]);
  useEffect(() => setSelected(new Set()), [status, debouncedQ, source, tag]);

  const bulk = useMutation({
    mutationFn: (action: string) => api.bulk({ action, ids: [...selected] }),
    onSuccess: (r, action) => {
      invalidate();
      setSelected(new Set());
      toast.success(`Đã cập nhật ${r.count} từ`, { description: action === 'delete' ? 'Đã xoá' : undefined });
    },
  });
  const quick = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<Word> }) => api.updateWord(id, patch),
    onSuccess: () => invalidate(),
  });

  const items = list.data?.items ?? [];
  const counts = list.data?.counts ?? {};
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / LIMIT));
  const allSelected = items.length > 0 && items.every((w) => selected.has(w.id));
  const setStatus = (s: string) => {
    const next = new URLSearchParams(params);
    if (s === 'all') next.delete('status');
    else next.set('status', s);
    setParams(next);
  };
  const openWord = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('word', String(id));
    else next.delete('word');
    setParams(next, { replace: true });
  };

  const practiceLink = useMemo(() => (status === 'due' ? '/practice/play?mode=mixed&source=due' : '/practice'), [status]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            <BookMarked className="h-7 w-7 text-sky-500" /> Sổ từ vựng
          </h1>
          <p className="text-sm text-muted">
            {counts.all ?? 0} từ · {counts.due ?? 0} đến hạn ôn · {(counts.mastered ?? 0) + (counts.known ?? 0)} đã nhớ chắc
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/review" variant="soft" icon={<Layers className="h-4 w-4" />}>
              Ôn tập
            </LinkButton>
          <LinkButton to={practiceLink} variant="outline" icon={<Target className="h-4 w-4" />}>
              Luyện tập
            </LinkButton>
          <div className="group relative">
            <Button variant="outline" icon={<Download className="h-4 w-4" />}>
              Xuất
            </Button>
            <div className="invisible absolute right-0 top-11 z-20 w-56 rounded-xl border border-line bg-surface p-1.5 opacity-0 shadow-lift transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <a href={api.exportUrl('csv')} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2">
                File CSV (Excel, Google Sheets)
              </a>
              <a href={api.exportUrl('anki')} className="block rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2">
                File cho Anki (.txt)
              </a>
            </div>
          </div>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Thêm từ
          </Button>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            title={STATUS_META[t.key as keyof typeof STATUS_META]?.desc}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 font-display text-sm font-bold transition active:scale-95',
              status === t.key ? 'bg-ink text-bg shadow-card' : 'bg-surface-2 text-ink hover:bg-surface-3',
            )}
          >
            {t.label}
            <span className={cn('rounded-full px-1.5 text-xs', status === t.key ? 'bg-white/20' : 'bg-surface text-muted')}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
        <Term k="statuses" icon className="ml-1" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm từ, nghĩa, ghi chú…" className="pl-9" aria-label="Tìm trong sổ" />
        </div>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-auto" aria-label="Nguồn">
          <option value="">Mọi nguồn</option>
          <option value="video">Từ video</option>
          <option value="topic">Từ chủ đề</option>
          <option value="manual">Tự thêm</option>
        </Select>
        {(tags.data?.length ?? 0) > 0 && (
          <Select value={tag} onChange={(e) => setTag(e.target.value)} className="w-auto" aria-label="Tag">
            <option value="">Mọi tag</option>
            {tags.data!.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </Select>
        )}
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto" aria-label="Sắp xếp">
          <option value="recent">Mới thêm</option>
          <option value="oldest">Cũ nhất</option>
          <option value="alpha">A → Z</option>
          <option value="due">Sắp đến hạn</option>
          <option value="weak">Hay sai nhất</option>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 p-2.5 shadow-sm dark:border-violet-500/30 dark:bg-violet-950">
          <span className="px-2 text-sm font-semibold text-violet-700 dark:text-violet-200">Đã chọn {selected.size}</span>
          <Button size="sm" variant="success" icon={<Check className="h-4 w-4" />} onClick={() => bulk.mutate('known')}>
            Đã thuộc
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate('unknown')}>
            Đưa vào ôn tập
          </Button>
          <Button size="sm" variant="outline" icon={<Star className="h-4 w-4" />} onClick={() => bulk.mutate('star')}>
            Gắn sao
          </Button>
          <Button size="sm" variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => bulk.mutate('reset')}>
            Học lại
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmBulk(true)}>
            Xoá
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      {list.error ? (
        <ErrorBox error={list.error} onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="📒"
          title={counts.all ? 'Không có từ nào khớp bộ lọc' : 'Sổ từ còn trống'}
          description={counts.all ? 'Thử bỏ bớt bộ lọc.' : 'Lưu từ khi xem video, thêm từ bộ chủ đề, hoặc bấm “Thêm từ”.'}
          action={
            !counts.all && (
              <div className="flex gap-2">
                <LinkButton to="/topics" variant="soft">Bộ từ chủ đề</LinkButton>
                <Button variant="primary" onClick={() => setAdding(true)}>
                  Thêm từ
                </Button>
              </div>
            )
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((w) => w.id)))}
              aria-label="Chọn tất cả"
              className="h-4 w-4 accent-violet-600"
            />
            <span className="flex-1">Từ</span>
            <span className="hidden w-32 md:block">Trạng thái</span>
            <span className="hidden w-36 lg:block">Lịch ôn</span>
            <span className="w-20 text-right">Thao tác</span>
          </div>
          <ul className="divide-y divide-line">
            {items.map((w) => (
              <li key={w.id} className={cn('flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/60', selected.has(w.id) && 'bg-violet-50/60 dark:bg-violet-500/5')}>
                <input
                  type="checkbox"
                  checked={selected.has(w.id)}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(w.id)) n.delete(w.id);
                      else n.add(w.id);
                      return n;
                    })
                  }
                  aria-label={`Chọn ${w.term}`}
                  className="h-4 w-4 accent-violet-600"
                />
                <button type="button" onClick={() => openWord(w.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-ink">{w.term}</span>
                    {w.ipa && <span className="font-ipa text-xs text-muted">{w.ipa}</span>}
                    {w.sourceType === 'video' && <Video className="h-3.5 w-3.5 text-rose-400" aria-label="Từ video" />}
                    {w.starred && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Có sao" />}
                  </span>
                  <span className="block truncate text-sm text-muted">{w.meaning}</span>
                </button>
                <AudioButton term={w.term} audio={w.audio} size="sm" />
                <span className="hidden w-32 md:block">
                  <StatusBadge status={w.status} />
                </span>
                <span className="hidden w-36 text-xs text-muted lg:block">{nextReviewLabel(w)}</span>
                <span className="flex w-20 justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => quick.mutate({ id: w.id, patch: { known: !w.known } })}
                    className={cn('rounded-lg p-1.5 transition', w.known ? 'text-teal-500' : 'text-muted hover:text-teal-500')}
                    aria-label={w.known ? 'Bỏ đã thuộc' : 'Đánh dấu đã thuộc'}
                    title={w.known ? 'Bỏ “Đã thuộc”' : 'Tôi đã thuộc từ này'}
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => quick.mutate({ id: w.id, patch: { starred: !w.starred } })}
                    className={cn('rounded-lg p-1.5 transition', w.starred ? 'text-amber-500' : 'text-muted hover:text-amber-500')}
                    aria-label={w.starred ? 'Bỏ sao' : 'Gắn sao'}
                  >
                    <Star className={cn('h-4 w-4', w.starred && 'fill-current')} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Trước
              </Button>
              <span className="text-muted">
                Trang {page}/{totalPages}
              </span>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sau →
              </Button>
            </div>
          )}
        </div>
      )}

      {openId && <WordDetail key={openId} id={openId} onClose={() => openWord(null)} />}
      <AddWordModal open={adding} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => bulk.mutate('delete')}
        title={`Xoá ${selected.size} từ?`}
        message="Các từ và lịch sử ôn tập của chúng sẽ bị xoá vĩnh viễn."
        confirmLabel="Xoá"
        danger
      />
    </div>
  );
}
