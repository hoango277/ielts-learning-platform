import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gauge, Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, LinkButton } from '../../components/ui/Button';
import { EmptyState, Progress, Ring, Skeleton } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { coveragePct, DIFF_META } from '../../components/video/DifficultyBadge';
import { LevelBadge } from '../../components/word/bits';
import { api } from '../../lib/api';
import { cn, formatTime } from '../../lib/utils';

export function useVideoDifficulty(videoId: string) {
  return useQuery({
    queryKey: ['video-difficulty', videoId],
    queryFn: () => api.videoDifficulty(videoId),
    staleTime: 60_000,
    // Đang phân tích ở máy chủ → hỏi lại mỗi 2 giây
    refetchInterval: (q) => (q.state.data?.status === 'analyzing' ? 2000 : false),
  });
}

/** Nút nhỏ trên thanh điều khiển: "Biết 96% · Vừa sức". */
export function DifficultyChip({ videoId, onClick }: { videoId: string; onClick: () => void }) {
  const { data } = useVideoDifficulty(videoId);
  if (!data || data.status === 'unavailable' || data.status === 'error') return null;
  if (data.status === 'analyzing')
    return (
      <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-xs font-semibold text-muted">
        <Gauge className="h-4 w-4 animate-pulse" /> Đang đo độ khó…
      </button>
    );
  const m = DIFF_META[data.label];
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold', m.className)} title={m.desc}>
      <Gauge className="h-4 w-4" /> Biết {coveragePct(data.coverage)} · {m.label}
    </button>
  );
}

/** Bảng "Độ khó": bạn biết bao nhiêu % số từ, các từ mới đáng học trước khi xem. */
export function DifficultyPanel({ videoId, onSeek }: { videoId: string; onSeek: (t: number) => void }) {
  const qc = useQueryClient();
  const { data, isPending } = useVideoDifficulty(videoId);
  const [handled, setHandled] = useState<Record<string, 'learn' | 'known'>>({});

  const add = useMutation({
    mutationFn: ({ word, known, sentence, time }: { word: string; known: boolean; sentence: string | null; time: number | null }) =>
      api.createWord({ term: word, known, context: known ? undefined : (sentence ?? undefined), videoId: known ? undefined : videoId, videoTime: time ?? undefined }),
    onSuccess: (_r, v) => {
      setHandled((h) => ({ ...h, [v.word]: v.known ? 'known' : 'learn' }));
      qc.invalidateQueries({ queryKey: ['word-keys'] });
      qc.invalidateQueries({ queryKey: ['words'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['video-difficulty', videoId] });

  if (isPending) return <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>;
  if (!data || data.status === 'unavailable') return <EmptyState icon="📊" title="Chưa đo được độ khó" description="Video cần có phụ đề tiếng Anh để đếm từ." />;
  if (data.status === 'error') return <EmptyState icon="⚠️" title="Không đo được độ khó" description={data.error} />;
  if (data.status === 'analyzing')
    return (
      <div className="space-y-3 p-6 text-center">
        <Gauge className="mx-auto h-10 w-10 animate-pulse text-brand-500" />
        <p className="font-bold text-ink">Đang đếm từ trong video…</p>
        <p className="text-sm text-muted">Lần đầu phân tích mất khoảng 10–30 giây; video sau sẽ nhanh hơn.</p>
        {data.total > 0 && <Progress value={data.done / data.total} />}
      </div>
    );

  const m = DIFF_META[data.label];
  const pending = data.topNew.filter((w) => !handled[w.word]);
  return (
    <div className="scrollbar-thin h-full space-y-4 overflow-y-auto p-4">
      <div className="flex items-center gap-4">
        <Ring value={data.coverage} size={96} stroke={10}>
          <div className="text-center">
            <p className="text-lg font-extrabold text-ink">{coveragePct(data.coverage)}</p>
            <p className="text-[10px] text-muted">từ đã biết</p>
          </div>
        </Ring>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-1.5">
            <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-sm font-bold', m.className)}>{m.label}</span>
            <Term k="coverage" icon />
          </p>
          <p className="text-sm leading-relaxed text-muted">{m.desc}</p>
          <p className="text-xs text-muted">
            {data.newWords} từ mới · {data.learningWords} từ đang học · <Term k="vocab_level">trình độ nền</Term> {data.vocabLevel}{' '}
            <LinkButton to="/settings#learning" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" icon={<Settings2 className="h-3.5 w-3.5" />}>
              Đổi
            </LinkButton>
            <LinkButton to="/placement" variant="ghost" size="sm" className="h-6 px-1.5 text-xs">
              Test vốn từ
            </LinkButton>
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-ink">Từ mới đáng học trước</p>
          {pending.length > 1 && (
            <Button
              size="sm"
              variant="soft"
              loading={add.isPending}
              onClick={async () => {
                for (const w of pending) await add.mutateAsync({ word: w.word, known: false, sentence: w.sentence, time: w.time }).catch(() => undefined);
                toast.success(`Đã thêm ${pending.length} từ vào sổ để học trước`);
                refresh();
              }}
            >
              Học trước tất cả
            </Button>
          )}
        </div>
        {data.topNew.length === 0 && <p className="text-sm text-muted">Không còn từ mới nào đáng chú ý 🎉</p>}
        <ul className="space-y-1.5">
          {data.topNew.map((w) => {
            const done = handled[w.word];
            return (
              <li key={w.word} className={cn('rounded-xl border border-line p-2.5', done && 'opacity-60')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-ink">{w.word}</span>
                  <LevelBadge level={w.level} />
                  <span className="text-xs text-muted">×{w.count}</span>
                  <span className="ml-auto flex gap-1">
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <Check className="h-3.5 w-3.5" /> {done === 'known' ? 'Đã biết' : 'Đã thêm vào sổ'}
                      </span>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => add.mutate({ word: w.word, known: true, sentence: null, time: null })}>
                          Biết rồi
                        </Button>
                        <Button size="sm" variant="soft" className="h-7 px-2 text-xs" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => add.mutate({ word: w.word, known: false, sentence: w.sentence, time: w.time })}>
                          Học
                        </Button>
                      </>
                    )}
                  </span>
                </div>
                {w.sentence && (
                  <button type="button" onClick={() => w.time != null && onSeek(w.time)} className="mt-1 block text-left text-xs leading-relaxed text-muted hover:text-ink">
                    {w.time != null && <span className="mr-1 font-mono text-brand-600">{formatTime(w.time)}</span>}
                    {w.sentence}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {Object.keys(handled).length > 0 && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={refresh}>
            Tính lại độ khó
          </Button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        Cách tính: những từ phổ biến ứng với trình độ nền của bạn (lấy từ danh sách <Term k="ngsl">NGSL</Term>) cùng các từ bạn đã thuộc hoặc đang ôn trong sổ được coi là “đã
        biết”. Mốc 95–98% dựa trên các nghiên cứu về <Term k="coverage">độ phủ từ vựng</Term> khi nghe hiểu.
      </p>
    </div>
  );
}
