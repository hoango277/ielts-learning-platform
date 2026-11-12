import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { ArrowLeft, Check, Eye, Lightbulb, Mic, MicOff, Play, RotateCcw, Save, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../../components/ui/Button';
import { Celebration } from '../../components/ui/Celebration';
import { Emoji3D } from '../../components/ui/Emoji3D';
import { Card, EmptyState, ErrorBox, Input, Kbd, Progress, Segmented, Skeleton } from '../../components/ui/primitives';
import { HeroArt } from '../../components/ui/HeroArt';
import { Term } from '../../components/ui/Term';
import { ClipPlayer } from '../../components/video/ClipPlayer';
import { AudioButton, useSettings } from '../../components/word/bits';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useSpeakCapture } from '../../hooks/useSpeakCapture';
import { api } from '../../lib/api';
import { diffWords } from '../../lib/diff';
import type { Phrase, SpeakMode, SpeakResult, SpeakWord } from '../../lib/types';
import { cn, posLabel, CONFETTI_COLORS } from '../../lib/utils';
import { DiffView, ScorePill } from '../watch/ShadowingPanel';
import { ChunkSentence } from '../../components/phrase/ChunkSentence';

export const SPEAK_MODES: { key: SpeakMode; title: string; desc: string; emoji: string; tone: string; source: 'phrase' | 'word' }[] = [
  {
    key: 'cloze',
    title: 'Nói câu có chỗ trống',
    desc: 'Nhìn câu đã lưu bị che cụm cần học, nói cả câu. App kiểm tra bạn có nói đúng cụm đó không.',
    emoji: '🧩',
    tone: 'from-brand-100 to-brand-200 dark:from-brand-500/25 dark:to-brand-500/10',
    source: 'phrase',
  },
  {
    key: 'delayed',
    title: 'Nghe – chờ – nói',
    desc: 'Nghe đoạn gốc, chờ vài giây rồi nói lại theo trí nhớ (không nhìn chữ). Chấm theo % từ khớp.',
    emoji: '⏳',
    tone: 'from-sky-100 to-sky-200 dark:from-sky-500/25 dark:to-sky-500/10',
    source: 'phrase',
  },
  {
    key: 'own',
    title: 'Tự đặt câu',
    desc: 'Đặt câu với từ trong sổ. App kiểm tra bạn có dùng từ đó; câu ổn thì lưu làm ví dụ của riêng bạn.',
    emoji: '✍️',
    tone: 'from-emerald-100 to-emerald-200 dark:from-emerald-500/25 dark:to-emerald-500/10',
    source: 'word',
  },
  {
    key: 'vi',
    title: 'Gợi ý tiếng Việt',
    desc: 'Tuỳ chọn: thấy nghĩa tiếng Việt của một cụm ngắn → nói cụm tiếng Anh. App chỉ tính đạt khi bạn nói đúng cụm gốc đã lưu, rồi cho nghe lại câu gốc.',
    emoji: '🇻🇳',
    tone: 'from-orange-100 to-orange-200 dark:from-orange-500/25 dark:to-orange-500/10',
    source: 'phrase',
  },
];

const RATINGS = [
  { value: 1 as const, label: 'Quên', className: 'bg-rose-500 hover:bg-rose-400 [--edge:var(--color-rose-700)]' },
  { value: 2 as const, label: 'Khó', className: 'bg-amber-500 hover:bg-amber-400 [--edge:var(--color-amber-700)]' },
  { value: 3 as const, label: 'Nhớ', className: 'bg-emerald-500 hover:bg-emerald-400 [--edge:var(--color-emerald-700)]' },
  { value: 4 as const, label: 'Dễ', className: 'bg-sky-500 hover:bg-sky-400 [--edge:var(--color-sky-700)]' },
];

// ---------- Nút micro + phương án gõ khi trình duyệt không nhận dạng giọng nói ----------

function MicButton({ cap, disabled, onStart }: { cap: ReturnType<typeof useSpeakCapture>; disabled?: boolean; onStart?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="relative flex pb-1">
        {cap.listening && <span aria-hidden="true" className="absolute inset-0 mb-1 animate-ping rounded-full bg-rose-400/40" />}
        <button
          type="button"
          disabled={disabled}
          onClick={() => (cap.listening ? cap.stop() : onStart ? onStart() : void cap.start())}
          className={cn(
            'press relative flex h-20 w-20 items-center justify-center rounded-full text-white hover:brightness-110 disabled:opacity-50',
            cap.listening ? 'bg-rose-500 [--edge:var(--color-rose-700)]' : 'bg-brand [--edge:var(--color-brand-800)]',
          )}
          aria-label={cap.listening ? 'Dừng (Space)' : 'Bắt đầu nói (Space)'}
        >
          {cap.listening ? <Square className="h-8 w-8 fill-current" /> : <Mic className="h-9 w-9" />}
        </button>
      </span>
      <p className="min-h-5 max-w-lg text-center text-sm text-muted">{cap.listening ? cap.live || 'Đang nghe… nói xong bấm dừng' : <>Bấm micro hoặc <Kbd>Space</Kbd> để nói</>}</p>
      {cap.error && <p className="text-sm text-rose-500">{cap.error}</p>}
    </div>
  );
}

function TypeFallback({ onSubmit, placeholder }: { onSubmit: (text: string) => void; placeholder: string }) {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text.trim());
      }}
      className="flex gap-2"
    >
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Câu trả lời" autoFocus />
      <Button type="submit" variant="primary" disabled={!text.trim()}>
        Kiểm tra
      </Button>
    </form>
  );
}

// ---------- Bài với mẫu câu: câu có chỗ trống / nghe–chờ–nói / gợi ý tiếng Việt ----------

function PhraseDrill({ mode, phrase, onDone }: { mode: Exclude<SpeakMode, 'own'>; phrase: Phrase; onDone: (passed: boolean, xp: number) => void }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const delay = settings?.speakDelaySec ?? 2;
  const cap = useSpeakCapture();
  const [phase, setPhase] = useState<'prompt' | 'listening' | 'countdown' | 'result'>('prompt');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // Nghe – chờ – nói: đã qua bước nghe + đếm ngược (hoặc chọn nói ngay) → hiện micro / ô gõ
  const [heard, setHeard] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [playSignal, setPlaySignal] = useState(0);
  const [showText, setShowText] = useState(mode !== 'delayed');
  const [hint, setHint] = useState(false);
  const [result, setResult] = useState<(SpeakResult & { transcript: string }) | null>(null);
  // XP cộng dồn qua mọi lần nói (kể cả các lần thử lại) và lần xếp lịch ôn
  const xpRef = useRef(0);
  const clip = { videoId: phrase.videoId, start: phrase.start, end: phrase.end, text: phrase.sentence };
  const due = phrase.state === 0 || new Date(phrase.due).getTime() <= Date.now();
  const delayedIntro = mode === 'delayed' && phase === 'prompt' && !heard && !cap.listening;

  const submit = useMutation({
    mutationFn: (transcript: string) => {
      const score = mode === 'delayed' ? diffWords(phrase.sentence, transcript, { lenient: true }).score : undefined;
      return api.speakAttempt({ mode, phraseId: phrase.id, transcript, score }).then((r) => ({ ...r, transcript }));
    },
    onSuccess: (r) => {
      xpRef.current += r.xp;
      setResult(r);
      setPhase('result');
      setShowText(true);
      // Nghe lại đoạn gốc ngay sau khi nói để so sánh
      setTimeout(() => setPlaySignal((n) => n + 1), 500);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Kết quả nhận dạng xong → chấm (lượt lỗi / không nghe thấy gì không tạo kết quả nên không bị chấm trượt)
  useEffect(() => {
    if (cap.result && phase !== 'result' && !submit.isPending) submit.mutate(cap.result);
  }, [cap.result]); // eslint-disable-line react-hooks/exhaustive-deps

  // Đếm ngược rồi tự bật micro (nghe – chờ – nói)
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('prompt');
      setHeard(true);
      if (cap.supported) void cap.start();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Đoạn gốc không phát được / không báo kết thúc (lỗi video YouTube, giọng máy bị treo) → không kẹt ở bước nghe
  useEffect(() => {
    if (phase !== 'listening') return;
    const clipSec = phrase.videoId && phrase.start != null ? (phrase.end ?? phrase.start + 6) - phrase.start : phrase.sentence.split(/\s+/).length * 0.6;
    const t = setTimeout(
      () => {
        setPhase('prompt');
        setHeard(true);
      },
      (Math.max(0, clipSec) + 15) * 1000,
    );
    return () => clearTimeout(t);
  }, [phase, playSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = useMutation({
    mutationFn: (rating: 1 | 2 | 3 | 4) => api.reviewPhrase(phrase.id, rating, `speak:${mode}`),
    onSuccess: (r) => {
      xpRef.current += r.xp;
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      onDone(result?.passed ?? false, xpRef.current);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const finish = () => onDone(result?.passed ?? false, xpRef.current);

  const listenFirst = () => {
    setPhase('listening');
    setPlaySignal((n) => n + 1);
  };

  // Nghe – chờ – nói: bật micro ngay (kể cả khi đoạn gốc đang phát / không phát được), bỏ bước đếm ngược
  const speakNow = () => {
    setPhase('prompt');
    setHeard(true);
    void cap.start();
  };

  const retry = () => {
    setResult(null);
    setSkipped(false);
    cap.reset();
    setPhase('prompt');
    setHeard(false);
    setShowText(mode !== 'delayed');
  };

  // Bỏ qua: hiện đáp án và phát lại đoạn gốc; KHÔNG gửi lượt nói nào lên máy chủ (không XP, không đổi lịch ôn)
  const skip = () => {
    cap.cancel();
    setResult(null);
    setSkipped(true);
    setPhase('result');
    setShowText(true);
    setTimeout(() => setPlaySignal((n) => n + 1), 300);
  };

  const onSpace = () => {
    if (submit.isPending) return;
    if (cap.listening) return cap.stop();
    // Space lúc đang đếm ngược = bỏ qua đếm ngược; effect ở trên bật micro đúng một lần
    if (phase === 'countdown') return setCountdown(0);
    if (delayedIntro) return listenFirst();
    if (!cap.supported) return;
    if (mode === 'delayed') speakNow();
    else void cap.start();
  };

  useHotkeys(
    phase === 'result'
      ? { ...(skipped || !due ? { Enter: finish } : {}), r: () => setPlaySignal((n) => n + 1) }
      : { space: onSpace },
  );

  const diff = result && mode !== 'vi' ? diffWords(phrase.sentence, result.transcript, { lenient: true }) : null;

  return (
    <div className="space-y-5">
      {/* Đề bài */}
      {mode === 'vi' ? (
        <div className="space-y-2 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Nói bằng tiếng Anh</p>
          <p className="text-3xl font-extrabold text-ink">“{phrase.chunkVi}”</p>
          <p className="text-sm text-muted">
            trong câu: <ChunkSentence sentence={phrase.sentence} chunk={phrase.chunk} hidden={phase !== 'result'} />
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{mode === 'cloze' ? 'Nói cả câu, điền cụm bị che' : 'Nghe đoạn gốc rồi nói lại'}</p>
          {showText ? (
            <p className="text-2xl font-semibold leading-relaxed text-ink">
              <ChunkSentence sentence={phrase.sentence} chunk={phrase.chunk} hidden={mode === 'cloze' && phase !== 'result'} />
            </p>
          ) : (
            <button type="button" onClick={() => setShowText(true)} className="mx-auto flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold text-muted hover:text-ink">
              <Eye className="h-4 w-4" /> Câu đang được ẩn để luyện trí nhớ — bấm nếu cần xem
            </button>
          )}
          {mode === 'cloze' && phrase.chunkVi && phase !== 'result' && (
            <button type="button" onClick={() => setHint((v) => !v)} className="inline-flex items-center gap-1 text-sm font-semibold text-amber-600 hover:underline">
              <Lightbulb className="h-4 w-4" /> {hint ? `Gợi ý: ${phrase.chunkVi}` : 'Gợi ý nghĩa của cụm'}
            </button>
          )}
        </div>
      )}

      {/* Trình phát đoạn gốc: bài nghe–chờ–nói hiện ngay; bài khác chỉ hiện sau khi nói (tránh lộ đáp án) */}
      {(mode === 'delayed' || phase === 'result') && (
        <div className="flex justify-center">
          <ClipPlayer
            clip={clip}
            playSignal={playSignal}
            onEnded={() => {
              // Đọc phase qua ref: giọng máy giữ callback cũ, có thể báo kết thúc sau khi người học đã bấm nói
              if (mode === 'delayed' && phaseRef.current === 'listening') {
                setCountdown(delay);
                setPhase('countdown');
              }
            }}
          />
        </div>
      )}

      {phase !== 'result' && (
        <>
          {phase === 'countdown' ? (
            <div className="flex flex-col items-center gap-2">
              <span className="flex h-20 w-20 animate-pop items-center justify-center rounded-full bg-sky-500 text-4xl font-extrabold text-white shadow-xl">{countdown}</span>
              <p className="text-sm text-muted">
                {cap.supported ? (
                  <>
                    Nhớ lại câu vừa nghe… micro sẽ tự bật (<Kbd>Space</Kbd> để nói ngay)
                  </>
                ) : (
                  'Nhớ lại câu vừa nghe… rồi gõ lại câu bên dưới'
                )}
              </p>
            </div>
          ) : delayedIntro ? (
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" variant="primary" icon={<Play className="h-5 w-5 fill-current" />} onClick={listenFirst}>
                Nghe đoạn gốc
              </Button>
              <p className="text-xs text-muted">
                Sau khi nghe, đếm ngược {delay} giây rồi {cap.supported ? 'micro tự bật' : 'gõ lại câu'} (đổi trong Cài đặt).{' '}
                {cap.supported && (
                  <button type="button" className="font-semibold underline" onClick={speakNow}>
                    Nói ngay
                  </button>
                )}
              </p>
            </div>
          ) : cap.supported ? (
            <MicButton cap={cap} disabled={submit.isPending} onStart={mode === 'delayed' ? speakNow : undefined} />
          ) : null}
          {/* Không có nhận dạng giọng nói → gõ câu. Giữ cùng vị trí qua các bước nghe / đếm ngược để chữ đã gõ không bị mất */}
          {!cap.supported && !delayedIntro && (
            <TypeFallback onSubmit={(t) => submit.mutate(t)} placeholder="Trình duyệt không hỗ trợ nhận dạng giọng nói — gõ câu bạn nói…" />
          )}
          {!cap.listening && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" icon={<Eye className="h-4 w-4" />} disabled={submit.isPending} onClick={skip}>
                Bỏ qua · xem đáp án
              </Button>
            </div>
          )}
        </>
      )}

      {/* Kết quả */}
      {result && (
        <div className="space-y-4">
          <div
            className={cn(
              'animate-pop rounded-2xl p-4',
              result.passed ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100',
            )}
          >
            <p className="flex items-center gap-2 font-bold">
              {result.passed ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
              {mode === 'delayed'
                ? result.passed
                  ? 'Nhắc lại tốt!'
                  : 'Chưa nhớ đủ câu — nghe lại và thử lần nữa nhé'
                : result.passed
                  ? `Bạn đã nói đúng “${result.matched}”`
                  : `Chưa nghe thấy cụm “${result.target}”`}
              {result.score != null && mode === 'delayed' && <ScorePill score={result.score} />}
            </p>
            <p className="mt-1 text-sm opacity-90">Bạn nói: “{result.transcript || '…'}”</p>
            {mode === 'vi' && !result.passed && (
              <p className="mt-1 text-xs opacity-80">App chỉ nhận đúng cụm gốc đã lưu — nếu bạn nói cách khác mà vẫn đúng nghĩa, hãy tự so với câu gốc bên trên.</p>
            )}
          </div>
          {diff && <DiffView result={diff} />}
          {phrase.sentenceVi && <p className="text-center text-sm text-muted">{phrase.sentenceVi}</p>}
          {cap.recordingUrl && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
              Giọng của bạn: <audio src={cap.recordingUrl} controls className="h-9" />
            </div>
          )}
          {due ? (
            <div className="space-y-2">
              <p className="flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-ink">
                Bạn nhớ cụm này thế nào? (để app xếp lịch ôn) <Term k="ratings" icon />
              </p>
              <div className="grid grid-cols-4 gap-2 pb-1">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    disabled={rate.isPending}
                    onClick={() => rate.mutate(r.value)}
                    className={cn('press rounded-2xl py-3 font-display font-extrabold text-white disabled:opacity-60', r.className)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" icon={<RotateCcw className="h-4 w-4" />} disabled={rate.isPending} onClick={retry}>
                  Thử lại
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={retry}>
                Thử lại
              </Button>
              <Button variant="primary" onClick={finish}>
                Tiếp <Kbd className="ml-1 border-white/30 bg-white/20 text-white">Enter</Kbd>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Đã bỏ qua: chỉ xem đáp án, lượt này không được ghi nhận */}
      {skipped && (
        <div className="space-y-4">
          <div className="animate-pop rounded-2xl bg-surface-2 p-4 text-ink">
            <p className="flex items-center gap-2 font-bold">
              <Eye className="h-5 w-5" /> Đã bỏ qua — đáp án ở trên
            </p>
            {mode !== 'delayed' && phrase.chunk && <p className="mt-1 text-sm">Cụm cần nói: “{phrase.chunk}”</p>}
            <p className="mt-1 text-sm text-muted">Lượt bỏ qua không được ghi nhận: không cộng XP, không tính vào kế hoạch hôm nay và không đổi lịch ôn.</p>
          </div>
          {phrase.sentenceVi && <p className="text-center text-sm text-muted">{phrase.sentenceVi}</p>}
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={retry}>
              Thử lại
            </Button>
            <Button variant="primary" onClick={finish}>
              Tiếp <Kbd className="ml-1 border-white/30 bg-white/20 text-white">Enter</Kbd>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Tự đặt câu với từ trong sổ ----------

function OwnDrill({ word, onDone }: { word: SpeakWord; onDone: (passed: boolean, xp: number) => void }) {
  const qc = useQueryClient();
  const cap = useSpeakCapture();
  const [text, setText] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [result, setResult] = useState<SpeakResult | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // XP cộng dồn qua mọi lần kiểm tra (kể cả các lần thử lại) và lần lưu ví dụ
  const xpRef = useRef(0);

  // Nhận dạng xong → đưa vào ô để người học sửa lỗi nhận dạng trước khi kiểm tra
  useEffect(() => {
    if (cap.result !== null) {
      setText(cap.result);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [cap.result]);

  const check = useMutation({
    mutationFn: () => api.speakAttempt({ mode: 'own', wordId: word.id, transcript: text.trim() }),
    onSuccess: (r) => {
      xpRef.current += r.xp;
      setResult(r);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const save = useMutation({
    mutationFn: () => api.saveOwnExample({ wordId: word.id, sentence: text.trim() }),
    onSuccess: (r) => {
      xpRef.current += r.xp;
      setSaved(true);
      toast.success(`Đã lưu câu làm ví dụ cho “${word.term}” (+${r.xp} XP)`);
      qc.invalidateQueries({ queryKey: ['words'] });
      qc.invalidateQueries({ queryKey: ['word', word.id] });
    },
  });

  useHotkeys(result ? { Enter: () => onDone(result.passed, xpRef.current) } : cap.supported && !text ? { space: () => (cap.listening ? cap.stop() : void cap.start()) } : {});

  return (
    <div className="space-y-5">
      <div className="space-y-2 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Đặt một câu của riêng bạn với</p>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-4xl font-extrabold text-ink">{word.term}</h2>
          <AudioButton term={word.term} audio={word.audio} />
        </div>
        <p className="text-muted">
          {word.pos && <span>({posLabel(word.pos)}) </span>}
          {word.meaning}
        </p>
        {word.collocations.length > 0 && <p className="text-sm text-muted">Hay đi với: {word.collocations.join(' · ')}</p>}
        {word.example &&
          (showExample ? (
            <p className="mx-auto max-w-lg text-sm italic text-muted">“{word.example}”</p>
          ) : (
            <button type="button" onClick={() => setShowExample(true)} className="text-sm font-semibold text-brand-600 hover:underline">
              Xem một câu ví dụ
            </button>
          ))}
        <p className="text-xs text-muted">Mẹo: nói về bản thân bạn (công việc, sở thích, kế hoạch) để dễ nhớ hơn.</p>
      </div>

      {!result && cap.supported && !text && <MicButton cap={cap} />}
      {!result && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) check.mutate();
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={cap.supported ? 'Hoặc gõ câu của bạn… (sửa lỗi nhận dạng nếu có)' : 'Gõ câu của bạn…'}
            aria-label="Câu của bạn"
          />
          <Button type="submit" variant="primary" loading={check.isPending} disabled={!text.trim()}>
            Kiểm tra
          </Button>
        </form>
      )}
      {/* Bỏ qua: sang từ tiếp theo, lượt này không được ghi nhận (không XP, không tính vào kế hoạch hôm nay) */}
      {!result && !cap.listening && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={check.isPending}
            onClick={() => {
              cap.cancel();
              onDone(false, xpRef.current);
            }}
          >
            Bỏ qua từ này
          </Button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div
            className={cn(
              'animate-pop rounded-2xl p-4',
              result.passed ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100',
            )}
          >
            <p className="font-bold">
              {result.passed
                ? `Tốt! Bạn đã dùng “${result.matched}” trong câu ${result.wordCount} từ.`
                : result.matched
                  ? 'Có dùng từ nhưng câu hơi ngắn — thử nói dài hơn (ít nhất 5 từ).'
                  : `Câu chưa có từ “${word.term}” (hoặc dạng chia của nó).`}
            </p>
            <p className="mt-1 text-sm">“{text}”</p>
            <p className="mt-1 text-xs opacity-80">App chỉ kiểm tra bạn có dùng từ — không chấm ngữ pháp. Hãy tự đọc lại câu và so với ví dụ.</p>
          </div>
          {cap.recordingUrl && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted">
              Giọng của bạn: <audio src={cap.recordingUrl} controls className="h-9" />
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {result.passed && (
              <Button variant="soft" icon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={saved} onClick={() => save.mutate()}>
                {saved ? 'Đã lưu làm ví dụ' : 'Lưu làm ví dụ của từ'}
              </Button>
            )}
            {!result.passed && (
              <Button
                variant="ghost"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  setResult(null);
                  setText('');
                  cap.reset();
                }}
              >
                Thử lại
              </Button>
            )}
            <Button variant="primary" onClick={() => onDone(result.passed, xpRef.current)}>
              Tiếp <Kbd className="ml-1 border-white/30 bg-white/20 text-white">Enter</Kbd>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Phiên luyện ----------

function Session({ mode, count }: { mode: SpeakMode; count: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [round, setRound] = useState(0);
  const session = useQuery({
    queryKey: ['speaking-session', mode, count, round],
    queryFn: () => api.speakingSession({ mode, count }),
    staleTime: Infinity,
    gcTime: 0,
  });
  const [idx, setIdx] = useState(0);
  const [outcomes, setOutcomes] = useState<boolean[]>([]);
  const [xp, setXp] = useState(0);
  useEffect(() => {
    setIdx(0);
    setOutcomes([]);
    setXp(0);
  }, [session.data]);

  const meta = SPEAK_MODES.find((m) => m.key === mode)!;
  const items = mode === 'own' ? (session.data?.words ?? []) : (session.data?.phrases ?? []);
  const done = session.data && idx >= items.length && items.length > 0;
  useEffect(() => {
    if (!done) return;
    qc.invalidateQueries({ queryKey: ['today'] });
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['speaking-stats'] });
    if (outcomes.filter(Boolean).length / Math.max(1, outcomes.length) >= 0.7) confetti({ particleCount: 110, spread: 75, origin: { y: 0.6 }, colors: CONFETTI_COLORS });
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = (passed: boolean, gained: number) => {
    setOutcomes((o) => [...o, passed]);
    setXp((x) => x + gained);
    setIdx((i) => i + 1);
  };

  const header = (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={() => navigate('/speaking')} aria-label="Thoát">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-bold text-ink">
          <Emoji3D emoji={meta.emoji} size={26} /> {meta.title}
        </p>
        {items.length > 0 && <Progress value={Math.min(idx, items.length) / items.length} className="mt-1.5" />}
      </div>
      {items.length > 0 && !done && (
        <span className="text-sm font-semibold text-muted">
          {idx + 1}/{items.length}
        </span>
      )}
    </div>
  );

  if (session.error) return <ErrorBox error={session.error} onRetry={() => session.refetch()} />;
  if (session.isPending) return <Skeleton className="mx-auto h-96 max-w-2xl rounded-3xl" />;
  if (!items.length)
    return (
      <EmptyState
        icon={meta.source === 'word' ? '📒' : '💬'}
        title={meta.source === 'word' ? 'Chưa có từ để đặt câu' : 'Chưa có mẫu câu phù hợp'}
        description={
          meta.source === 'word'
            ? 'Thêm từ vào sổ (từ video hoặc bộ chủ đề) rồi quay lại tự đặt câu.'
            : mode === 'vi'
              ? 'Bài này cần mẫu câu có cụm ngắn đã được dịch. Lưu câu từ phụ đề và chọn cụm cần học.'
              : 'Lưu vài câu hay từ phụ đề video (biểu tượng dấu trang hoặc phím B), chọn cụm cần học rồi quay lại.'
        }
        action={
          <div className="flex gap-2">
            <LinkButton to="/explore" variant="primary">Tìm video</LinkButton>
            <LinkButton to="/speaking" variant="outline">Chọn bài khác</LinkButton>
          </div>
        }
      />
    );

  if (done) {
    const passed = outcomes.filter(Boolean).length;
    return (
      <Card className="mx-auto max-w-xl space-y-4 p-8 text-center">
        <Celebration
          emoji={passed / Math.max(1, items.length) >= 0.7 ? '🏆' : '💪'}
          title={`Xong ${items.length} lượt nói!`}
          description={
            <>
              Đạt {passed}/{items.length} · +{xp} <Term k="xp">XP</Term>
            </>
          }
          className="py-0"
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="primary"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              // Đặt lại ngay (không chờ effect) để không hiện lại kết quả cũ / bắn pháo giấy lần nữa khi buổi mới tải xong
              setIdx(0);
              setOutcomes([]);
              setXp(0);
              setRound((r) => r + 1);
            }}
          >
            Luyện tiếp
          </Button>
          <LinkButton to="/speaking" variant="outline">Đổi dạng bài</LinkButton>
          <LinkButton to="/today" variant="ghost">Kế hoạch hôm nay</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {header}
      <Card className="p-6 sm:p-8">
        {mode === 'own' ? (
          <OwnDrill key={(items[idx] as SpeakWord).id} word={items[idx] as SpeakWord} onDone={next} />
        ) : (
          <PhraseDrill key={(items[idx] as Phrase).id} mode={mode} phrase={items[idx] as Phrase} onDone={next} />
        )}
      </Card>
    </div>
  );
}

// ---------- Trang chọn bài ----------

export default function SpeakingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const modeParam = params.get('mode') as SpeakMode | null;
  const [count, setCount] = useState(Number(params.get('count')) || 5);
  const stats = useQuery({ queryKey: ['speaking-stats'], queryFn: api.speakingStats, staleTime: 30_000 });

  if (modeParam && SPEAK_MODES.some((m) => m.key === modeParam)) return <Session key={`${modeParam}-${count}`} mode={modeParam} count={count} />;

  const s = stats.data;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-hero [--hero-glow:var(--color-pink-400)] p-6 text-white shadow-glow sm:p-8">
        <HeroArt items={['🎙️', '💬', '👋']} />
        <h1 className="pr-14 xl:pr-0 relative text-2xl font-black sm:text-3xl">Luyện nói lại</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/90">
          Nói lại câu và từ đã học để biến vốn từ “hiểu được” thành “dùng được”. App kiểm tra bạn nói đúng cụm, đúng câu — không chấm phát âm.
        </p>
        {s && (
          <div className="relative mt-4 flex flex-wrap gap-2 text-sm font-semibold">
            <span className="rounded-xl bg-white/20 px-3 py-1.5">{s.phrases} mẫu câu ({s.chunks} có cụm)</span>
            <span className="rounded-xl bg-white/20 px-3 py-1.5">{s.words} từ đang học</span>
            <span className="rounded-xl bg-white/20 px-3 py-1.5">
              Hôm nay: {Object.values(s.today).reduce((a, b) => a + (b ?? 0), 0)} lượt
            </span>
            <span className="rounded-xl bg-white/20 px-3 py-1.5">{s.ownSentences} câu tự đặt</span>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-ink">Số lượt mỗi buổi:</span>
        <Segmented value={count} onChange={setCount} options={[3, 5, 10, 15].map((n) => ({ value: n, label: String(n) }))} />
      </div>

      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SPEAK_MODES.map((m) => {
          const available = m.source === 'word' ? (s?.words ?? 0) : m.key === 'cloze' || m.key === 'vi' ? (s?.chunks ?? 0) : (s?.phrases ?? 0);
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => navigate(`/speaking?mode=${m.key}&count=${count}`)}
              className="card card-hover group flex items-start gap-4 p-5 text-left"
            >
              <span
                className={cn(
                  'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br shadow-[inset_0_-2px_0_rgb(0_0_0/0.05)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110',
                  m.tone,
                )}
              >
                <Emoji3D emoji={m.emoji} size={40} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-display text-[17px] font-extrabold text-ink">{m.title}</span>
                  {m.key === 'vi' && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted">TUỲ CHỌN</span>}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted">{m.desc}</span>
                <span className={cn('mt-2 block text-xs font-semibold', available ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600')}>
                  {available ? `${available} ${m.source === 'word' ? 'từ' : 'mẫu câu'} sẵn sàng` : m.source === 'word' ? 'Cần thêm từ vào sổ' : 'Cần lưu mẫu câu từ video'}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <Card className="space-y-2 p-5 text-sm leading-relaxed text-muted">
        <p className="flex items-center gap-2 font-bold text-ink">
          <MicOff className="h-4 w-4 text-brand-500" /> Lưu ý
        </p>
        <p>
          <Term k="speech_recognition">Nhận dạng giọng nói</Term> dùng tính năng có sẵn của trình duyệt — chạy tốt nhất trên Chrome hoặc Edge và cần kết nối mạng. Bài tự đặt
          câu cho phép sửa lại chữ máy nghe sai trước khi kiểm tra.
        </p>
        <p>
          Vì sao gợi ý tiếng Việt chỉ là tuỳ chọn? Một câu tiếng Việt có nhiều cách nói đúng bằng tiếng Anh, nhưng app chỉ tính đạt khi bạn nói đúng cụm gốc đã lưu — nói cách
          khác dù đúng nghĩa vẫn bị tính là chưa đạt. Luyện với gợi ý tiếng Anh (câu có chỗ trống, nghe lại đoạn gốc) giúp bạn nghĩ bằng tiếng Anh — theo nguyên tắc{' '}
          <Term k="retrieval">tự nhớ lại</Term> — và được chấm công bằng hơn.
        </p>
      </Card>
    </div>
  );
}
