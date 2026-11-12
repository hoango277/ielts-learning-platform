import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Compass, Layers, Play, Shapes, Sparkles, Target } from 'lucide-react';
import { Link } from 'react-router';
import { LinkButton } from '../components/ui/Button';
import { Emoji3D } from '../components/ui/Emoji3D';
import { Card, CountUp, ErrorBox, Progress, Ring, SectionTitle, Skeleton } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { AudioButton, LevelBadge } from '../components/word/bits';
import { api } from '../lib/api';
import type { Overview } from '../lib/types';
import { cn, formatTime, greeting, posLabel, relativeTime } from '../lib/utils';
import { TodayCard } from './Today';

/*
 * Trang chủ chỉ giữ những gì giúp BẮT ĐẦU HỌC NGAY (theo nguyên tắc "tổng quan trước, chi tiết khi cần"):
 * lời chào + chuỗi ngày → lộ trình hôm nay (một nút chính) → video xem dở → 4 lối vào → từ của ngày + tóm tắt tiến độ.
 * Toàn bộ biểu đồ, huy hiệu, lịch ôn… nằm ở trang Tiến độ (/progress).
 */

function Hero({ o }: { o: Overview }) {
  const pct = o.today.goal ? o.today.xp / o.today.goal : 0;
  return (
    <section className="relative overflow-hidden rounded-3xl bg-hero p-6 text-white shadow-glow sm:p-8">
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-semibold text-white/80">{greeting()} 👋</p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight text-balance sm:text-3xl">
            {o.streak.todayDone ? 'Tuyệt vời! Hôm nay bạn đã học rồi 🎉' : o.streak.current > 0 ? `Giữ chuỗi ${o.streak.current} ngày nhé!` : 'Bắt đầu chuỗi học đầu tiên nào!'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-1.5 pr-3 text-sm font-bold">
              <Emoji3D emoji="🔥" size={22} className={cn('origin-bottom', o.streak.todayDone ? 'animate-flicker' : 'opacity-70 grayscale')} /> {o.streak.current} ngày liên tiếp
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-1.5 pr-3 text-sm font-bold">
              <Emoji3D emoji="🏆" size={22} /> Kỷ lục {o.streak.best} ngày
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Ring value={pct} size={104} stroke={10} color="#ffffff" trackClass="stroke-white/20">
            <div className="text-center">
              <p className="font-display text-3xl font-black leading-none">
                <CountUp value={o.today.xp} />
              </p>
              <p className="mt-0.5 text-xs font-semibold text-white/80">/ {o.today.goal} XP</p>
            </div>
          </Ring>
          <p className="flex max-w-24 items-center gap-1 text-sm font-semibold leading-snug text-white/85">
            Mục tiêu hôm nay <Term k="xp" icon className="text-white/80 hover:bg-white/20 hover:text-white dark:hover:text-white" />
          </p>
        </div>
      </div>
    </section>
  );
}

/** Video xem dở: video gần nhất là thẻ lớn (ảnh to, nút "Xem tiếp"), các video khác là danh sách nhỏ bên cạnh. */
function ContinueWatching({ o }: { o: Overview }) {
  const [first, ...rest] = o.continueWatching;
  if (!first) return null;
  return (
    <section>
      <SectionTitle
        title="Xem tiếp"
        subtitle="Video bạn đang học dở"
        action={
          <Link to="/library" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
            Thư viện →
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Link to={`/watch/${first.id}`} className="card card-hover group grid grid-cols-1 overflow-hidden sm:grid-cols-2 lg:col-span-3">
          <div className="relative aspect-video overflow-hidden bg-surface-3">
            <img src={first.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-brand-700 shadow-lift transition group-hover:scale-110">
                <Play className="ml-0.5 h-6 w-6 fill-current" />
              </span>
            </span>
            <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/25">
              <div className="h-full bg-orange-500" style={{ width: `${first.progress * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-col justify-center gap-1.5 p-5">
            <p className="line-clamp-2 font-display text-lg font-extrabold leading-snug text-ink">{first.title}</p>
            <p className="text-sm text-muted">
              Đã xem {formatTime(first.lastPosition)} / {formatTime(first.durationSec)} · {first.wordCount} từ đã lưu
            </p>
            <p className="text-xs text-muted">{relativeTime(first.lastWatchedAt)}</p>
            <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 dark:text-brand-300">
              Xem tiếp <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </span>
          </div>
        </Link>
        {rest.length > 0 && (
          <ul className="space-y-2 lg:col-span-2">
            {rest.slice(0, 3).map((v) => (
              <li key={v.id}>
                <Link to={`/watch/${v.id}`} className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-surface-2">
                  <span className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-surface-3">
                    <img src={v.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-black/25">
                      <span className="block h-full bg-orange-500" style={{ width: `${v.progress * 100}%` }} />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-semibold text-ink group-hover:text-brand-600 dark:group-hover:text-brand-300">{v.title}</span>
                    <span className="text-xs text-muted">{relativeTime(v.lastWatchedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const ACTIONS = [
  {
    to: '/review',
    title: 'Ôn tập thẻ',
    desc: 'Ôn lại đúng lúc sắp quên',
    icon: Layers,
    emoji: '🗂️',
    tint: 'from-brand-100 dark:from-brand-500/20',
    chip: 'bg-brand-500/12 text-brand-700 dark:text-brand-300',
  },
  {
    to: '/explore',
    title: 'Xem & nói đuổi',
    desc: 'Học qua video YouTube',
    icon: Compass,
    emoji: '🎬',
    tint: 'from-rose-100 dark:from-rose-500/20',
    chip: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
  {
    to: '/practice',
    title: 'Luyện tập',
    desc: 'Trắc nghiệm, điền từ, nghe',
    icon: Target,
    emoji: '🎯',
    tint: 'from-amber-100 dark:from-amber-500/20',
    chip: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  {
    to: '/topics',
    title: 'Bộ từ chủ đề',
    desc: '26 chủ đề IELTS',
    icon: Shapes,
    emoji: '📚',
    tint: 'from-emerald-100 dark:from-emerald-500/20',
    chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
];

function Shortcuts() {
  return (
    <section aria-label="Lối vào nhanh">
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.to} to={a.to} className="card card-hover group relative min-h-36 overflow-hidden p-4 sm:min-h-40">
              {/* Nền nhạt cùng tông + vật thể 3D ở góc dưới: mỗi lối vào có "hình minh hoạ" riêng */}
              <div aria-hidden="true" className={cn('absolute inset-0 bg-linear-to-br via-transparent to-transparent', a.tint)} />
              <Emoji3D
                emoji={a.emoji}
                size={88}
                className="absolute -right-2 -bottom-3 size-16 rotate-[-10deg] drop-shadow-[0_10px_12px_rgb(28_27_26/0.2)] transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-110 sm:size-22"
              />
              <div className="relative pr-6">
                <p className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-xl', a.chip)}>
                  <Icon className="h-4.5 w-4.5" />
                </p>
                <p className="font-display text-[17px] font-extrabold leading-snug text-ink">{a.title}</p>
                <p className="mt-0.5 max-w-[70%] text-xs text-muted sm:max-w-44">{a.desc}</p>
              </div>
              <ArrowRight className="absolute right-4 top-4 h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-ink" />
            </Link>
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
    <Card className="relative overflow-hidden p-5 lg:col-span-2">
      <div className="blob absolute -right-10 -top-10 h-36 w-36 text-amber-300/45" />
      <p className="relative flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        <Sparkles className="h-4 w-4" /> Từ của ngày
      </p>
      <div className="relative mt-2 flex flex-wrap items-center gap-2">
        <h3 className="text-2xl font-extrabold text-ink">{w.word}</h3>
        <AudioButton term={w.word} audio={w.audioUs ?? w.audio} />
        <LevelBadge level={w.level} />
      </div>
      <p className="relative text-sm text-muted">
        <span className="font-ipa">{w.ipaUs ?? w.ipa}</span> {w.pos && `· ${posLabel(w.pos)}`}
      </p>
      <p className="relative mt-2 font-semibold text-ink">{w.meaning}</p>
      {w.examples[0] && (
        <p className="relative mt-2 text-sm italic text-muted">
          “{w.examples[0].en}”{w.examples[0].vi && <span className="mt-0.5 block not-italic">{w.examples[0].vi}</span>}
        </p>
      )}
    </Card>
  );
}

/** Tóm tắt tiến độ: 3 con số quan trọng + lối sang trang Tiến độ (chi tiết khi cần) */
function ProgressSummary({ o }: { o: Overview }) {
  const achieved = o.achievements.filter((a) => a.achieved).length;
  return (
    <Card className="flex flex-col p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">Tiến độ của bạn</p>
      <div className="mt-3 flex items-center gap-3">
        <Emoji3D emoji="⭐" size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold text-ink">Cấp {o.level.level}</p>
          <Progress value={o.level.current / o.level.needed} className="mt-1 h-1.5" />
          <p className="mt-1 text-xs text-muted">
            {o.level.current}/{o.level.needed} <Term k="xp">XP</Term> tới cấp {o.level.level + 1}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="font-display text-xl font-black text-ink">{o.totals.words}</p>
          <p className="text-xs text-muted">từ trong sổ</p>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="font-display text-xl font-black text-ink">
            {achieved}/{o.achievements.length}
          </p>
          <p className="text-xs text-muted">huy hiệu</p>
        </div>
      </div>
      <LinkButton to="/progress" variant="ghost" className="mt-3 self-start px-2" icon={<ArrowRight className="h-4 w-4" />}>
        Xem chi tiết
      </LinkButton>
    </Card>
  );
}

export default function Dashboard() {
  const { data: o, error, refetch, isPending } = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (isPending || !o)
    return (
      <div className="space-y-5">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <Hero o={o} />
      <TodayCard />
      <ContinueWatching o={o} />
      <Shortcuts />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <WordOfDay o={o} />
        <ProgressSummary o={o} />
      </div>
    </div>
  );
}
