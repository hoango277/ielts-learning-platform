import { ChevronLeft, ChevronRight, Lightbulb, PenLine, Play, RotateCcw, Snail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Badge, Kbd } from '../../components/ui/primitives';
import type { PlayerApi } from '../../hooks/useYouTubePlayer';
import { api } from '../../lib/api';
import { diffWords, tokenize, type DiffResult } from '../../lib/diff';
import type { Sentence } from '../../lib/types';
import { DiffView, ScorePill } from './ShadowingPanel';

export function DictationPanel({
  sentences,
  index,
  setIndex,
  player,
  playSentence,
  videoId,
  translation,
}: {
  sentences: Sentence[];
  index: number;
  setIndex: (i: number) => void;
  player: PlayerApi;
  playSentence: (i: number, o?: { repeat?: number; onDone?: () => void }) => void;
  videoId: string;
  translation?: string;
}) {
  const s = sentences[index];
  const [input, setInput] = useState('');
  const [result, setResult] = useState<DiffResult | null>(null);
  const [hints, setHints] = useState(0);
  const [stats, setStats] = useState({ done: 0, perfect: 0, total: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const first = useRef(true);

  useEffect(() => {
    setInput('');
    setResult(null);
    setHints(0);
    inputRef.current?.focus();
    // tự phát câu mới (trừ lần đầu mở chế độ khi video chưa sẵn sàng)
    if (!first.current || player.ready) playSentence(index);
    first.current = false;
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) return null;

  const replay = (slow = false) => {
    const prev = player.rate;
    if (slow) player.setRate(0.75);
    playSentence(index, { onDone: slow ? () => player.setRate(prev) : undefined });
    inputRef.current?.focus();
  };

  const check = () => {
    if (!input.trim()) return;
    const r = diffWords(s.text, input);
    setResult(r);
    setStats((st) => ({ done: st.done + 1, perfect: st.perfect + (r.score === 1 ? 1 : 0), total: st.total + r.score }));
    api.sentencePractice(videoId, { kind: 'dictation', score: r.score }).catch(() => undefined);
  };

  const hint = () => {
    const target = tokenize(s.text).filter((t) => t.display);
    const r = diffWords(s.text, input);
    const firstWrong = r.tokens.findIndex((t) => t.state !== 'correct');
    const upto = firstWrong < 0 ? target.length : firstWrong + 1;
    setInput(target.slice(0, upto).map((t) => t.display).join(' ') + (upto < target.length ? ' ' : ''));
    setHints((h) => h + 1);
    inputRef.current?.focus();
  };

  const next = () => index < sentences.length - 1 && setIndex(index + 1);

  return (
    <div className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
            <PenLine className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-ink">Chép chính tả — câu {index + 1}/{sentences.length}</h3>
            <p className="text-xs text-muted">Nghe và gõ lại chính xác những gì bạn nghe được</p>
          </div>
        </div>
        {stats.done > 0 && (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {stats.perfect}/{stats.done} câu hoàn hảo · TB {Math.round((stats.total / stats.done) * 100)}%
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => replay()} icon={<Play className="h-4 w-4" />}>
          Nghe lại
        </Button>
        <Button variant="secondary" onClick={() => replay(true)} icon={<Snail className="h-4 w-4" />}>
          Nghe chậm
        </Button>
        <Button variant="ghost" onClick={hint} icon={<Lightbulb className="h-4 w-4 text-amber-500" />} disabled={!!result}>
          Gợi ý 1 từ {hints > 0 && `(${hints})`}
        </Button>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-muted sm:flex">
          <Kbd>Ctrl</Kbd> nghe lại · <Kbd>Enter</Kbd> kiểm tra / câu tiếp
        </span>
      </div>

      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          if (result) setResult(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (result) next();
            else check();
          }
          if (e.key === 'Control' && !e.repeat) replay();
        }}
        rows={3}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="Gõ những gì bạn nghe được…"
        aria-label="Câu bạn nghe được"
        className="w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-lg leading-relaxed text-ink placeholder:text-muted focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-400/20"
      />

      {result ? (
        <div className="animate-pop space-y-3 rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ScorePill score={result.score} />
            <span className="text-xs text-muted">
              {result.correct}/{result.total} từ đúng{hints ? ` · dùng ${hints} gợi ý` : ''}
              {result.extra.length > 0 && ` · thừa: ${result.extra.join(', ')}`}
            </span>
          </div>
          <DiffView result={result} />
          {translation && <p className="text-sm text-muted">{translation}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { setResult(null); setInput(''); replay(); }}>
              Làm lại
            </Button>
            <Button size="sm" variant="primary" onClick={next} disabled={index >= sentences.length - 1}>
              Câu tiếp →
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} icon={<ChevronLeft className="h-4 w-4" />}>
            Câu trước
          </Button>
          <Button variant="primary" onClick={check} disabled={!input.trim()}>
            Kiểm tra
          </Button>
          <Button variant="ghost" size="sm" onClick={next} disabled={index >= sentences.length - 1}>
            Bỏ qua <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
