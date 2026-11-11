import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { ArrowLeft, Check, Flame, Lightbulb, RotateCcw, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, LinkButton } from '../../components/ui/Button';
import { Card, EmptyState, ErrorBox, Kbd, Progress, Ring, Skeleton } from '../../components/ui/primitives';
import { AudioButton, Highlight, useAccent } from '../../components/word/bits';
import { useHotkeys } from '../../hooks/useHotkeys';
import { api } from '../../lib/api';
import { checkTyped } from '../../lib/diff';
import { pronounce } from '../../lib/speech';
import type { PracticeItem, PracticeMode, PracticeSource, Question } from '../../lib/types';
import { cn, posLabel } from '../../lib/utils';
import { MatchGame } from './MatchGame';
import { MODES } from './PracticeHub';

interface Outcome {
  item: PracticeItem;
  correct: boolean;
  given?: string;
}

const TYPE_LABEL: Record<Question['type'], string> = {
  mcq_meaning: 'Chọn nghĩa đúng',
  mcq_term: 'Chọn từ tiếng Anh đúng',
  mcq_definition: 'Từ nào khớp với định nghĩa?',
  cloze: 'Điền từ còn thiếu',
  listening: 'Nghe và gõ lại',
  spelling: 'Gõ từ tiếng Anh',
  mcq_collocation: 'Chọn collocation đúng',
  mcq_upgrade: 'Nâng cấp từ cơ bản',
  wordform: 'Điền dạng đúng của từ',
};

/** Câu có từ cơ bản đánh dấu [[...]] → gạch dưới từ đó. */
function MarkedSentence({ text, replacement, correct }: { text: string; replacement?: string; correct?: boolean }) {
  const m = text.match(/\[\[([^\]]+)\]\]/);
  if (!m || m.index === undefined) return <>{text}</>;
  return (
    <>
      {text.slice(0, m.index)}
      {replacement ? (
        <span className={cn('rounded-md px-1 font-bold', correct ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200')}>
          {replacement}
        </span>
      ) : (
        <span className="rounded-md bg-amber-100 px-1 font-bold text-amber-800 underline decoration-wavy decoration-amber-500 underline-offset-4 dark:bg-amber-500/20 dark:text-amber-200">{m[1]}</span>
      )}
      {text.slice(m.index + m[0].length)}
    </>
  );
}

function QuestionView({ q, onAnswer, answered }: { q: Question; onAnswer: (correct: boolean, given: string) => void; answered: { correct: boolean; given: string } | null }) {
  const { accent, rate } = useAccent();
  const [input, setInput] = useState('');
  const [close, setClose] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isMcq = Boolean(q.options);

  useEffect(() => {
    setInput('');
    setClose(false);
    if (q.type === 'listening') pronounce(q.item.term, { audio: q.item.audio, accent, rate });
    if (!isMcq) setTimeout(() => inputRef.current?.focus(), 50);
  }, [q.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitTyped = () => {
    if (answered || !input.trim()) return;
    const r = checkTyped(input, q.accept ?? [q.answer]);
    setClose(r.close);
    onAnswer(r.ok, input);
  };

  useHotkeys(
    isMcq && !answered
      ? Object.fromEntries((q.options ?? []).map((opt, i) => [String(i + 1), () => onAnswer(opt === q.answer, opt)]))
      : {},
  );

  return (
    <div className="space-y-5">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">{TYPE_LABEL[q.type]}</p>

      {/* Đề bài */}
      {q.type === 'mcq_meaning' && (
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-4xl font-extrabold text-ink">{q.prompt}</h2>
          <AudioButton term={q.item.term} audio={q.item.audio} />
          {q.item.ipa && <span className="font-mono text-muted">{q.item.ipa}</span>}
        </div>
      )}
      {(q.type === 'mcq_term' || q.type === 'spelling') && (
        <div>
          <h2 className="text-3xl font-extrabold text-ink">{q.prompt}</h2>
          {q.item.pos && <p className="mt-1 text-sm text-muted">({posLabel(q.item.pos)})</p>}
          {q.type === 'spelling' && q.item.definition && <p className="mt-2 text-sm italic text-muted">{q.item.definition}</p>}
        </div>
      )}
      {q.type === 'mcq_definition' && <h2 className="text-xl font-bold leading-relaxed text-ink">“{q.prompt}”</h2>}
      {q.type === 'mcq_upgrade' && (
        <div className="space-y-2">
          <p className="text-2xl font-semibold leading-relaxed text-ink">
            <MarkedSentence text={q.sentence!} replacement={answered ? q.answer : undefined} correct={answered?.correct} />
          </p>
          <p className="text-sm text-muted">{q.prompt}</p>
        </div>
      )}
      {(q.type === 'cloze' || q.type === 'wordform' || q.type === 'mcq_collocation') && (
        <div className="space-y-2">
          <p className="text-2xl font-semibold leading-relaxed text-ink">
            {q.sentence!.split('_____').map((part, i, arr) => (
              <span key={i}>
                {part}
                {i < arr.length - 1 && (
                  <span className={cn('mx-1 inline-block min-w-24 border-b-4 px-2 text-center', answered ? (answered.correct ? 'border-emerald-500 text-emerald-600' : 'border-rose-500 text-rose-600') : 'border-violet-400 text-violet-600')}>
                    {answered ? (q.accept?.[1] ?? q.answer) : input || ' '}
                  </span>
                )}
              </span>
            ))}
          </p>
          {q.type === 'wordform' ? (
            <p className="text-sm text-muted">
              Từ gốc: <b className="text-lg tracking-wide text-ink">{q.prompt}</b>
            </p>
          ) : q.type === 'mcq_collocation' ? (
            <p className="text-sm text-muted">{q.prompt}</p>
          ) : (
            <p className="text-sm text-muted">
              Gợi ý: <b className="text-ink">{q.prompt}</b>
              {q.sentenceVi && answered && <span className="block">{q.sentenceVi}</span>}
            </p>
          )}
        </div>
      )}
      {q.type === 'listening' && (
        <div className="flex flex-col items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => pronounce(q.item.term, { audio: q.item.audio, accent, rate })}
            className="flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-rose-500 to-orange-400 text-white shadow-xl shadow-rose-500/30 transition active:scale-95"
            aria-label="Nghe lại"
          >
            <Volume2 className="h-10 w-10" />
          </button>
          <button type="button" onClick={() => pronounce(q.item.term, { accent, rate: 0.6 })} className="text-sm font-semibold text-muted hover:text-ink">
            🐢 Nghe chậm
          </button>
        </div>
      )}

      {/* Trả lời */}
      {isMcq ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {q.options!.map((opt, i) => {
            const isAnswer = opt === q.answer;
            const chosen = answered?.given === opt;
            return (
              <button
                key={opt + i}
                type="button"
                disabled={!!answered}
                onClick={() => onAnswer(isAnswer, opt)}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border-2 p-4 text-left font-semibold transition',
                  !answered && 'border-line bg-surface hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md',
                  answered && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
                  answered && chosen && !isAnswer && 'animate-shake border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
                  answered && !isAnswer && !chosen && 'border-line opacity-50',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{i + 1}</span>
                <span className="flex-1 text-ink">{opt}</span>
                {answered && isAnswer && <Check className="h-5 w-5 text-emerald-500" />}
                {answered && chosen && !isAnswer && <X className="h-5 w-5 text-rose-500" />}
              </button>
            );
          })}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitTyped();
          }}
          className="space-y-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!!answered}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={q.hint ? `Gợi ý: ${q.hint}` : 'Gõ câu trả lời…'}
            aria-label="Câu trả lời"
            className={cn(
              'h-14 w-full rounded-2xl border-2 bg-surface px-4 text-xl font-semibold text-ink focus:outline-none',
              !answered && 'border-line focus:border-violet-400',
              answered?.correct && 'border-emerald-500',
              answered && !answered.correct && 'animate-shake border-rose-500',
            )}
          />
          {!answered && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Lightbulb className="h-4 w-4 text-amber-500" /> {q.hint}
              </span>
              <Button type="submit" variant="primary" disabled={!input.trim()}>
                Kiểm tra
              </Button>
            </div>
          )}
        </form>
      )}

      {answered && (
        <div
          className={cn(
            'animate-pop rounded-2xl p-4',
            answered.correct ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100',
          )}
        >
          <p className="font-bold">{answered.correct ? (close ? 'Gần đúng! Chú ý chính tả nhé 👍' : 'Chính xác! 🎉') : 'Chưa đúng 😅'}</p>
          {q.explain ? (
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{q.explain}</p>
          ) : (
          <p className="mt-1 text-sm">
            <b>{q.item.term}</b> {q.item.ipa && <span className="font-mono">{q.item.ipa}</span>} — {q.item.meaning}
          </p>
          )}
          {q.item.examples[0] && !['cloze', 'wordform', 'mcq_collocation', 'mcq_upgrade'].includes(q.type) && (
            <p className="mt-1 text-sm italic opacity-80">
              “<Highlight text={q.item.examples[0].en} term={q.item.term} />”
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Results({ outcomes, xp, mode, onAgain }: { outcomes: Outcome[]; xp: number; mode: PracticeMode; onAgain: () => void }) {
  const correct = outcomes.filter((o) => o.correct).length;
  const acc = outcomes.length ? correct / outcomes.length : 0;
  useEffect(() => {
    if (acc >= 0.7) confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
  }, [acc]);
  const wrong = outcomes.filter((o) => !o.correct);
  return (
    <Card className="mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <Ring value={acc} size={140} stroke={13}>
          <div>
            <p className="text-3xl font-extrabold text-ink">{Math.round(acc * 100)}%</p>
            <p className="text-xs text-muted">
              {correct}/{outcomes.length} đúng
            </p>
          </div>
        </Ring>
        <h2 className="mt-4 text-2xl font-extrabold text-ink">{acc === 1 ? 'Hoàn hảo! 🏆' : acc >= 0.8 ? 'Xuất sắc! 🌟' : acc >= 0.5 ? 'Làm tốt lắm! 💪' : 'Cố lên, luyện thêm nhé! 📚'}</h2>
        <p className="text-muted">+{xp} XP · {MODES.find((m) => m.key === mode)?.title}</p>
      </div>
      {wrong.length > 0 && (
        <div>
          <p className="mb-2 font-bold text-ink">Từ cần xem lại ({wrong.length})</p>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {wrong.map((o) => (
              <li key={o.item.key} className="flex items-center gap-3 px-4 py-2.5">
                <AudioButton term={o.item.term} audio={o.item.audio} size="sm" />
                <span className="font-bold text-ink">{o.item.term}</span>
                <span className="flex-1 truncate text-sm text-muted">{o.item.meaning}</span>
                {o.given && <span className="hidden text-xs text-rose-500 line-through sm:inline">{o.given}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" icon={<RotateCcw className="h-4 w-4" />} onClick={onAgain}>
          Luyện tiếp
        </Button>
        <LinkButton to="/practice" variant="outline">Đổi dạng bài</LinkButton>
        <LinkButton to="/review" variant="ghost">Ôn tập thẻ</LinkButton>
      </div>
    </Card>
  );
}

export default function PracticeSession() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mode = (params.get('mode') as PracticeMode) ?? 'mixed';
  const source = (params.get('source') as PracticeSource) ?? 'all';
  const count = Number(params.get('count')) || 10;
  const topicId = Number(params.get('topicId')) || undefined;
  const videoId = params.get('videoId') ?? undefined;
  const [round, setRound] = useState(0);
  const session = useQuery({
    queryKey: ['practice', mode, source, count, topicId, videoId, round],
    queryFn: () => api.practiceSession({ mode, source, count, topicId, videoId }),
    staleTime: Infinity,
    gcTime: 0,
  });
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState<{ correct: boolean; given: string } | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [combo, setCombo] = useState(0);
  const [xp, setXp] = useState(0);
  const [done, setDone] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    setIdx(0);
    setAnswered(null);
    setOutcomes([]);
    setCombo(0);
    setXp(0);
    setDone(false);
    startedAt.current = Date.now();
  }, [session.data]);

  const answer = useMutation({ mutationFn: api.practiceAnswer, onSuccess: (r) => setXp((x) => x + r.xp) });
  const complete = useMutation({
    mutationFn: api.practiceComplete,
    onSuccess: (r) => {
      setXp((x) => x + r.bonusXp);
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['words'] });
    },
  });

  const questions = session.data?.questions ?? [];
  const q = questions[idx];

  const finish = (all: Outcome[]) => {
    setDone(true);
    complete.mutate({ mode, total: all.length, correct: all.filter((o) => o.correct).length, durationSec: Math.round((Date.now() - startedAt.current) / 1000) });
  };

  const onAnswer = (correct: boolean, given: string) => {
    if (!q || answered) return;
    setAnswered({ correct, given });
    setCombo((c) => (correct ? c + 1 : 0));
    const next = [...outcomes, { item: q.item, correct, given }];
    setOutcomes(next);
    answer.mutate({ wordId: q.item.wordId, correct, mode });
    if (correct) setTimeout(() => goNext(next), 1100);
  };

  const goNext = (all = outcomes) => {
    setAnswered(null);
    if (idx + 1 >= questions.length) finish(all);
    else setIdx((i) => i + 1);
  };

  useHotkeys(answered && !answered.correct ? { Enter: () => goNext() } : {});

  const title = MODES.find((m) => m.key === mode);
  const header = (
    <div className="flex items-center gap-3">
      <Button variant="ghost" size="icon" onClick={() => navigate('/practice')} aria-label="Thoát">
        <ArrowLeft className="h-5 w-5" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink">
          {title?.emoji} {title?.title}
        </p>
        {mode !== 'match' && mode !== 'synonym' && questions.length > 0 && <Progress value={(idx + (answered ? 1 : 0)) / questions.length} className="mt-1.5" />}
      </div>
      {combo >= 2 && (
        <span className="inline-flex animate-pop items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
          <Flame className="h-4 w-4 fill-orange-400" /> {combo}
        </span>
      )}
      {mode !== 'match' && mode !== 'synonym' && questions.length > 0 && (
        <span className="text-sm font-semibold text-muted">
          {Math.min(idx + 1, questions.length)}/{questions.length}
        </span>
      )}
    </div>
  );

  if (session.error) return <ErrorBox error={session.error} onRetry={() => session.refetch()} />;
  if (session.isPending) return <Skeleton className="mx-auto h-96 max-w-2xl rounded-3xl" />;

  const isMatch = mode === 'match' || mode === 'synonym';
  const empty = isMatch ? session.data.items.length < 3 : questions.length === 0;
  if (empty) {
    return (
      <EmptyState
        icon="🪹"
        title="Chưa đủ từ để luyện"
        description="Nguồn từ bạn chọn chưa có từ nào (hoặc quá ít). Hãy thêm từ vào sổ hoặc chọn nguồn “Theo chủ đề”."
        action={
          <div className="flex gap-2">
            <LinkButton to="/practice" variant="primary">Chọn lại</LinkButton>
            <LinkButton to="/topics" variant="outline">Bộ từ chủ đề</LinkButton>
          </div>
        }
      />
    );
  }

  if (done) {
    return <Results outcomes={outcomes} xp={xp} mode={mode} onAgain={() => setRound((r) => r + 1)} />;
  }

  if (isMatch) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        {header}
        <Card className="p-5">
          <MatchGame
            key={round}
            items={session.data.items}
            onFinish={({ wrongKeys }) => {
              const all = session.data.items.map((item) => ({ item, correct: !wrongKeys.has(item.key) }));
              setOutcomes(all);
              all.forEach((o) => answer.mutate({ wordId: o.item.wordId, correct: o.correct, mode }));
              finish(all);
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {header}
      <Card className="p-6 sm:p-8">{q && <QuestionView key={q.id} q={q} onAnswer={onAnswer} answered={answered} />}</Card>
      {answered && !answered.correct && (
        <div className="flex justify-end">
          <Button variant="primary" size="lg" onClick={() => goNext()}>
            Tiếp tục <Kbd className="ml-1 border-white/30 bg-white/20 text-white">Enter</Kbd>
          </Button>
        </div>
      )}
    </div>
  );
}
