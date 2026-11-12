import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { TopicForm } from '../components/topics/TopicForm';
import { Emoji3D } from '../components/ui/Emoji3D';
import { EmptyState, ErrorBox, Input, Progress, Segmented, Skeleton } from '../components/ui/primitives';
import { HeroArt } from '../components/ui/HeroArt';
import { api } from '../lib/api';
import type { Topic } from '../lib/types';
import { cn, colorOf } from '../lib/utils';

const CATEGORIES = [
  { value: 'all', label: 'Tất cả' },
  { value: 'society', label: 'Xã hội' },
  { value: 'science', label: 'Khoa học & Môi trường' },
  { value: 'life', label: 'Đời sống' },
  { value: 'people', label: 'Con người' },
  { value: 'custom', label: 'Bổ sung' },
];

/** Thẻ gọn cho "Bộ từ của tôi" */
function MyTopicCard({ t }: { t: Topic }) {
  const c = colorOf(t.color);
  return (
    <Link to={`/topics/${t.slug}`} className="card card-hover group relative flex items-center gap-3 overflow-hidden p-4">
      <div aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-28 bg-linear-to-r to-transparent', c.tint)} />
      <Emoji3D emoji={t.icon} size={44} className="relative shrink-0 transition-transform duration-300 group-hover:scale-110" />
      <div className="relative min-w-0 flex-1">
        <h3 className="truncate font-extrabold text-ink">{t.name}</h3>
        <p className="text-xs font-semibold text-muted">
          {t.wordCount} từ · {t.inNotebook} trong sổ
        </p>
        <Progress value={t.wordCount ? t.mastered / t.wordCount : 0} className="mt-1.5 h-1" barClassName={c.bar} />
      </div>
    </Link>
  );
}

export default function Topics() {
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['topics'], queryFn: api.topics, staleTime: 60_000 });
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const mine = useMemo(() => (data ?? []).filter((t) => t.mine), [data]);
  const shared = useMemo(() => (data ?? []).filter((t) => !t.mine), [data]);
  const categories = useMemo(() => CATEGORIES.filter((c) => c.value !== 'custom' || shared.some((t) => t.category === 'custom')), [shared]);
  const list = useMemo(
    () =>
      shared.filter(
        (t) => (cat === 'all' || t.category === cat) && (!q || `${t.name} ${t.nameVi}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [shared, cat, q],
  );
  const totals = useMemo(() => {
    const all = data ?? [];
    return { words: shared.reduce((a, t) => a + t.wordCount, 0), inNb: all.reduce((a, t) => a + t.inNotebook, 0) };
  }, [data, shared]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-hero [--hero-glow:var(--color-emerald-400)] p-6 text-white shadow-glow sm:p-8">
        <HeroArt items={['📚', '🌍', '🎓']} />
        <h1 className="pr-14 xl:pr-0 relative text-2xl font-black sm:text-3xl">Bộ từ vựng IELTS theo chủ đề</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/90">
          {shared.length || 26} chủ đề hay gặp trong IELTS Speaking & Writing — mỗi từ có phiên âm, nghĩa, câu ví dụ và cấp độ A1–C2. Tự tạo thêm bộ từ của riêng bạn bên dưới.
        </p>
        <p className="relative mt-3 text-sm font-semibold">
          {totals.words} từ · bạn đã đưa {totals.inNb} từ vào sổ
        </p>
      </section>

      {data && (
        <section aria-labelledby="my-topics">
          <h2 id="my-topics" className="mb-3 text-lg font-extrabold text-ink">
            Bộ từ của tôi
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {mine.map((t) => (
              <MyTopicCard key={t.slug} t={t} />
            ))}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex min-h-[76px] items-center gap-3 rounded-2xl border-2 border-dashed border-line p-4 text-left text-muted transition hover:border-brand-400 hover:bg-surface-2 hover:text-ink"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Plus className="h-5 w-5" />
              </span>
              <span>
                <span className="block font-bold text-ink">Tạo bộ từ mới</span>
                <span className="block text-xs">{mine.length ? 'Thêm một bộ khác' : 'Gom từ bạn muốn học thành một bộ riêng'}</span>
              </span>
            </button>
          </div>
        </section>
      )}

      <h2 className="mb-3 text-lg font-extrabold text-ink">Bộ từ IELTS theo chủ đề</h2>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={cat} onChange={setCat} options={categories} className="no-scrollbar max-w-full overflow-x-auto" ariaLabel="Nhóm chủ đề" />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm chủ đề…" className="pl-9" aria-label="Tìm chủ đề" />
        </div>
      </div>

      {error ? (
        <ErrorBox error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={shared.length ? 'Không có chủ đề phù hợp' : 'Chưa có dữ liệu chủ đề'}
          description={shared.length ? undefined : 'Chạy “npm run crawl” trong thư mục backend để crawl và nạp bộ từ.'}
        />
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((t) => {
            const c = colorOf(t.color);
            const progress = t.wordCount ? t.mastered / t.wordCount : 0;
            const levels = Object.entries(t.levels ?? {}).sort(([a], [b]) => a.localeCompare(b));
            return (
              <Link key={t.slug} to={`/topics/${t.slug}`} className="card card-hover group relative overflow-hidden p-5">
                {/* Dải màu nhạt của chủ đề ở đầu thẻ + ảnh 3D lớn ở góc: thẻ có "bìa" riêng, nhận ra chủ đề trong nháy mắt */}
                <div aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-28 bg-linear-to-b to-transparent', c.tint)} />
                <Emoji3D
                  emoji={t.icon}
                  size={76}
                  className="absolute right-3 top-3 rotate-[8deg] drop-shadow-[0_10px_12px_rgb(28_27_26/0.18)] transition-transform duration-300 group-hover:rotate-0 group-hover:scale-110"
                />
                {/* Phần đầu cao bằng ảnh 3D để mô tả bên dưới không bị ảnh đè */}
                <div className="relative min-h-19 min-w-0 pr-22">
                  <h3 className="line-clamp-2 text-lg leading-snug font-extrabold text-balance text-ink">{t.name}</h3>
                  <p className={cn('mt-0.5 text-sm leading-snug font-semibold', c.text)}>{t.nameVi}</p>
                </div>
                <p className="relative mt-2 line-clamp-2 min-h-10 text-sm text-muted">{t.description}</p>
                <div className="relative mt-3 flex flex-wrap gap-1">
                  {levels.map(([lv, n]) => (
                    <span key={lv} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
                      {lv} · {n}
                    </span>
                  ))}
                </div>
                <div className="relative mt-4">
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
      {creating && <TopicForm open onClose={() => setCreating(false)} onSaved={(t) => navigate(`/topics/${t.slug}`)} />}
    </div>
  );
}
