import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Gauge, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { Card, CountUp, ErrorBox, Kbd, Progress, Skeleton } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { useHotkeys } from '../hooks/useHotkeys';
import { api } from '../lib/api';
import type { PlacementResult } from '../lib/types';
import { cn } from '../lib/utils';

const LEVEL_DESC: Record<PlacementResult['level'], string> = {
  A2: 'Bạn nắm phần lớn ~1.000 từ thông dụng nhất. Nên ưu tiên video dễ, chậm (BBC Learning English, VOA).',
  B1: 'Bạn nắm khoảng 2.000 từ thông dụng nhất — đủ để theo dõi video học tiếng Anh và nhiều video đời thường.',
  B2: 'Bạn nắm gần như toàn bộ 2.800 từ phổ biến nhất và nhiều từ học thuật — hợp với TED, tin tức, podcast.',
  C1: 'Vốn từ rộng, gồm cả từ ít gặp — hầu hết video tiếng Anh đều vừa sức.',
};

function Result({ r, onRetry }: { r: PlacementResult; onRetry: () => void }) {
  const qc = useQueryClient();
  const apply = useMutation({
    mutationFn: () => api.updateSettings({ vocabLevel: r.level }),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      for (const k of ['video-difficulty', 'recommended', 'today', 'difficulty-badges']) qc.invalidateQueries({ queryKey: [k] });
      toast.success(`Đã đặt trình độ nền ${r.level} — độ khó video được tính lại theo mức này`);
    },
  });
  return (
    <Card className="mx-auto max-w-2xl space-y-5 p-6 sm:p-8">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Kết quả ước lượng</p>
        <p className="mt-1 animate-bounce-in font-display text-6xl font-black text-brand-600 dark:text-brand-300">{r.level}</p>
        <p className="mt-1 text-sm text-muted">
          khoảng <CountUp value={r.size} /> từ (ước tính thô) · <Term k="cefr">mức {r.level} nghĩa là gì?</Term>
        </p>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-ink">{LEVEL_DESC[r.level]}</p>
      </div>
      {r.warning && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">⚠️ {r.warning}</p>}
      <div className="space-y-2">
        {r.bands.map((b) => (
          <div key={b.key} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-ink">{b.label}</span>
              <span className="text-muted">
                chọn “Biết” {b.known}/{b.total} · sau khi trừ đoán mò {Math.round(b.corrected * 100)}%
              </span>
            </div>
            <Progress value={b.corrected} barClassName={b.corrected >= 0.8 ? 'bg-emerald-500' : b.corrected >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'} />
          </div>
        ))}
        <p className="text-xs text-muted">
          Tỉ lệ chọn “Biết” cho <Term k="pseudoword">từ giả</Term>: {Math.round(r.falseAlarm * 100)}% — dùng để trừ phần đoán mò.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" loading={apply.isPending} disabled={apply.isSuccess} icon={<Check className="h-4 w-4" />} onClick={() => apply.mutate()}>
          {apply.isSuccess ? `Đang dùng mức ${r.level}` : `Dùng mức ${r.level} cho app`}
        </Button>
        <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={onRetry}>
          Làm lại
        </Button>
        <LinkButton to="/explore" variant="ghost">
          Xem video vừa sức
        </LinkButton>
      </div>
    </Card>
  );
}

/**
 * Bài test vốn từ ~3 phút: 40 từ thật theo 5 mức tần suất + 12 từ giả.
 * Người học chỉ cần chọn "Biết" (hiểu nghĩa) hoặc "Không biết"; từ giả giúp trừ phần đoán mò.
 */
export default function Placement() {
  const [round, setRound] = useState(0);
  const [started, setStarted] = useState(false);
  const test = useQuery({ queryKey: ['placement-test', round], queryFn: api.placementTest, enabled: started, staleTime: Infinity, gcTime: 0 });
  const [answers, setAnswers] = useState<{ word: string; known: boolean }[]>([]);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: (all: { word: string; known: boolean }[]) => api.placementResult({ answers: all, apply: false }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ['placement-last'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = test.data?.items ?? [];
  const idx = answers.length;
  const word = items[idx];
  const answer = (known: boolean) => {
    if (!word || submit.isPending) return;
    const next = [...answers, { word, known }];
    setAnswers(next);
    if (next.length === items.length) submit.mutate(next);
  };
  useHotkeys(started && word ? { ArrowRight: () => answer(true), j: () => answer(true), ArrowLeft: () => answer(false), f: () => answer(false) } : {});

  const restart = () => {
    setAnswers([]);
    setResult(null);
    setRound((r) => r + 1);
  };

  if (result) return <Result r={result} onRetry={restart} />;

  if (!started)
    return (
      <Card className="mx-auto max-w-2xl space-y-4 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="icon-tile flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-400 to-emerald-600 text-white">
            <Gauge className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-ink">Bài test vốn từ</h1>
            <p className="text-sm text-muted">Khoảng 3 phút · 52 từ</p>
          </div>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
          <li>Mỗi lượt hiện một từ tiếng Anh. Chọn <b>Biết</b> nếu bạn hiểu nghĩa của từ, <b>Không biết</b> nếu không chắc.</li>
          <li>
            Có lẫn một số <Term k="pseudoword">từ không có thật</Term>. Chọn “Biết” cho từ giả sẽ làm điểm bị trừ — vì vậy hãy trả lời thật lòng.
          </li>
          <li>Kết quả dùng để tính độ khó video và gợi ý video vừa sức (bạn có thể đổi lại trong Cài đặt).</li>
        </ul>
        <p className="text-xs text-muted">
          Phương pháp: bài test “Biết / Không biết” có trộn từ giả (Meara & Buxton, 1987; tương tự LexTALE). Từ được chọn theo 5 nhóm từ phổ biến đến ít gặp, lấy từ danh sách{' '}
          <Term k="ngsl">NGSL</Term> và bộ từ chủ đề.
        </p>
        <Button size="lg" variant="primary" className="w-full" onClick={() => setStarted(true)}>
          Bắt đầu
        </Button>
      </Card>
    );

  if (test.error) return <ErrorBox error={test.error} onRetry={() => test.refetch()} />;
  if (test.isPending) return <Skeleton className="mx-auto h-80 max-w-2xl rounded-3xl" />;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Progress value={idx / Math.max(1, items.length)} className="flex-1" />
        <span className="text-sm font-semibold text-muted">
          {Math.min(idx + 1, items.length)}/{items.length}
        </span>
      </div>
      <Card className="flex min-h-64 flex-col items-center justify-center gap-6 p-8">
        {submit.isError && !word ? (
          // Gửi kết quả lỗi (mất mạng, máy chủ lỗi…) → giữ nguyên câu trả lời, cho gửi lại
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="font-semibold text-ink">Chưa tính được kết quả.</p>
            {submit.error.message && <p className="text-sm text-rose-500">{submit.error.message}</p>}
            <p className="text-sm text-muted">Câu trả lời của bạn vẫn được giữ lại — bấm Thử lại để gửi lần nữa.</p>
            <Button variant="primary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => submit.mutate(answers)}>
              Thử lại
            </Button>
          </div>
        ) : submit.isPending || !word ? (
          <p className="text-muted">Đang tính kết quả…</p>
        ) : (
          <>
            <p key={word} className="animate-pop font-display text-5xl font-black tracking-tight text-ink">
              {word}
            </p>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 pb-1">
              <button
                type="button"
                onClick={() => answer(false)}
                className={cn('press flex flex-col items-center gap-1 rounded-2xl border-2 border-line bg-surface py-4 font-display font-extrabold text-ink [--edge:var(--border)] hover:border-rose-300 hover:[--edge:var(--color-rose-300)]')}
              >
                <X className="h-6 w-6 text-rose-500" /> Không biết
                <span className="text-[11px] font-normal text-muted">
                  <Kbd>←</Kbd> / <Kbd>F</Kbd>
                </span>
              </button>
              <button
                type="button"
                onClick={() => answer(true)}
                className="press flex flex-col items-center gap-1 rounded-2xl border-2 border-emerald-400 bg-emerald-50 py-4 font-display font-extrabold text-emerald-800 [--edge:var(--color-emerald-400)] hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-200 dark:[--edge:var(--color-emerald-700)]"
              >
                <Check className="h-6 w-6" /> Biết
                <span className="text-[11px] font-normal opacity-80">
                  <Kbd>→</Kbd> / <Kbd>J</Kbd>
                </span>
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
