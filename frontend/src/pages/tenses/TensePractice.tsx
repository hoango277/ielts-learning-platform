import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Keyboard, Lightbulb, Mic, RotateCcw, Square, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { FORM_META, seconds, tenseColor } from '../../components/tenses/meta';
import { Button, LinkButton } from '../../components/ui/Button';
import { Emoji3D } from '../../components/ui/Emoji3D';
import { Card, EmptyState, ErrorBox, Input, Progress, Skeleton } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { AudioButton } from '../../components/word/bits';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useSpeakCapture } from '../../hooks/useSpeakCapture';
import { api } from '../../lib/api';
import { getRecognitionCtor, speak } from '../../lib/speech';
import type { TenseCheckResult, TenseLessonId, TensePracticeMode, TenseSessionItem } from '../../lib/types';
import { cn } from '../../lib/utils';

type ProduceItem = Extract<TenseSessionItem, { kind: 'produce' }>;

interface Outcome {
  item: TenseSessionItem;
  correct: boolean;
  latencyMs: number | null;
  /** 'speak' | 'type' | 'fix' | 'recognize' — chỉ lượt nói mới tính vào phản xạ nói */
  as: 'speak' | 'type' | 'fix' | 'recognize';
  xp: number;
  text?: string;
}

const MODE_TITLE: Record<TensePracticeMode, string> = {
  mixed: 'Trộn thì',
  recognize: 'Nhận ra',
  speak: 'Nói phản xạ',
  type: 'Gõ phản xạ',
  fix: 'Sửa câu sai',
};

/** Mục tiêu thời gian (ms): nói 6 → 4 → 3 giây; gõ 16 → 12 → 9 giây — giảm dần khi trả lời nhanh và đúng liên tiếp */
const SPEAK_STEPS = [6000, 4000, 3000];
const TYPE_STEPS = [16000, 12000, 9000];
const AUTO_MIC_KEY = 'tense-auto-mic';

function median(nums: number[]) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function FormDot({ form, label }: { form: TenseSessionItem['form']; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink">
      <span className="h-2 w-2 rounded-full" style={{ background: tenseColor(form) }} />
      {label ?? FORM_META[form].label}
    </span>
  );
}

// ---------- Câu nhận ra: chọn nghĩa / Có-Không / nghe chọn câu ----------

function RecognizeCard({ item, onAnswered, onNext }: { item: Exclude<TenseSessionItem, ProduceItem>; onAnswered: (o: Omit<Outcome, 'item'>) => void; onNext: () => void }) {
  const shownAt = useRef(performance.now());
  const [pick, setPick] = useState<number | null>(null);
  const [played] = useState(() => (item.kind === 'listen' ? Math.floor(Math.random() * item.options.length) : 0));
  const options = item.kind === 'meaning' ? item.options : item.kind === 'ccq' ? ['Có', 'Không'] : item.options.map((o) => o.text);
  const correctIndex = item.kind === 'meaning' ? item.answer : item.kind === 'ccq' ? (item.answer ? 0 : 1) : played;
  const done = pick !== null;

  const play = () => {
    if (item.kind !== 'listen') return;
    speak(item.options[played].text, { onEnd: () => !done && (shownAt.current = performance.now()) });
  };
  useEffect(() => {
    if (item.kind === 'listen') {
      const t = window.setTimeout(play, 250);
      return () => window.clearTimeout(t);
    }
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (i: number) => {
    if (done) return;
    setPick(i);
    const correct = i === correctIndex;
    const latencyMs = Math.round(performance.now() - shownAt.current);
    api
      .tenseRecognize({ itemId: item.id, correct, latencyMs, answer: options[i] })
      .then((r) => onAnswered({ correct, latencyMs, as: 'recognize', xp: r.xp }))
      .catch(() => onAnswered({ correct, latencyMs, as: 'recognize', xp: 0 }));
  };

  useHotkeys({
    '1': () => choose(0),
    '2': () => choose(1),
    '3': () => options.length > 2 && choose(2),
    '4': () => options.length > 3 && choose(3),
    r: play,
    Enter: () => done && onNext(),
  });

  const sentence = item.kind === 'listen' ? null : item.sentence;
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-muted">
        {item.kind === 'meaning' && (item.question || 'Câu này nói gì? Nhìn động từ, đừng đoán theo từ chỉ thời gian.')}
        {item.kind === 'ccq' && 'Đọc câu rồi trả lời câu hỏi về ý nghĩa:'}
        {item.kind === 'listen' && 'Nghe máy đọc rồi chọn đúng câu bạn nghe được (để ý đuôi động từ và dạng rút gọn):'}
      </p>
      {sentence && (
        <p className="flex items-start gap-1 text-xl font-bold leading-snug text-ink sm:text-2xl">
          <span className="flex-1">{sentence}</span>
          <AudioButton term={sentence} />
        </p>
      )}
      {item.kind === 'ccq' && <p className="rounded-xl bg-surface-2 px-3 py-2 font-semibold text-ink">❓ {item.question}</p>}
      {item.kind === 'listen' && (
        <Button variant="soft" icon={<Volume2 className="h-4 w-4" />} onClick={play}>
          Nghe lại (R)
        </Button>
      )}
      <div className={cn('grid gap-2', item.kind === 'ccq' ? 'grid-cols-2' : 'grid-cols-1')}>
        {options.map((o, i) => {
          const isRight = i === correctIndex;
          return (
            <button
              key={o}
              type="button"
              disabled={done}
              onClick={() => choose(i)}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-left font-semibold transition',
                !done && 'border-line bg-surface hover:border-brand-300 active:scale-[0.99]',
                done && isRight && 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-100',
                done && pick === i && !isRight && 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-500/15 dark:text-rose-100',
                done && !isRight && pick !== i && 'border-line opacity-55',
              )}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-surface-2 font-display text-xs font-black text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">
                {o}
                {done && item.kind === 'listen' && (
                  <span className="mt-0.5 block text-sm font-normal text-muted">
                    {FORM_META[item.options[i].form].label} — {item.options[i].meaning}
                  </span>
                )}
              </span>
              {done && isRight && <Check className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={3} />}
              {done && pick === i && !isRight && <X className="h-5 w-5 shrink-0 text-rose-600" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
      {done && (
        <div className={cn('rounded-2xl p-3 text-sm', pick === correctIndex ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100')}>
          <p className="font-bold">{pick === correctIndex ? 'Chính xác!' : 'Chưa đúng — xem lại ý nghĩa:'}</p>
          <p className="mt-0.5">{item.explain}</p>
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={onNext} autoFocus>
              Tiếp (Enter)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Câu tự nói / gõ / sửa ----------

function Countdown({ startAt, target, running }: { startAt: number | null; target: number; running: boolean }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running || startAt == null) return;
    const iv = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(iv);
  }, [running, startAt]);
  const elapsed = startAt == null ? 0 : Math.max(0, now - startAt);
  const left = Math.max(0, target - elapsed);
  const over = elapsed > target;
  return (
    <div className="flex items-center gap-2 text-sm font-semibold" aria-live="off">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-3">
        <div className={cn('h-full rounded-full', over ? 'bg-orange-500' : 'bg-brand-500')} style={{ width: `${over ? 100 : (left / target) * 100}%` }} />
      </div>
      <span className={over ? 'text-orange-600 dark:text-orange-400' : 'text-muted'}>{over ? 'Hết giờ mục tiêu — cứ nói tiếp' : `${Math.ceil(left / 1000)} s`}</span>
    </div>
  );
}

function ProduceCard({
  item,
  canSpeak,
  speakTarget,
  typeTarget,
  onAnswered,
  onNext,
}: {
  item: ProduceItem;
  canSpeak: boolean;
  speakTarget: number;
  typeTarget: number;
  onAnswered: (o: Omit<Outcome, 'item'>) => void;
  onNext: () => void;
}) {
  const [forceType, setForceType] = useState(false);
  const task = item.task;
  const asSpeak = task === 'speak' && canSpeak && !forceType;
  const mode: 'speak' | 'type' | 'fix' = task === 'fix' ? 'fix' : asSpeak ? 'speak' : 'type';
  const [attempt, setAttempt] = useState(1);
  const [result, setResult] = useState<TenseCheckResult | null>(null);
  const [firstResult, setFirstResult] = useState<TenseCheckResult | null>(null);
  const [text, setText] = useState(task === 'fix' ? (item.wrongSentence ?? '') : '');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const shownAt = useRef(performance.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // --- Nói ---
  const cap = useSpeakCapture();
  const listenAt = useRef<number | null>(null);
  const firstWordAt = useRef<number | null>(null);
  const [heard, setHeard] = useState('');
  const final = result && (result.correct || attempt >= 2 || !result.hint);
  // Đang chờ câu trả lời (sau gợi ý, phải bấm "Sửa lại / Nói lại" mới hiện lại ô nhập / micro)
  const waiting = !result;

  const startMic = async () => {
    if (cap.listening) return;
    firstWordAt.current = null;
    setHeard('');
    const ok = await cap.start();
    if (ok) {
      listenAt.current = performance.now();
      try {
        sessionStorage.setItem(AUTO_MIC_KEY, '1');
      } catch {
        /* bỏ qua */
      }
    }
  };
  // Đã cho phép micro một lần → câu sau tự bật micro ngay khi hiện đề (đo phản xạ chính xác hơn)
  useEffect(() => {
    if (!asSpeak) return;
    let auto = false;
    try {
      auto = sessionStorage.getItem(AUTO_MIC_KEY) === '1';
    } catch {
      auto = false;
    }
    if (auto) void startMic();
  }, [asSpeak]); // eslint-disable-line react-hooks/exhaustive-deps

  // Từ đầu tiên nhận dạng được → mốc "bắt đầu nói"; im lặng 1,3 giây sau khi đã nói → tự dừng
  useEffect(() => {
    if (!cap.listening || !cap.live) return;
    if (firstWordAt.current == null) firstWordAt.current = performance.now();
    const t = window.setTimeout(() => cap.stop(), 1300);
    return () => window.clearTimeout(t);
  }, [cap.live, cap.listening]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cap.result) return;
    setHeard(cap.result);
    const start = listenAt.current ?? shownAt.current;
    const ms = firstWordAt.current != null ? Math.round(firstWordAt.current - start) : null;
    void submit(cap.result, ms);
  }, [cap.result]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (answer: string, latencyMs: number | null) => {
    if (!answer.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.tenseCheck({ itemId: item.id, text: answer, mode, attempt, latencyMs: latencyMs ?? undefined });
      setResult(r);
      if (attempt === 1) {
        setFirstResult(r);
        setLatency(latencyMs);
        if (r.addedCard) setAdded(true);
        onAnswered({ correct: r.correct, latencyMs, as: mode, xp: r.xp, text: answer });
      } else if (r.xp) {
        onAnswered({ correct: false, latencyMs: null, as: mode, xp: r.xp, text: answer });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setAttempt((a) => a + 1);
    setResult(null);
    setHeard('');
    if (mode !== 'speak') window.setTimeout(() => inputRef.current?.focus(), 30);
  };
  const reveal = () => {
    const last = heard || text || item.wrongSentence || '…';
    setAttempt(2);
    void (async () => {
      setBusy(true);
      try {
        setResult(await api.tenseCheck({ itemId: item.id, text: last, mode, attempt: 2 }));
      } finally {
        setBusy(false);
      }
    })();
  };
  const addToReview = async () => {
    try {
      const r = await api.tenseAddCard(item.id);
      setAdded(true);
      toast.success(r.existed ? 'Câu này đã có trong ôn tập' : 'Đã thêm vào ôn tập');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  useHotkeys({
    space: () => {
      if (!asSpeak || final) return;
      if (cap.listening) cap.stop();
      else if (waiting) void startMic();
    },
    Enter: () => final && onNext(),
  });

  const target = asSpeak ? speakTarget : typeTarget;
  const fast = latency != null && latency <= target;
  const ok = result?.correct;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-muted">
          {task === 'fix'
            ? 'Câu này sai thì — sửa lại cho đúng rồi nhấn Enter:'
            : item.cueType === 'translate'
              ? asSpeak
                ? 'Nói câu này bằng tiếng Anh, thật nhanh:'
                : 'Gõ câu này bằng tiếng Anh, thật nhanh:'
              : asSpeak
                ? 'Tình huống — nói một câu tiếng Anh phù hợp:'
                : 'Tình huống — gõ một câu tiếng Anh phù hợp:'}
        </p>
        {task === 'fix' ? (
          <p className="text-xl font-bold leading-snug text-rose-700 line-through decoration-rose-400/60 dark:text-rose-300 sm:text-2xl">{item.wrongSentence}</p>
        ) : (
          <p className="text-xl font-bold leading-snug text-ink sm:text-2xl">{item.cue}</p>
        )}
        {task === 'fix' && <p className="text-sm text-muted">Ý định nói: {item.cue}</p>}
      </div>

      {waiting && (
        <div className="space-y-3">
          {asSpeak ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 p-4">
              <button
                type="button"
                onClick={() => (cap.listening ? cap.stop() : void startMic())}
                disabled={busy}
                className={cn(
                  'press flex h-20 w-20 items-center justify-center rounded-full text-white [--edge:var(--color-brand-800)]',
                  cap.listening ? 'bg-rose-500 [--edge:var(--color-rose-700)]' : 'bg-brand',
                )}
                aria-label={cap.listening ? 'Dừng (Space)' : 'Bắt đầu nói (Space)'}
              >
                {cap.listening ? <Square className="h-7 w-7 fill-current" /> : <Mic className="h-8 w-8" />}
              </button>
              <p className="min-h-6 text-center text-lg font-semibold text-ink">{cap.live || heard || (cap.listening ? 'Đang nghe… nói ngay!' : 'Bấm micro hoặc Space rồi nói')}</p>
              {cap.listening && <Countdown startAt={listenAt.current} target={target} running={!firstWordAt.current} />}
              {cap.error && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{cap.error}</p>}
              <button type="button" onClick={() => setForceType(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
                <Keyboard className="h-3.5 w-3.5" /> Gõ thay vì nói
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(text, Math.round(performance.now() - shownAt.current));
              }}
              className="space-y-2"
            >
              <Input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={task === 'fix' ? 'Sửa câu ở đây…' : 'Gõ câu tiếng Anh…'}
                aria-label="Câu trả lời"
                className="h-12 text-lg"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Countdown startAt={shownAt.current} target={target} running={!result} />
                <Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>
                  Kiểm tra (Enter)
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {result && !final && (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-4 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="flex items-center gap-1.5 font-bold">
            <Lightbulb className="h-4 w-4" /> Chưa đúng — thử nghĩ lại một chút
          </p>
          {(heard || mode !== 'speak') && (
            <p className="text-sm">
              {mode === 'speak' ? 'App nghe được' : 'Bạn viết'}: “{heard || text}”{result.usedLabel && <> — đang dùng <b>{result.usedLabel}</b>{result.usedText ? ` (${result.usedText})` : ''}</>}
            </p>
          )}
          {result.hint && <p className="font-semibold">❓ {result.hint}</p>}
          {result.issues.map((i) => (
            <p key={i.text + i.type} className="text-sm">
              • “{i.text}”: {i.hint}
            </p>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" icon={<RotateCcw className="h-4 w-4" />} onClick={retry} autoFocus>
              {mode === 'speak' ? 'Nói lại' : 'Sửa lại'}
            </Button>
            <Button variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={reveal} loading={busy}>
              Xem đáp án
            </Button>
          </div>
        </div>
      )}

      {result && final && (
        <div className={cn('space-y-2 rounded-2xl p-4', ok ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-500/10 dark:text-emerald-50' : 'bg-rose-50 text-rose-950 dark:bg-rose-500/10 dark:text-rose-50')}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold">
            {ok ? <Check className="h-5 w-5 text-emerald-600" strokeWidth={3} /> : <X className="h-5 w-5 text-rose-600" strokeWidth={3} />}
            {ok ? (attempt === 1 ? 'Đúng thì!' : 'Đúng rồi (lần 2)') : 'Câu đúng là:'}
            {ok && result.usedLabel && <FormDot form={item.form} label={result.usedLabel} />}
            {attempt === 1 && latency != null && asSpeak && (
              <span className={cn('rounded-full px-2 py-0.5 text-xs', fast ? 'bg-emerald-600 text-white' : 'bg-orange-500 text-white')}>
                <Term k="reflex">Phản xạ</Term> {seconds(latency)} {fast ? '⚡' : ''}
              </span>
            )}
          </p>
          {ok && result.paraphrase && <p className="text-sm">Bạn dùng động từ khác nhưng đúng thì — vẫn tính đúng 👍</p>}
          {mode === 'speak' && heard && <p className="text-sm opacity-80">App nghe được: “{heard}”</p>}
          <p className="flex items-start gap-1 text-lg font-semibold">
            <span className="flex-1">{result.answer}</span>
            {result.answer && <AudioButton term={result.answer} />}
          </p>
          {result.answers && result.answers.length > 1 && <p className="text-sm opacity-80">Cũng đúng: {result.answers.slice(1).join(' · ')}</p>}
          {result.explain && <p className="text-sm">{result.explain}</p>}
          {result.issues
            .filter((i) => i.explain)
            .map((i) => (
              <p key={i.text + i.type} className="text-sm">
                • “{i.text}”{i.fix ? ` → “${i.fix}”` : ''}: {i.explain}
              </p>
            ))}
          {cap.recordingUrl && mode === 'speak' && <audio src={cap.recordingUrl} controls className="h-9 w-full" aria-label="Nghe lại giọng bạn" />}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs font-semibold opacity-80">
              {added ? '✓ Câu này đã vào hàng ôn tập (Ôn tập → mẫu câu)' : ''}
            </span>
            <div className="flex gap-2">
              {!added && (
                <Button variant="ghost" size="sm" onClick={addToReview}>
                  + Ôn lại câu này
                </Button>
              )}
              <Button variant="primary" onClick={onNext} autoFocus>
                Tiếp (Enter)
              </Button>
            </div>
          </div>
        </div>
      )}
      {firstResult && !firstResult.correct && !final && <p className="text-xs text-muted">Lần đầu đã được ghi lại để tính tiến bộ; lần sửa này chỉ để bạn tự điều chỉnh.</p>}
    </div>
  );
}

// ---------- Trang lượt luyện ----------

export default function TensePractice() {
  const [params] = useSearchParams();
  const mode = (params.get('mode') ?? 'mixed') as TensePracticeMode;
  const lesson = (params.get('lesson') as TenseLessonId | null) ?? undefined;
  const count = Math.min(30, Math.max(4, Number(params.get('count')) || 10));
  const canSpeak = Boolean(getRecognitionCtor());
  const qc = useQueryClient();
  const [round, setRound] = useState(0);
  const session = useQuery({
    queryKey: ['tense-session', mode, lesson ?? '', count, round],
    queryFn: () => api.tenseSession({ mode, lesson, count, speak: canSpeak ? '1' : '0' }),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [speakStep, setSpeakStep] = useState(0);
  const [typeStep, setTypeStep] = useState(0);
  const fastStreak = useRef(0);

  const items = session.data?.items ?? [];
  const item = items[index];
  const finished = session.data && index >= items.length;

  useEffect(() => {
    setIndex(0);
    setOutcomes([]);
  }, [round, mode, lesson, count]);

  useEffect(() => {
    if (finished) {
      qc.invalidateQueries({ queryKey: ['tenses'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    }
  }, [finished, qc]);

  const answered = (o: Omit<Outcome, 'item'>) => {
    if (!item) return;
    setOutcomes((prev) => {
      const i = prev.findIndex((x) => x.item.id === item.id && x.item.task === item.task);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], xp: copy[i].xp + o.xp };
        return copy;
      }
      return [...prev, { ...o, item }];
    });
    // Mục tiêu thời gian tự giảm khi trả lời nhanh và đúng 3 câu liên tiếp; trả lời sai/chậm thì nới lại một nấc
    if (o.as === 'speak' || o.as === 'type') {
      const target = o.as === 'speak' ? SPEAK_STEPS[speakStep] : TYPE_STEPS[typeStep];
      const quick = o.correct && o.latencyMs != null && o.latencyMs <= target;
      fastStreak.current = quick ? fastStreak.current + 1 : 0;
      const set = o.as === 'speak' ? setSpeakStep : setTypeStep;
      const steps = o.as === 'speak' ? SPEAK_STEPS : TYPE_STEPS;
      if (quick && fastStreak.current >= 3) {
        set((s) => {
          const n = Math.min(steps.length - 1, s + 1);
          if (n !== s) toast.message(`⚡ Nhanh lắm! Mục tiêu mới: ${steps[n] / 1000} giây`, { duration: 1600 });
          return n;
        });
        fastStreak.current = 0;
      } else if (!o.correct) set((s) => Math.max(0, s - 1));
    }
  };
  const next = () => setIndex((i) => i + 1);

  const xp = outcomes.reduce((s, o) => s + o.xp, 0);

  if (session.error) return <ErrorBox error={session.error} onRetry={() => session.refetch()} />;
  if (!session.data)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-10 rounded-xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  if (!items.length)
    return (
      <EmptyState
        icon="⏳"
        title="Chưa có câu luyện"
        description="Bài này chưa có câu luyện cho dạng bài đã chọn."
        action={<LinkButton to="/tenses" variant="primary">Về trang Thì</LinkButton>}
      />
    );

  if (finished) return <Results outcomes={outcomes} xp={xp} onAgain={() => setRound((r) => r + 1)} lesson={lesson} />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Link to={lesson ? `/tenses/${lesson}` : '/tenses'} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Thoát">
          <X className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between text-xs font-semibold text-muted">
            <span>
              {MODE_TITLE[mode]} · câu {index + 1}/{items.length}
            </span>
            <span>+{xp} XP</span>
          </div>
          <Progress value={index / items.length} className="mt-1 h-2" />
        </div>
      </div>
      <Card className="space-y-3 p-5 sm:p-6">
        {/* Không hiện tên thì trước khi trả lời: tự chọn thì chính là điều cần luyện */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">{item.level}</span>
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider text-muted">
            {item.task === 'recognize' ? 'Nhận ra' : item.task === 'fix' ? 'Sửa câu' : item.task === 'speak' && canSpeak ? 'Nói' : 'Gõ'}
          </span>
        </div>
        {item.kind === 'produce' ? (
          <ProduceCard
            key={`${item.id}-${index}`}
            item={item}
            canSpeak={canSpeak}
            speakTarget={SPEAK_STEPS[speakStep]}
            typeTarget={TYPE_STEPS[typeStep]}
            onAnswered={answered}
            onNext={next}
          />
        ) : (
          <RecognizeCard key={`${item.id}-${index}`} item={item} onAnswered={answered} onNext={next} />
        )}
      </Card>
      {item.task === 'recognize' && <p className="text-center text-xs text-muted">Phím 1–4 chọn đáp án · Enter để qua câu</p>}
      {item.task === 'speak' && canSpeak && <p className="text-center text-xs text-muted">Space: bật / tắt micro · tự dừng khi bạn ngừng nói · Enter để qua câu</p>}
    </div>
  );
}

function Results({ outcomes, xp, onAgain, lesson }: { outcomes: Outcome[]; xp: number; onAgain: () => void; lesson?: TenseLessonId }) {
  const right = outcomes.filter((o) => o.correct).length;
  const pct = outcomes.length ? Math.round((right / outcomes.length) * 100) : 0;
  const speakMs = median(outcomes.filter((o) => o.as === 'speak' && o.correct && o.latencyMs != null).map((o) => o.latencyMs!));
  const typeMs = median(outcomes.filter((o) => (o.as === 'type' || o.as === 'fix') && o.correct && o.latencyMs != null).map((o) => o.latencyMs!));
  const byForm = useMemo(() => {
    const m = new Map<string, { form: Outcome['item']['form']; ok: number; total: number }>();
    for (const o of outcomes) {
      const e = m.get(o.item.form) ?? { form: o.item.form, ok: 0, total: 0 };
      e.total++;
      if (o.correct) e.ok++;
      m.set(o.item.form, e);
    }
    return [...m.values()].sort((a, b) => a.ok / a.total - b.ok / b.total);
  }, [outcomes]);
  const mistakes = outcomes.filter((o) => !o.correct);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="space-y-4 p-6 text-center">
        <Emoji3D emoji={pct >= 80 ? '🏆' : pct >= 50 ? '💪' : '🧠'} size={80} className="mx-auto" />
        <h1 className="text-2xl font-black text-ink">{pct >= 80 ? 'Phản xạ rất tốt!' : pct >= 50 ? 'Đang tiến bộ!' : 'Cứ luyện tiếp nhé!'}</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Đúng lần đầu', value: `${right}/${outcomes.length}` },
            { label: 'Phản xạ nói', value: seconds(speakMs) },
            { label: 'Gõ xong', value: seconds(typeMs) },
            { label: 'XP', value: `+${xp}` },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-surface-2 p-3">
              <p className="font-display text-xl font-black text-ink">{s.value}</p>
              <p className="text-xs font-semibold text-muted">{s.label}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 text-left">
          {byForm.map((f) => (
            <div key={f.form} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tenseColor(f.form) }} />
              <span className="min-w-0 flex-1 truncate text-ink">{FORM_META[f.form].label}</span>
              <span className={cn('font-semibold', f.ok === f.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
                {f.ok}/{f.total}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onAgain} icon={<RotateCcw className="h-4 w-4" />}>
            Luyện tiếp
          </Button>
          <LinkButton to={lesson ? `/tenses/${lesson}` : '/tenses'} variant="outline">
            {lesson ? 'Về bài học' : 'Về trang Thì'}
          </LinkButton>
          {mistakes.some((m) => m.item.kind === 'produce') && (
            <LinkButton to="/review" variant="ghost">
              Ôn các câu sai
            </LinkButton>
          )}
        </div>
      </Card>
      {mistakes.length > 0 && (
        <Card className="space-y-2 p-5">
          <h2 className="font-extrabold text-ink">Câu cần xem lại</h2>
          {mistakes.map((m, i) => (
            <div key={i} className="rounded-xl bg-surface-2 p-3 text-sm">
              <p className="text-muted">
                {m.item.kind === 'produce' ? m.item.cue : m.item.kind === 'listen' ? 'Bài nghe' : m.item.sentence}
              </p>
              {m.item.kind === 'produce' && (
                <p className="font-semibold text-ink">
                  → {m.item.answers[0]} <span className="font-normal text-muted">({FORM_META[m.item.form].label})</span>
                </p>
              )}
              {m.text && m.item.kind === 'produce' && <p className="text-rose-700 dark:text-rose-300">Bạn: {m.text}</p>}
              {m.item.kind !== 'produce' && <p className="text-ink">{m.item.explain}</p>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
