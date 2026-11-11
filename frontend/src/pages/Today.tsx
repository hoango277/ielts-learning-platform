import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { Check, ChevronRight, Clock, Headphones, Layers, Mic, RefreshCw, SkipForward, Timer, Undo2, Waves } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Card, ErrorBox, Progress, Ring, Segmented, Skeleton } from '../components/ui/primitives';
import { DifficultyPill } from '../components/video/DifficultyBadge';
import { api } from '../lib/api';
import type { TodayPlan, TodayStep, TodayStepKey } from '../lib/types';
import { cn, formatTime } from '../lib/utils';

const STEP_ICON: Record<TodayStepKey, { icon: typeof Layers; tone: string; strand: string }> = {
  review: { icon: Layers, tone: 'from-fuchsia-500 to-violet-500', strand: 'Học có chủ đích' },
  watch: { icon: Headphones, tone: 'from-rose-500 to-orange-400', strand: 'Nghe hiểu' },
  shadow: { icon: Waves, tone: 'from-sky-500 to-indigo-500', strand: 'Phát âm & ngữ điệu' },
  speak: { icon: Mic, tone: 'from-emerald-500 to-teal-400', strand: 'Nói ra (output)' },
  fluency: { icon: Timer, tone: 'from-amber-500 to-orange-500', strand: 'Trôi chảy' },
};

export function useTodayPlan() {
  return useQuery({ queryKey: ['today'], queryFn: api.today, staleTime: 15_000 });
}

/** Thẻ gọn ở Trang chủ: tiến độ + bước tiếp theo. */
export function TodayCard() {
  const { data } = useTodayPlan();
  if (!data) return <Skeleton className="h-28 rounded-3xl" />;
  const next = data.steps.find((s) => !s.done && !s.skipped && !s.blocked) ?? data.steps.find((s) => !s.done && !s.skipped);
  return (
    <Card className="flex flex-wrap items-center gap-4 p-5">
      <Ring value={data.total ? data.finished / data.total : 0} size={72} stroke={8}>
        <span className="text-sm font-extrabold text-ink">
          {data.finished}/{data.total}
        </span>
      </Ring>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-500">Hôm nay học gì · ~{data.estimatedMinutes} phút</p>
        <p className="text-lg font-extrabold text-ink">{data.allDone ? 'Đã xong buổi học hôm nay 🎉' : next ? next.title : 'Tiếp tục'}</p>
        <p className="truncate text-sm text-muted">{data.allDone ? 'Muốn học thêm? Thử một lượt 4/3/2 hoặc luyện nói lại.' : next?.desc}</p>
      </div>
      <div className="flex gap-2">
        {next && !data.allDone && (
          <LinkButton to={next.link} variant="primary">
            Bắt đầu
          </LinkButton>
        )}
        <LinkButton to="/today" variant="outline" icon={<ChevronRight className="h-4 w-4" />}>
          Xem kế hoạch
        </LinkButton>
      </div>
    </Card>
  );
}

function StepRow({ step, index, onSkip, children }: { step: TodayStep; index: number; onSkip: (skipped: boolean) => void; children?: React.ReactNode }) {
  const meta = STEP_ICON[step.key];
  const Icon = meta.icon;
  const finished = step.done || step.skipped;
  return (
    <li className={cn('card relative flex gap-4 p-4 sm:p-5', finished && 'opacity-75')}>
      <div className="flex flex-col items-center">
        <span
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md',
            step.done ? 'bg-emerald-500' : step.skipped ? 'bg-slate-400' : cn('bg-linear-to-br', meta.tone),
          )}
        >
          {step.done ? <Check className="h-6 w-6" /> : step.skipped ? <SkipForward className="h-5 w-5" /> : <Icon className="h-6 w-6" />}
        </span>
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
  useEffect(() => {
    if (allDone) confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 } });
  }, [allDone]);

  if (plan.error) return <ErrorBox error={plan.error} onRetry={() => plan.refetch()} />;
  if (plan.isPending) return <Skeleton className="mx-auto h-[600px] max-w-3xl rounded-3xl" />;
  const p = plan.data;
  const dayLabel = new Date(`${p.day}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-brand p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <p className="text-sm font-semibold capitalize text-white/80">{dayLabel}</p>
        <h1 className="text-2xl font-extrabold sm:text-3xl">Hôm nay học gì? 🗓️</h1>
        <p className="mt-1 max-w-xl text-sm text-white/90">
          Một buổi cân bằng: ôn thẻ, nghe một video vừa sức, nói đuổi, nói lại câu đã lưu và luyện trôi chảy. Xong bước nào app tự đánh dấu.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
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
        <Card className="p-5 text-center">
          <p className="text-4xl">🏆</p>
          <p className="mt-1 text-lg font-extrabold text-ink">Hoàn thành buổi học hôm nay!</p>
          <p className="text-sm text-muted">Hẹn gặp lại ngày mai — học đều mỗi ngày hiệu quả hơn học dồn.</p>
        </Card>
      )}

      <ol className="space-y-3">
        {p.steps.map((s, i) => (
          <StepRow key={s.key} step={s} index={i} onSkip={(skipped) => skip.mutate({ step: s.key, skipped })}>
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
        Thiết kế theo khung “bốn mảng” của Paul Nation: nghe/đọc có nghĩa, nói/viết có nghĩa, học có chủ đích về ngôn ngữ và luyện trôi chảy — mỗi mảng nên chiếm khoảng 1/4 thời
        gian học.
      </p>

      <VideoPicker open={picking} onClose={() => setPicking(false)} onPick={(id) => pickVideo.mutate(id)} />
    </div>
  );
}
