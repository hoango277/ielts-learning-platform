import { useQuery } from '@tanstack/react-query';
import { BookMarked, Clock, Layers, Mic, PenLine, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ForecastBars, Heatmap, StatusBreakdown, WeekBars } from '../components/charts/Charts';
import { Emoji3D } from '../components/ui/Emoji3D';
import { Card, CountUp, ErrorBox, Progress as Bar, SectionTitle, Skeleton } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { StatusBadge } from '../components/word/bits';
import { api } from '../lib/api';
import type { Overview } from '../lib/types';
import { cn, relativeTime } from '../lib/utils';

/** 4 con số tổng quan (đọc trong một cái liếc) — chi tiết nằm ở các thẻ bên dưới */
function Kpis({ o }: { o: Overview }) {
  const achieved = o.achievements.filter((a) => a.achieved).length;
  const items: { emoji: string; value: ReactNode; label: ReactNode; hint?: string }[] = [
    { emoji: '🔥', value: <CountUp value={o.streak.current} />, label: 'ngày liên tiếp', hint: `Kỷ lục ${o.streak.best} ngày` },
    { emoji: '⭐', value: <>Cấp {o.level.level}</>, label: <><CountUp value={o.level.totalXp} /> <Term k="xp">XP</Term></>, hint: `${o.level.current}/${o.level.needed} XP tới cấp ${o.level.level + 1}` },
    { emoji: '📚', value: <CountUp value={o.totals.words} />, label: 'từ trong sổ', hint: `${o.review.dueToday} thẻ đến hạn hôm nay` },
    { emoji: '🏅', value: `${achieved}/${o.achievements.length}`, label: 'huy hiệu' },
  ];
  return (
    <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it, i) => (
        <Card key={i} className="flex items-center gap-3 p-4">
          <Emoji3D emoji={it.emoji} size={44} />
          <div className="min-w-0">
            <p className="font-display text-2xl font-black leading-tight text-ink">{it.value}</p>
            <p className="text-sm text-muted">{it.label}</p>
            {it.hint && <p className="truncate text-xs text-muted/80">{it.hint}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TodayStats({ o }: { o: Overview }) {
  const items: { key: string; icon: typeof Layers; label: ReactNode; value: number | string }[] = [
    { key: 'reviews', icon: Layers, label: 'Lượt ôn thẻ', value: o.today.reviews },
    { key: 'new', icon: BookMarked, label: 'Từ mới', value: o.today.newWords },
    { key: 'practice', icon: Target, label: 'Câu luyện đúng', value: `${o.today.practiceCorrect}/${o.today.practiceTotal}` },
    { key: 'shadow', icon: Mic, label: <Term k="shadowing">Câu nói đuổi</Term>, value: o.today.shadowSentences },
    { key: 'dictation', icon: PenLine, label: <Term k="dictation">Câu chép chính tả</Term>, value: o.today.dictationSentences },
    { key: 'watch', icon: Clock, label: 'Phút xem video', value: o.today.watchMinutes },
  ];
  return (
    <Card className="p-5">
      <SectionTitle title="Hôm nay" subtitle={`${o.today.xp}/${o.today.goal} XP mục tiêu ngày`} />
      <div className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div key={it.key} className="text-center">
              <Icon className="mx-auto h-5 w-5 text-brand-500" />
              <p className="mt-1 font-display text-2xl font-black text-ink">{typeof it.value === 'number' ? <CountUp value={it.value} /> : it.value}</p>
              <p className="text-xs leading-snug text-muted">{it.label}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Huy hiệu dạng huy chương 3D: thấy rõ điều kiện đạt và còn thiếu bao nhiêu */
function Achievements({ o }: { o: Overview }) {
  const achieved = o.achievements.filter((a) => a.achieved).length;
  return (
    <section>
      <SectionTitle title="Huy hiệu" subtitle={`Đã đạt ${achieved}/${o.achievements.length}`} />
      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {o.achievements.map((a) => (
          <Card key={a.key} className={cn('flex items-center gap-3 p-4 xl:flex-col xl:text-center', !a.achieved && 'bg-surface-2/60 shadow-none')}>
            <span
              className={cn(
                'flex h-16 w-16 shrink-0 items-center justify-center rounded-full',
                a.achieved
                  ? 'bg-linear-to-br from-amber-100 to-orange-100 shadow-[inset_0_-3px_0_color-mix(in_oklab,var(--color-orange-400)_35%,transparent)] ring-2 ring-amber-300 dark:from-amber-500/25 dark:to-orange-500/15 dark:ring-amber-500/50'
                  : 'bg-surface-3/70',
              )}
            >
              <Emoji3D emoji={a.icon} size={40} className={cn(!a.achieved && 'opacity-45 grayscale')} />
            </span>
            <div className="min-w-0 flex-1 xl:w-full">
              <p className="font-display font-extrabold text-ink">{a.title}</p>
              <p className="text-xs text-muted">{a.desc}</p>
              {a.achieved ? (
                <p className="mt-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">Đã đạt ✓</p>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <Bar value={Math.min(1, a.progress / a.target)} className="h-1.5" barClassName="bg-amber-400" />
                  <span className="shrink-0 text-[11px] font-semibold text-muted">
                    {Math.min(a.progress, a.target)}/{a.target}
                  </span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** Trang Tiến độ: mọi số liệu thống kê (trước đây dồn ở Trang chủ) — tổng quan trước, chi tiết bên dưới. */
export default function ProgressPage() {
  const { data: o, error, refetch, isPending } = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (isPending || !o)
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-ink sm:text-3xl">Tiến độ của bạn</h1>
        <p className="mt-1 text-muted">Bạn đã đi được bao xa — và nên ôn gì tiếp theo.</p>
      </header>

      <Kpis o={o} />
      <TodayStats o={o} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <SectionTitle
              title={
                <>
                  <Term k="xp">Điểm XP</Term> 7 ngày qua
                </>
              }
              subtitle={`Đường nét đứt là mục tiêu ${o.today.goal} XP/ngày`}
            />
            <WeekBars data={o.week} goal={o.today.goal} />
          </Card>
          <Card className="p-5">
            <SectionTitle title="Hoạt động trong năm" subtitle={`Tổng ${o.level.totalXp} XP · ${o.totals.reviews} lượt ôn · ${o.totals.watchMinutes} phút xem`} />
            <Heatmap data={o.heatmap} />
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle
              title={
                <>
                  Sổ từ vựng <Term k="statuses" icon />
                </>
              }
              subtitle={`${o.totals.words} từ`}
              action={
                <Link to="/notebook" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
                  Mở sổ →
                </Link>
              }
            />
            <StatusBreakdown counts={o.statusCounts} />
          </Card>
          <Card className="p-5">
            <SectionTitle
              title={
                <>
                  Lịch ôn 7 ngày tới <Term k="srs" icon />
                </>
              }
              subtitle={`${o.review.dueToday} thẻ đến hạn hôm nay`}
            />
            <ForecastBars data={o.forecast} />
          </Card>
        </div>
      </div>

      <Achievements o={o} />

      {o.recentWords.length > 0 && (
        <section>
          <SectionTitle title="Từ mới lưu gần đây" />
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {o.recentWords.map((w) => (
              <Link key={w.id} to={`/notebook?word=${w.id}`} className="card card-hover flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-ink">{w.term}</span>
                    <StatusBadge status={w.status} />
                  </div>
                  <p className="truncate text-sm text-muted">{w.meaning}</p>
                </div>
                <span className="text-xs text-muted">{relativeTime(w.createdAt)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
