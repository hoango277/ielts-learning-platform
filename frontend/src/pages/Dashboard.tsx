import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookMarked, Clock, Compass, Flame, Layers, Mic, PenLine, Shapes, Sparkles, Target, Trophy } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ForecastBars, Heatmap, StatusBreakdown, WeekBars } from '../components/charts/Charts';
import { LinkButton } from '../components/ui/Button';
import { Card, CountUp, ErrorBox, Progress, Ring, SectionTitle, Skeleton } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { AudioButton, LevelBadge, StatusBadge } from '../components/word/bits';
import { api } from '../lib/api';
import type { Overview } from '../lib/types';
import { cn, formatTime, greeting, posLabel, relativeTime } from '../lib/utils';
import { TodayCard } from './Today';

function Hero({ o }: { o: Overview }) {
  const pct = o.today.goal ? o.today.xp / o.today.goal : 0;
  const due = o.review.dueNow + o.review.newAvailable;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-brand-animated p-6 text-white shadow-glow sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 animate-float-slow rounded-full bg-white/15 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 animate-float-slow rounded-full bg-amber-300/30 blur-3xl [animation-delay:-4s]" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-semibold text-white/80">{greeting()} 👋</p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight sm:text-3xl">
            {o.streak.todayDone ? 'Tuyệt vời! Hôm nay bạn đã học rồi 🎉' : o.streak.current > 0 ? `Giữ chuỗi ${o.streak.current} ngày nhé!` : 'Bắt đầu chuỗi học đầu tiên nào!'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur">
              <Flame className={cn('h-4 w-4 origin-bottom', o.streak.todayDone && 'animate-flicker fill-amber-300 text-amber-300')} /> {o.streak.current} ngày liên tiếp
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold backdrop-blur">
              <Trophy className="h-4 w-4" /> Kỷ lục {o.streak.best} ngày
            </span>
          </div>
          <div className="mt-5 max-w-sm">
            <div className="mb-1.5 flex justify-between text-xs font-semibold text-white/85">
              <span>Cấp {o.level.level}</span>
              <span>
                {o.level.current}/{o.level.needed} XP → cấp {o.level.level + 1}
              </span>
            </div>
            <Progress value={o.level.current / o.level.needed} className="h-2.5 bg-white/20" barClassName="bg-white" />
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Ring value={pct} size={112} stroke={11} color="#ffffff" trackClass="stroke-white/20">
            <div className="text-center">
              <p className="font-display text-3xl font-black">
                <CountUp value={o.today.xp} />
              </p>
              <p className="text-xs font-semibold text-white/80">/ {o.today.goal} XP</p>
            </div>
          </Ring>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="flex items-center gap-1 text-sm font-semibold text-white/85">
              Mục tiêu hôm nay <Term k="xp" icon className="text-white/80 hover:bg-white/20 hover:text-white dark:hover:text-white" />
            </p>
            <LinkButton to="/review" className="w-full whitespace-nowrap bg-white text-violet-700 hover:bg-white/90 sm:w-auto" size="lg" icon={<Layers className="h-5 w-5" />}>
                {due ? `Ôn tập (${due})` : 'Đã ôn xong'}
              </LinkButton>
          </div>
        </div>
      </div>
    </section>
  );
}

const ACTIONS = [
  { to: '/review', title: 'Ôn tập thẻ', desc: 'Ôn lại đúng lúc sắp quên', icon: Layers, tone: 'from-violet-500 to-fuchsia-500' },
  { to: '/explore', title: 'Xem & nói đuổi', desc: 'Học qua video YouTube', icon: Compass, tone: 'from-rose-500 to-orange-400' },
  { to: '/practice', title: 'Luyện tập', desc: 'Trắc nghiệm, điền từ, nghe', icon: Target, tone: 'from-amber-500 to-yellow-400' },
  { to: '/topics', title: 'Bộ từ chủ đề', desc: '26 chủ đề IELTS', icon: Shapes, tone: 'from-emerald-500 to-teal-400' },
];

function TodayStats({ o }: { o: Overview }) {
  const items: { key: string; icon: typeof Layers; label: ReactNode; value: number | string; color: string }[] = [
    { key: 'reviews', icon: Layers, label: 'Lượt ôn thẻ', value: o.today.reviews, color: 'text-violet-500' },
    { key: 'new', icon: BookMarked, label: 'Từ mới', value: o.today.newWords, color: 'text-sky-500' },
    { key: 'practice', icon: Target, label: 'Câu luyện đúng', value: `${o.today.practiceCorrect}/${o.today.practiceTotal}`, color: 'text-amber-500' },
    { key: 'shadow', icon: Mic, label: <Term k="shadowing">Câu nói đuổi</Term>, value: o.today.shadowSentences, color: 'text-fuchsia-500' },
    { key: 'dictation', icon: PenLine, label: <Term k="dictation">Câu chép chính tả</Term>, value: o.today.dictationSentences, color: 'text-orange-500' },
    { key: 'watch', icon: Clock, label: 'Phút xem video', value: o.today.watchMinutes, color: 'text-rose-500' },
  ];
  return (
    <section aria-label="Hôm nay bạn đã làm được">
      <div className="stagger grid grid-cols-3 gap-3 sm:grid-cols-6">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Card key={it.key} className="p-3 text-center">
              <span className={cn('mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-current/10', it.color)}>
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-1.5 font-display text-2xl font-black text-ink">{typeof it.value === 'number' ? <CountUp value={it.value} /> : it.value}</p>
              <p className="text-xs leading-snug text-muted">{it.label}</p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function WordOfDay({ o }: { o: Overview }) {
  const w = o.wordOfTheDay;
  if (!w) return null;
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-300/30 blur-2xl" />
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300">
        <Sparkles className="h-4 w-4" /> Từ của ngày
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h3 className="text-2xl font-extrabold text-ink">{w.word}</h3>
        <AudioButton term={w.word} audio={w.audioUs ?? w.audio} />
        <LevelBadge level={w.level} />
      </div>
      <p className="text-sm text-muted">
        <span className="font-ipa">{w.ipaUs ?? w.ipa}</span> {w.pos && `· ${posLabel(w.pos)}`}
      </p>
      <p className="mt-2 font-semibold text-ink">{w.meaning}</p>
      {w.examples[0] && (
        <p className="mt-2 text-sm italic text-muted">
          “{w.examples[0].en}”{w.examples[0].vi && <span className="mt-0.5 block not-italic">{w.examples[0].vi}</span>}
        </p>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const { data: o, error, refetch, isPending } = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (isPending || !o)
    return (
      <div className="space-y-5">
        <Skeleton className="h-56 rounded-3xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <Hero o={o} />

      <TodayCard />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.to} to={a.to} className="card card-hover group relative overflow-hidden p-4">
              <span
                className={cn(
                  'icon-tile mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br text-white transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110',
                  a.tone,
                )}
              >
                <Icon className="h-6 w-6" />
              </span>
              <p className="font-display text-[17px] font-extrabold text-ink">{a.title}</p>
              <p className="text-xs text-muted">{a.desc}</p>
              <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-ink" />
            </Link>
          );
        })}
      </div>

      <TodayStats o={o} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {o.continueWatching.length > 0 && (
            <section>
              <SectionTitle
                title="Tiếp tục học"
                subtitle="Video bạn đang xem dở"
                action={
                  <Link to="/library" className="text-sm font-semibold text-violet-600 hover:underline dark:text-violet-300">
                    Thư viện →
                  </Link>
                }
              />
              <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
                {o.continueWatching.map((v) => (
                  <Link key={v.id} to={`/watch/${v.id}`} className="group w-64 shrink-0">
                    <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface-3 shadow-card transition-shadow group-hover:shadow-lift">
                      <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                      <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 text-xs font-semibold text-white">
                        {formatTime(v.lastPosition)} / {formatTime(v.durationSec)}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/30">
                        <div className="h-full bg-rose-500" style={{ width: `${v.progress * 100}%` }} />
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold text-ink group-hover:text-violet-600">{v.title}</p>
                    <p className="text-xs text-muted">
                      {v.wordCount} từ đã lưu · {relativeTime(v.lastWatchedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}

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
          <WordOfDay o={o} />

          <Card className="p-5">
            <SectionTitle
              title={
                <>
                  Sổ từ vựng <Term k="statuses" icon />
                </>
              }
              subtitle={`${o.totals.words} từ`}
              action={
                <Link to="/notebook" className="text-sm font-semibold text-violet-600 hover:underline dark:text-violet-300">
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

          <Card className="p-5">
            <SectionTitle title="Thành tích" subtitle={`${o.achievements.filter((a) => a.achieved).length}/${o.achievements.length} huy hiệu`} />
            <div className="grid grid-cols-5 gap-2">
              {o.achievements.map((a) => (
                <div
                  key={a.key}
                  title={`${a.title} — ${a.desc} (${a.progress}/${a.target})`}
                  className={cn(
                    'flex aspect-square cursor-default flex-col items-center justify-center rounded-2xl text-2xl transition-transform duration-200 hover:scale-110',
                    a.achieved
                      ? 'bg-linear-to-br from-amber-100 to-orange-100 shadow-[inset_0_-3px_0_rgb(251_146_60/0.35),0_4px_10px_-4px_rgb(251_146_60/0.6)] dark:from-amber-500/25 dark:to-orange-500/15'
                      : 'bg-surface-2 opacity-45 grayscale',
                  )}
                >
                  {a.icon}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

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
