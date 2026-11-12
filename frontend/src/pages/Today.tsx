import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { Check, Clock, RefreshCw, SkipForward, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { Celebration } from '../components/ui/Celebration';
import { Emoji3D } from '../components/ui/Emoji3D';
import { HeroArt } from '../components/ui/HeroArt';
import { Modal } from '../components/ui/Modal';
import { Card, ErrorBox, Progress, Segmented, Skeleton } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { DifficultyPill } from '../components/video/DifficultyBadge';
import { api } from '../lib/api';
import type { TodayPlan, TodayStep, TodayStepKey } from '../lib/types';
import { cn, formatTime, CONFETTI_COLORS } from '../lib/utils';

// Mỗi bước là một "trạm" trên lộ trình hôm nay (ảnh 3D + tên ngắn)
const STEP_META: Record<TodayStepKey, { emoji: string; short: string; strand: string }> = {
  review: { emoji: '🗂️', short: 'Ôn thẻ', strand: 'Học có chủ đích' },
  watch: { emoji: '🎧', short: 'Nghe video', strand: 'Nghe hiểu' },
  shadow: { emoji: '🦜', short: 'Nói đuổi', strand: 'Phát âm & ngữ điệu' },
  speak: { emoji: '🎙️', short: 'Nói lại', strand: 'Tự nói ra' },
  fluency: { emoji: '⏱️', short: 'Trôi chảy', strand: 'Luyện trôi chảy' },
};

export function useTodayPlan() {
  return useQuery({ queryKey: ['today'], queryFn: api.today, staleTime: 15_000 });
}

function nextStep(plan: TodayPlan) {
  return plan.steps.find((s) => !s.done && !s.skipped && !s.blocked) ?? plan.steps.find((s) => !s.done && !s.skipped);
}

/** Trạm trên lộ trình: xong → viền xanh + dấu tích; bỏ qua → mờ; bước kế tiếp → viền thương hiệu nổi bật. */
function Station({ step, current, size = 56 }: { step: TodayStep; current: boolean; size?: number }) {
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full border-2 transition-transform',
        step.done
          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/15'
          : step.skipped
            ? 'border-line bg-surface-2 opacity-55 grayscale'
            : current
              ? 'border-brand-500 bg-surface shadow-[0_0_0_5px_color-mix(in_oklab,var(--color-brand-500)_18%,transparent)]'
              : 'border-line bg-surface-2',
      )}
      style={{ width: size, height: size }}
    >
      <Emoji3D emoji={STEP_META[step.key].emoji} size={Math.round(size * 0.58)} />
      {step.done && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-surface">
          <Check className="h-3 w-3" strokeWidth={3.5} />
        </span>
      )}
      {step.skipped && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-400 text-white ring-2 ring-surface">
          <SkipForward className="h-3 w-3" />
        </span>
      )}
    </span>
  );
}

/** Thẻ ở Trang chủ: lộ trình 5 trạm của buổi học hôm nay + đúng một nút chính cho bước kế tiếp. */
export function TodayCard() {
  const { data } = useTodayPlan();
  if (!data) return <Skeleton className="h-56 rounded-3xl" />;
  const next = nextStep(data);
  const n = data.steps.length;
  // Đường tiến độ chạy từ tâm trạm đầu tới trạm cuối cùng đã xong/bỏ qua
  const lastFinished = data.steps.reduce((acc, s, i) => (s.done || s.skipped ? i : acc), -1);
  const line = n > 1 && lastFinished > 0 ? (lastFinished / (n - 1)) * 100 : 0;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-xl font-extrabold text-ink">Buổi học hôm nay</h2>
        <p className="text-sm font-semibold text-muted">
          {data.finished}/{data.total} bước · khoảng {data.estimatedMinutes} phút
        </p>
      </div>
      <ol className="relative mt-5 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-label="Các bước hôm nay">
        <div aria-hidden="true" className="absolute top-7 h-1 rounded-full bg-surface-3" style={{ left: `${50 / n}%`, right: `${50 / n}%` }} />
        <div
          aria-hidden="true"
          className="absolute top-7 h-1 rounded-full bg-emerald-400 transition-[width] duration-700"
          style={{ left: `${50 / n}%`, width: `calc(${line}% * ${(n - 1) / n})` }}
        />
        {data.steps.map((s) => (
          <li key={s.key} className="relative flex flex-col items-center px-0.5 text-center">
            <Link to={s.link} className="rounded-full transition-transform hover:scale-105" aria-label={`${s.title}${s.done ? ' (đã xong)' : s.skipped ? ' (đã bỏ qua)' : ''}`}>
              <Station step={s} current={next?.key === s.key && !data.allDone} />
            </Link>
            <span className={cn('mt-2 text-xs leading-tight font-semibold', next?.key === s.key && !data.allDone ? 'text-ink' : 'text-muted')}>{STEP_META[s.key].short}</span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-4">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">{data.allDone ? 'Hoàn thành' : 'Bước tiếp theo'}</p>
          <p className="font-extrabold text-ink">{data.allDone ? 'Đã xong buổi học hôm nay 🎉' : (next?.title ?? 'Tiếp tục')}</p>
          <p className="line-clamp-1 text-sm text-muted">{data.allDone ? 'Muốn học thêm? Thử một lượt nói trôi chảy 4/3/2 hoặc luyện nói lại.' : next?.desc}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/today" className="text-sm font-semibold text-muted hover:text-ink hover:underline">
            Xem kế hoạch
          </Link>
          {next && !data.allDone && (
            <LinkButton to={next.link} variant="primary" size="lg">
              {next.value > 0 ? 'Làm tiếp' : 'Bắt đầu'}
            </LinkButton>
          )}
        </div>
      </div>
    </Card>
  );
}

function StepRow({ step, index, current, onSkip, children }: { step: TodayStep; index: number; current: boolean; onSkip: (skipped: boolean) => void; children?: React.ReactNode }) {
  const meta = STEP_META[step.key];
  const finished = step.done || step.skipped;
  return (
    <li className={cn('card relative flex gap-4 p-4 sm:p-5', finished && 'opacity-80', current && 'ring-2 ring-brand-500/40')}>
      <div className="flex flex-col items-center">
        <Station step={step} current={current} />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold text-muted">Bước {index + 1}</p>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{meta.strand}</span>
        </div>
        <p className="text-lg font-extrabold text-ink">{step.title}</p>
        <p className="text-sm text-muted">{step.desc}</p>
        {step.target > 0 && (
          <div className="flex items-center gap-2">
            <Progress value={step.value / step.target} className="max-w-xs" barClassName={step.done ? 'bg-emerald-500' : undefined} />
            <span className="text-xs font-semibold text-muted">
              {step.value}/{step.target} {step.unit}
            </span>
          </div>
        )}
        {children}
        <div className="flex flex-wrap gap-2 pt-1">
          {!finished && (
            <LinkButton to={step.link} variant="primary" size="sm">
              {step.blocked ? 'Đi lưu mẫu câu' : step.value > 0 ? 'Làm tiếp' : 'Bắt đầu'}
            </LinkButton>
          )}
          {step.done && (
            <LinkButton to={step.link} variant="ghost" size="sm">
              Làm thêm
            </LinkButton>
          )}
          {!step.done && (
            <Button size="sm" variant="ghost" icon={step.skipped ? <Undo2 className="h-4 w-4" /> : <SkipForward className="h-4 w-4" />} onClick={() => onSkip(!step.skipped)}>
              {step.skipped ? 'Bỏ qua nhầm — làm lại' : 'Bỏ qua hôm nay'}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function VideoPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const rec = useQuery({
    queryKey: ['recommended'],
    queryFn: api.recommended,
    enabled: open,
    refetchInterval: (q) => (open && (q.state.data?.analyzing ?? 0) > 0 ? 4000 : false),
  });
  const items = [...(rec.data?.fit ?? []), ...(rec.data?.easy ?? []), ...(rec.data?.hard ?? [])];
  return (
    <Modal open={open} onClose={onClose} title="Chọn video cho hôm nay" description="Video vừa sức (biết 95–98% số từ) được xếp lên đầu." size="lg">
      {rec.isPending ? (
        <Skeleton className="h-48" />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {rec.data?.analyzing ? `Đang phân tích độ khó ${rec.data.analyzing} video… danh sách sẽ tự cập nhật.` : 'Chưa có video nào được phân tích. Hãy xem vài video trong mục Khám phá.'}
        </p>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {items.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => onPick(v.id)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2">
                <img src={v.thumbnail} alt="" className="aspect-video w-28 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold text-ink">{v.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <DifficultyPill data={v} /> {v.channelName} · {formatTime(v.durationSec)} {v.watched && '· đã xem'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(rec.data?.analyzing ?? 0) > 0 && items.length > 0 && <p className="mt-2 text-xs text-muted">Đang phân tích thêm {rec.data!.analyzing} video…</p>}
    </Modal>
  );
}

/** Buổi học có hướng dẫn mỗi ngày: ôn thẻ → nghe video vừa sức → nói đuổi → nói lại câu đã lưu → 4/3/2. */
export default function Today() {
  const qc = useQueryClient();
  const plan = useTodayPlan();
  const [picking, setPicking] = useState(false);
  const setData = (p: TodayPlan) => qc.setQueryData(['today'], p);
  const skip = useMutation({ mutationFn: ({ step, skipped }: { step: TodayStepKey; skipped: boolean }) => api.skipTodayStep(step, skipped), onSuccess: setData });
  const pickVideo = useMutation({
    mutationFn: (id: string) => api.setTodayVideo(id),
    onSuccess: (p) => {
      setData(p);
      setPicking(false);
      toast.success('Đã đổi video hôm nay');
    },
  });
  const mode = useMutation({
    mutationFn: (m: 'short' | 'standard') => api.updateSettings({ dailyPlanMode: m }),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      qc.invalidateQueries({ queryKey: ['today'] });
    },
  });

  const allDone = plan.data?.allDone;
  const day = plan.data?.day;
  // Chúc mừng một lần mỗi ngày (không bắn pháo giấy mỗi lần mở lại trang)
  useEffect(() => {
    if (!allDone || !day) return;
    const key = `today-celebrated:${day}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      /* không lưu được → vẫn chúc mừng */
    }
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 }, colors: CONFETTI_COLORS });
  }, [allDone, day]);

  if (plan.error) return <ErrorBox error={plan.error} onRetry={() => plan.refetch()} />;
  if (plan.isPending) return <Skeleton className="mx-auto h-[600px] max-w-3xl rounded-3xl" />;
  const p = plan.data;
  const dayLabel = new Date(`${p.day}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-hero p-6 text-white shadow-glow sm:p-8">
        <HeroArt items={['🗓️', '🎧', '🌱']} />
        <p className="relative text-sm font-semibold capitalize text-white/80">{dayLabel}</p>
        <h1 className="pr-14 xl:pr-0 relative text-2xl font-black sm:text-3xl">Hôm nay học gì?</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/90">5 trạm cân bằng nghe – nói – từ vựng. Xong bước nào app tự đánh dấu.</p>
        <div className="relative mt-4 flex flex-wrap items-center gap-3">
          <Segmented
            value={p.mode}
            onChange={(m) => mode.mutate(m)}
            className="bg-white/20 [&>button]:text-white [&>button[aria-checked=true]]:text-ink"
            options={[
              { value: 'short', label: <><Clock className="h-4 w-4" /> Ngắn ~20 phút</> },
              { value: 'standard', label: <><Clock className="h-4 w-4" /> Chuẩn ~40 phút</> },
            ]}
          />
          <span className="rounded-xl bg-white/20 px-3 py-1.5 text-sm font-bold">
            {p.finished}/{p.total} bước
          </span>
        </div>
      </section>

      {p.allDone && (
        <Card className="p-2">
          <Celebration emoji="🏆" title="Hoàn thành buổi học hôm nay!" description="Hẹn gặp lại ngày mai — học đều mỗi ngày hiệu quả hơn học dồn." />
        </Card>
      )}

      {/* Lộ trình dọc: đường nối chạy sau các thẻ, chỉ lộ ra ở khe giữa các trạm */}
      <ol className="stagger relative space-y-3">
        <div aria-hidden="true" className="absolute bottom-10 left-10.5 top-10 w-1 rounded-full bg-surface-3 sm:left-11.5" />
        {p.steps.map((s, i) => (
          <StepRow key={s.key} step={s} index={i} current={!p.allDone && nextStep(p)?.key === s.key} onSkip={(skipped) => skip.mutate({ step: s.key, skipped })}>
            {s.key === 'watch' && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-2.5">
                {p.video ? (
                  <Link to={`/watch/${p.video.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <img src={p.video.thumbnail} alt="" className="aspect-video w-28 shrink-0 rounded-lg object-cover" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-semibold text-ink">{p.video.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {p.video.difficulty && <DifficultyPill data={p.video.difficulty} />}
                        {p.video.channelName}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <p className="flex-1 text-sm text-muted">Chưa có video gợi ý.</p>
                )}
                <Button size="sm" variant="outline" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setPicking(true)}>
                  Đổi video
                </Button>
              </div>
            )}
          </StepRow>
        ))}
      </ol>

      <p className="text-center text-xs text-muted">
        Buổi học chia theo <Term k="four_strands">“bốn mảng”</Term> của nhà ngôn ngữ học Paul Nation: nghe hiểu, tự nói ra, học có chủ đích (từ vựng, phát âm) và luyện trôi chảy
        — mỗi mảng nên chiếm khoảng 1/4 thời gian học.
      </p>

      <VideoPicker open={picking} onClose={() => setPicking(false)} onPick={(id) => pickVideo.mutate(id)} />
    </div>
  );
}
