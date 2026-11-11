import { ChevronLeft, ChevronRight, Headphones, Mic, Play, Square, Volume2, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Badge, Kbd, Switch } from '../../components/ui/primitives';
import { useLocalStorage } from '../../hooks/misc';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useRecorder } from '../../hooks/useRecorder';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import type { PlayerApi } from '../../hooks/useYouTubePlayer';
import { api } from '../../lib/api';
import { diffWords, type DiffResult } from '../../lib/diff';
import type { Sentence } from '../../lib/types';
import { cn } from '../../lib/utils';
import { WordLine, type WordClick } from './SubtitleBar';
import type { Token } from './tokens';

type Phase = 'idle' | 'listening' | 'recording' | 'scored';

export function DiffView({ result }: { result: DiffResult }) {
  return (
    <p className="text-lg leading-relaxed">
      {result.tokens.map((t, i) => (
        <span key={i}>
          <span
            title={t.state === 'wrong' ? `Bạn: "${t.got}"` : t.state === 'missing' ? 'Thiếu từ này' : undefined}
            className={cn(
              'rounded px-0.5 font-semibold',
              t.state === 'correct' && 'text-emerald-600 dark:text-emerald-400',
              t.state === 'wrong' && 'bg-rose-100 text-rose-600 underline decoration-wavy dark:bg-rose-500/15 dark:text-rose-400',
              t.state === 'missing' && 'bg-surface-3 text-muted line-through decoration-2',
            )}
          >
            {t.word}
          </span>{' '}
        </span>
      ))}
    </p>
  );
}

export function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone = pct >= 90 ? 'from-emerald-500 to-teal-400' : pct >= 70 ? 'from-sky-500 to-violet-500' : pct >= 50 ? 'from-amber-500 to-orange-400' : 'from-rose-500 to-pink-500';
  const label = pct >= 90 ? 'Xuất sắc!' : pct >= 70 ? 'Tốt lắm' : pct >= 50 ? 'Khá ổn' : 'Thử lại nhé';
  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full bg-linear-to-r px-3 py-1 text-sm font-bold text-white', tone)}>
      {pct}% · {label}
    </span>
  );
}

export function ShadowingPanel({
  sentences,
  tokens,
  index,
  setIndex,
  player,
  playSentence,
  videoId,
  translation,
  repeat,
  onWordClick,
}: {
  sentences: Sentence[];
  tokens: Token[] | undefined;
  index: number;
  setIndex: (i: number) => void;
  player: PlayerApi;
  playSentence: (i: number, o?: { repeat?: number; onDone?: () => void }) => void;
  videoId: string;
  translation?: string;
  repeat: number;
  onWordClick: WordClick;
}) {
  const s = sentences[index];
  const sr = useSpeechRecognition('en-US');
  const rec = useRecorder();
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<DiffResult | null>(null);
  const [heard, setHeard] = useState('');
  const [best, setBest] = useState<Record<number, number>>({});
  const [auto, setAuto] = useLocalStorage('shadow-auto', false);
  const [along, setAlong] = useLocalStorage('shadow-along', false);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const indexRef = useRef(index);
  indexRef.current = index;
  const stopTimer = useRef<number | undefined>(undefined);

  // Đổi câu → reset kết quả
  useEffect(() => {
    setResult(null);
    setHeard('');
    setPhase('idle');
    rec.reset();
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = useCallback(
    (text: string) => {
      window.clearTimeout(stopTimer.current);
      rec.stop();
      const target = sentences[indexRef.current];
      if (!target) return;
      setHeard(text);
      if (!text && sr.supported) {
        setPhase('idle');
        toast.message('Không nghe thấy bạn nói', { description: 'Hãy kiểm tra micro và nói to, rõ hơn.' });
        return;
      }
      const r = diffWords(target.text, text, { lenient: true });
      setResult(r);
      setPhase('scored');
      setBest((b) => ({ ...b, [indexRef.current]: Math.max(b[indexRef.current] ?? 0, r.score) }));
      api.sentencePractice(videoId, { kind: 'shadow', score: r.score }).catch(() => undefined);
      if (autoRef.current && r.score >= 0.8 && indexRef.current < sentences.length - 1) {
        window.setTimeout(() => setIndex(indexRef.current + 1), 1400);
      }
    },
    [rec, sentences, setIndex, sr.supported, videoId],
  );

  const startRecording = useCallback(async () => {
    const target = sentences[indexRef.current];
    if (!target) return;
    if (!along) player.pause();
    setResult(null);
    setHeard('');
    const ok = await rec.start();
    if (!ok && !sr.supported) {
      toast.error('Trình duyệt không hỗ trợ ghi âm. Hãy dùng Chrome hoặc Edge.');
      return;
    }
    setPhase('recording');
    if (sr.supported) sr.start(finish);
    // tự dừng sau khoảng gấp đôi độ dài câu
    const ms = Math.max(4000, (target.end - target.start) * 2000 + 2000);
    stopTimer.current = window.setTimeout(() => {
      sr.stop();
      if (!sr.supported) finish('');
    }, ms);
    if (along) playSentence(indexRef.current);
  }, [along, finish, player, playSentence, rec, sentences, sr]);

  const stopRecording = () => {
    window.clearTimeout(stopTimer.current);
    if (sr.supported) sr.stop();
    else {
      rec.stop();
      setPhase('scored');
      api.sentencePractice(videoId, { kind: 'shadow' }).catch(() => undefined);
    }
  };

  // Ngắt sớm khi người học đã nói đủ và im lặng ~1.5s
  useEffect(() => {
    if (phase !== 'recording' || !s) return;
    const said = `${sr.transcript} ${sr.interim}`.trim().split(/\s+/).filter(Boolean).length;
    const need = s.words.length;
    if (said < Math.ceil(need * 0.6)) return;
    const t = window.setTimeout(() => sr.stop(), 1500);
    return () => window.clearTimeout(t);
  }, [sr.transcript, sr.interim, phase, s, sr]);

  const listen = () => {
    setPhase('listening');
    playSentence(index, {
      repeat,
      onDone: () => {
        setPhase('idle');
        if (autoRef.current) startRecording();
      },
    });
  };

  useHotkeys({
    r: () => (phase === 'recording' ? stopRecording() : startRecording()),
  });

  if (!s) return null;
  const score = best[index];

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
            <Mic className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-ink">Shadowing — câu {index + 1}/{sentences.length}</h3>
            <p className="text-xs text-muted">Nghe → nhại lại đúng nhịp, nối âm, ngữ điệu → xem điểm từng từ</p>
          </div>
        </div>
        {score !== undefined && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Tốt nhất {Math.round(score * 100)}%</Badge>}
      </div>

      <div className="rounded-2xl bg-surface-2 p-4 text-center">
        <p className="text-xl font-semibold leading-relaxed text-ink">
          {tokens ? <WordLine tokens={tokens} onWordClick={onWordClick} /> : s.text}
        </p>
        {translation && <p className="mt-1.5 text-sm text-muted">{translation}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Câu trước">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="secondary" onClick={listen} icon={<Play className="h-4 w-4" />} disabled={phase === 'recording'}>
          Nghe câu {repeat > 1 && `×${repeat}`}
        </Button>
        {phase === 'recording' ? (
          <Button variant="danger" size="lg" onClick={stopRecording} icon={<Square className="h-4 w-4 fill-current" />} className="relative">
            <span className="absolute -inset-1 animate-ping rounded-xl bg-rose-400/30" aria-hidden="true" />
            Dừng ({sr.supported ? 'đang nghe…' : 'đang ghi…'})
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={startRecording} icon={<Mic className="h-5 w-5" />}>
            Ghi âm & nói theo
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => setIndex(Math.min(sentences.length - 1, index + 1))} disabled={index >= sentences.length - 1} aria-label="Câu sau">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {phase === 'recording' && sr.supported && (
        <p className="text-center text-sm text-muted">
          <span className="font-semibold text-ink">Đang nghe:</span> {sr.transcript} <span className="italic">{sr.interim}</span>
          {!sr.transcript && !sr.interim && '…'}
        </p>
      )}
      {(sr.error || rec.error) && <p className="text-center text-sm text-rose-500">{sr.error ?? rec.error}</p>}

      {phase === 'scored' && (
        <div className="animate-pop space-y-3 rounded-2xl border border-line p-4">
          {result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ScorePill score={result.score} />
                <span className="text-xs text-muted">
                  {result.correct}/{result.total} từ khớp
                </span>
              </div>
              <DiffView result={result} />
              {heard && (
                <p className="text-sm text-muted">
                  <span className="font-semibold">Máy nghe được:</span> “{heard}”
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Trình duyệt không hỗ trợ chấm tự động — hãy nghe lại và tự so sánh với bản gốc.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {rec.url && (
              <Button size="sm" variant="soft" icon={<Volume2 className="h-4 w-4" />} onClick={() => new Audio(rec.url!).play()}>
                Nghe giọng tôi
              </Button>
            )}
            <Button size="sm" variant="outline" icon={<Headphones className="h-4 w-4" />} onClick={() => playSentence(index)}>
              Nghe bản gốc
            </Button>
            <Button size="sm" variant="outline" icon={<Mic className="h-4 w-4" />} onClick={startRecording}>
              Thử lại
            </Button>
            {index < sentences.length - 1 && (
              <Button size="sm" variant="primary" onClick={() => setIndex(index + 1)}>
                Câu tiếp →
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
        <label className="flex items-center gap-2 font-medium text-ink">
          <Switch checked={auto} onChange={setAuto} label="Shadowing tự động" />
          <Wand2 className="h-4 w-4 text-fuchsia-500" /> Tự động: nghe → ghi âm → qua câu khi ≥ 80%
        </label>
        <label className="flex items-center gap-2 font-medium text-ink" title="Phát video trong lúc bạn nói (nên đeo tai nghe)">
          <Switch checked={along} onChange={setAlong} label="Nói cùng lúc với video" />
          Nói cùng lúc (đeo tai nghe)
        </label>
        <span className="hidden items-center gap-1.5 text-xs text-muted md:flex">
          <Kbd>R</Kbd> ghi âm · <Kbd>↑</Kbd> nghe lại câu
        </span>
      </div>
      {!sr.supported && (
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Trình duyệt này không hỗ trợ nhận dạng giọng nói, nên chỉ ghi âm để bạn tự nghe lại. Dùng Chrome hoặc Edge để được chấm điểm tự động.
        </p>
      )}
    </div>
  );
}
