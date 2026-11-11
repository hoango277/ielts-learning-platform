import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorBox, Input, Progress, Segmented, Skeleton } from '../components/ui/primitives';
import { api } from '../lib/api';
import { cn, colorOf } from '../lib/utils';

const CATEGORIES = [
  { value: 'all', label: 'Tất cả' },
  { value: 'society', label: 'Xã hội' },
  { value: 'science', label: 'Khoa học & Môi trường' },
  { value: 'life', label: 'Đời sống' },
  { value: 'people', label: 'Con người' },
];

export default function Topics() {
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['topics'], queryFn: api.topics, staleTime: 60_000 });
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      (data ?? []).filter(
        (t) => (cat === 'all' || t.category === cat) && (!q || `${t.name} ${t.nameVi}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, cat, q],
  );
  const totals = useMemo(() => {
    const all = data ?? [];
    return { words: all.reduce((a, t) => a + t.wordCount, 0), inNb: all.reduce((a, t) => a + t.inNotebook, 0) };
  }, [data]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-emerald-500 via-teal-500 to-sky-500 p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
        <h1 className="text-2xl font-extrabold sm:text-3xl">Bộ từ vựng IELTS theo chủ đề 📚</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/90">
          {data?.length ?? 26} chủ đề hay gặp trong IELTS Speaking & Writing, gồm cụm từ cốt lõi và từ liên quan — kèm phiên âm, audio, nghĩa tiếng
          Việt, định nghĩa, câu ví dụ song ngữ và collocation.
        </p>
        <p className="mt-3 text-sm font-semibold">
          {totals.words} từ · bạn đã đưa {totals.inNb} từ vào sổ
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={cat} onChange={setCat} options={CATEGORIES} className="no-scrollbar max-w-full overflow-x-auto" ariaLabel="Nhóm chủ đề" />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm chủ đề…" className="pl-9" aria-label="Tìm chủ đề" />
        </div>
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={data?.length ? 'Không có chủ đề phù hợp' : 'Chưa có dữ liệu chủ đề'}
          description={data?.length ? undefined : 'Chạy “npm run crawl” trong thư mục backend để crawl và nạp bộ từ.'}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((t) => {
            const c = colorOf(t.color);
            const progress = t.wordCount ? t.mastered / t.wordCount : 0;
            const levels = Object.entries(t.levels ?? {}).sort(([a], [b]) => a.localeCompare(b));
            return (
              <Link key={t.slug} to={`/topics/${t.slug}`} className="card group relative overflow-hidden p-5 transition hover:-translate-y-1 hover:shadow-xl">
                <div className={cn('pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-linear-to-br opacity-20 blur-xl transition group-hover:opacity-40', c.gradient)} />
                <div className="flex items-start gap-3">
                  <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br text-3xl shadow-md', c.gradient)}>{t.icon}</span>
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-ink">{t.name}</h3>
                    <p className={cn('text-sm font-semibold', c.text)}>{t.nameVi}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted">{t.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {levels.map(([lv, n]) => (
                    <span key={lv} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                      {lv} · {n}
                    </span>
                  ))}
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
                    <span>{t.wordCount} từ</span>
                    <span>
                      {t.inNotebook} trong sổ · {t.mastered} đã nhớ
                    </span>
                  </div>
                  <Progress value={progress} className="h-1.5" barClassName={c.bar} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
