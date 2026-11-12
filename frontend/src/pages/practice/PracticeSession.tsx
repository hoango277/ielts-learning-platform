import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { ArrowLeft, Check, Flame, HelpCircle, Languages, Lightbulb, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button, LinkButton } from '../../components/ui/Button';
import { Emoji3D } from '../../components/ui/Emoji3D';
import { Card, CountUp, EmptyState, ErrorBox, Kbd, Progress, Ring, Skeleton } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { AudioButton, Highlight, useAccent } from '../../components/word/bits';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useLocalStorage } from '../../hooks/misc';
import { api } from '../../lib/api';
import { checkTyped } from '../../lib/diff';
import { pronounce, speak } from '../../lib/speech';
import type { PracticeItem, PracticeMode, PracticeSource, Question } from '../../lib/types';
import { cn, posLabel, CONFETTI_COLORS } from '../../lib/utils';
import { TopicPicker } from '../../components/practice/TopicPicker';
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
  mcq_collocation: 'Chọn từ hay đi cùng (collocation)',
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

type Answered = { correct: boolean; given: string; gaveUp?: boolean };

const PROVIDER_LABEL: Record<string, string> = { hymt: 'Dịch bằng AI (Hy-MT)', google: 'Google Dịch', mymemory: 'Dịch máy MyMemory' };

// Nút trong thanh trợ giúp tự xử lý Enter/Space → không để lọt ra phím tắt toàn trang (vd. Enter = câu tiếp theo)
const stopKeys = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
};

/**
 * Trợ giúp khi chưa chắc: nghe đọc to (giọng Anh–Mỹ/Anh–Anh theo Cài đặt) và dịch sang tiếng Việt
 * (bộ dịch chọn trong Cài đặt: Google hoặc mô hình AI Hy-MT). Có sẵn bản dịch trong dữ liệu thì hiện luôn, không gọi API.
 */
function HelpBar({ speakText, translateText, known, className }: { speakText?: string; translateText?: string; known?: string | null; className?: string }) {
  const { accent, rate } = useAccent();
  const [show, setShow] = useState(false);
  const tr = useQuery({
    queryKey: ['translate', translateText],
    queryFn: () => api.translate(translateText!),
    enabled: show && !known && Boolean(translateText),
    staleTime: Infinity,
    retry: 0,
  });
  if (!speakText && !translateText) return null;
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap gap-1.5">
        {speakText && (
          <Button type="button" size="sm" variant="ghost" className="text-muted" icon={<Volume2 className="h-4 w-4" />} onKeyDown={stopKeys} onClick={() => speak(speakText, { accent, rate })}>
            Nghe đọc
          </Button>
        )}
        {translateText && (
          <Button type="button" size="sm" variant="ghost" className="text-muted" icon={<Languages className="h-4 w-4" />} onKeyDown={stopKeys} onClick={() => setShow((v) => !v)} aria-expanded={show}>
            {show ? 'Ẩn bản dịch' : 'Dịch sang tiếng Việt'}
          </Button>
        )}
      </div>
      {show && translateText && (
        <p className="animate-fade-in rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink" aria-live="polite">
          {known ?? (tr.isPending ? 'Đang dịch…' : tr.error ? 'Chưa dịch được — kiểm tra kết nối mạng hoặc bộ dịch trong Cài đặt.' : tr.data?.translation)}
          {!known && tr.data && <span className="mt-0.5 block text-[11px] font-semibold text-muted">{PROVIDER_LABEL[tr.data.provider] ?? tr.data.provider}</span>}
        </p>
      )}
    </div>
  );
}

const BLANK = '_____';
const plain = (sentence?: string) => (sentence ?? '').replace(/\[\[|\]\]/g, '');
/** Câu "nâng cấp từ" sau khi trả lời: thay từ cơ bản [[...]] bằng từ hay hơn */
const upgraded = (sentence: string, better: string) => sentence.replace(/\[\[[^\]]*\]\]/, better);

/** Trợ giúp TRƯỚC khi trả lời — chỉ những gì không làm lộ đáp án. */
function helpBefore(q: Question): { speakText?: string; translateText?: string; known?: string | null } {
  switch (q.type) {
    case 'mcq_definition':
      return { speakText: q.prompt, translateText: q.prompt };
    case 'mcq_upgrade':
      return { speakText: plain(q.sentence), translateText: plain(q.sentence) };
    case 'cloze':
    case 'wordform':
    case 'mcq_collocation':
      // Không đọc to (giọng máy sẽ đọc lộ chỗ trống); dịch câu là gợi ý hợp lệ
      return { translateText: q.sentence?.split(BLANK).join('…'), known: q.sentenceVi };
    default:
      // Chọn nghĩa / chọn từ / chính tả / nghe: nghe hay dịch đều lộ đáp án
      return {};
  }
}

/** Từ cần đọc sau khi trả lời: dạng điền từ/nâng cấp đọc đúng từ điền vào, còn lại đọc từ đang học. */
function answerWord(q: Question) {
  return q.type === 'wordform' || q.type === 'mcq_upgrade' || q.type === 'mcq_collocation' ? q.answer : q.item.term;
}

function QuestionView({ q, onAnswer, answered }: { q: Question; onAnswer: (correct: boolean, given: string, gaveUp?: boolean) => void; answered: Answered | null }) {
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
    // Dạng từ & nghe-gõ: khác 1 chữ thường là từ khác (employer/employee, affect/effect) → không chấm "gần đúng"
    const r = checkTyped(input, q.accept ?? [q.answer], { fuzzy: q.type !== 'wordform' && q.type !== 'listening' });
    setClose(r.close);
    onAnswer(r.ok, input);
  };

  // "Không biết": ghi là câu sai (từ vào nhóm "Hay sai"; nếu đang đến hạn ôn thì lịch ôn xếp lại như "Quên") rồi hiện đáp án.
  // Tốt hơn đoán mò — đoán trúng làm lịch ôn tưởng bạn đã nhớ.
  const giveUp = () => {
    if (!answered) onAnswer(false, '', true);
  };

  useHotkeys(
    isMcq && !answered
      ? { ...Object.fromEntries((q.options ?? []).map((opt, i) => [String(i + 1), () => onAnswer(opt === q.answer, opt)])), '0': giveUp }
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
          {q.item.ipa && <span className="font-ipa text-muted">{q.item.ipa}</span>}
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
                  <span className={cn('mx-1 inline-block min-w-24 border-b-4 px-2 text-center', answered ? (answered.correct ? 'border-emerald-500 text-emerald-600' : 'border-rose-500 text-rose-600') : 'border-brand-400 text-brand-600')}>
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
            className="press flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-rose-400 to-rose-600 text-white [--edge:var(--color-rose-700)] hover:brightness-110"
            aria-label="Nghe lại"
          >
            <Volume2 className="h-10 w-10" />
          </button>
          <button type="button" onClick={() => pronounce(q.item.term, { accent, rate: 0.6 })} className="text-sm font-semibold text-muted hover:text-ink">
            🐢 Nghe chậm
          </button>
        </div>
      )}

      {!answered && <HelpBar {...helpBefore(q)} />}

      {/* Trả lời */}
      {isMcq ? (
        <div className="grid grid-cols-1 gap-3 pb-1 sm:grid-cols-2">
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
                  'press flex items-center gap-3 rounded-2xl border-2 p-4 text-left font-semibold',
                  !answered && 'border-line bg-surface [--edge:var(--border)] hover:border-brand-300 hover:bg-brand-50/60 hover:[--edge:var(--color-brand-300)] dark:hover:bg-brand-500/10 dark:hover:[--edge:var(--color-brand-900)]',
                  answered && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-800 [--edge:var(--color-emerald-500)] dark:bg-emerald-500/15 dark:text-emerald-200',
                  answered && chosen && !isAnswer && 'animate-shake border-rose-500 bg-rose-50 text-rose-700 [--edge:var(--color-rose-500)] dark:bg-rose-500/15 dark:text-rose-200',
                  answered && !isAnswer && !chosen && 'border-line opacity-50 [--edge:var(--border)]',
                )}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-xs font-bold text-muted">{i + 1}</span>
                <span className="flex-1 text-ink">{opt}</span>
                {answered && isAnswer && <Check className="h-5 w-5 animate-bounce-in text-emerald-500" strokeWidth={3} />}
                {answered && chosen && !isAnswer && <X className="h-5 w-5 text-rose-500" strokeWidth={3} />}
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
            // Bấm "Không biết" → hiện luôn đáp án đúng trong ô để nhìn mặt chữ
            value={answered?.gaveUp ? (q.accept?.[0] ?? q.answer) : input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!!answered}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={q.hint ? `Gợi ý: ${q.hint}` : 'Gõ câu trả lời…'}
            aria-label="Câu trả lời"
            className={cn(
              'h-14 w-full rounded-2xl border-2 bg-surface px-4 text-xl font-semibold text-ink shadow-[inset_0_2px_4px_rgb(0_0_0/0.04)] transition focus:outline-none',
              !answered && 'border-line focus:border-brand-400 focus:ring-4 focus:ring-brand-500/15',
              answered?.correct && 'border-emerald-500',
              answered && !answered.correct && !answered.gaveUp && 'animate-shake border-rose-500',
              answered?.gaveUp && 'border-amber-400 text-amber-800 dark:text-amber-200',
            )}
          />
          {!answered && (
            <div className="flex items-center justify-between text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <Lightbulb className="h-4 w-4 text-amber-500" /> {q.hint}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="ghost" onClick={giveUp} icon={<HelpCircle className="h-4 w-4" />} className="text-muted">
                  Không biết
                </Button>
                <Button type="submit" variant="primary" disabled={!input.trim()}>
                  Kiểm tra
                </Button>
              </span>
            </div>
          )}
        </form>
      )}

      {answered && (
        <div
          className={cn(
            'animate-pop rounded-2xl p-4',
            answered.correct
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100'
              : answered.gaveUp
                ? 'bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100'
                : 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100',
          )}
        >
          <p className="font-display text-lg font-extrabold">
            {answered.correct ? (close ? 'Gần đúng! Chú ý chính tả nhé 👍' : 'Chính xác! 🎉') : answered.gaveUp ? 'Không sao — đây là đáp án 💡' : 'Chưa đúng 😅'}
          </p>
          {answered.gaveUp && <p className="text-sm opacity-80">Từ này được đưa vào nhóm “Hay sai” để bạn luyện lại sớm.</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm">
            <AudioButton term={answerWord(q)} audio={answerWord(q) === q.item.term ? q.item.audio : undefined} size="sm" />
            <b>{answerWord(q)}</b>
            {!q.explain && (
              <>
                {q.item.ipa && <span className="font-ipa">{q.item.ipa}</span>} — {q.item.meaning}
              </>
            )}
          </p>
          {q.explain && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{q.explain}</p>}
          {q.item.examples[0] && !['cloze', 'wordform', 'mcq_collocation', 'mcq_upgrade'].includes(q.type) && (
            <>
              <p className="mt-1 text-sm italic opacity-80">
                “<Highlight text={q.item.examples[0].en} term={q.item.term} />”
              </p>
              <HelpBar speakText={q.item.examples[0].en} translateText={q.item.examples[0].en} known={q.item.examples[0].vi} className="mt-1" />
            </>
          )}
          {['cloze', 'wordform', 'mcq_collocation', 'mcq_upgrade'].includes(q.type) && q.sentence && (
            <HelpBar
              speakText={q.type === 'mcq_upgrade' ? upgraded(q.sentence, q.answer) : q.sentence.split(BLANK).join(q.accept?.[1] ?? q.answer)}
              translateText={q.type === 'mcq_upgrade' ? upgraded(q.sentence, q.answer) : q.sentence.split(BLANK).join(q.accept?.[1] ?? q.answer)}
              known={q.sentenceVi}
              className="mt-2"
            />
          )}
        </div>
      )}
      {isMcq && !answered && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={giveUp} icon={<HelpCircle className="h-4 w-4" />} className="text-muted">
            Không biết — xem đáp án <Kbd className="ml-1">0</Kbd>
          </Button>
        </div>
      )}
    </div>
  );
}

function Results({ outcomes, xp, mode, onAgain }: { outcomes: Outcome[]; xp: number; mode: PracticeMode; onAgain: () => void }) {
  const correct = outcomes.filter((o) => o.correct).length;
  const acc = outcomes.length ? correct / outcomes.length : 0;
  useEffect(() => {
    if (acc >= 0.7) confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 }, colors: CONFETTI_COLORS });
  }, [acc]);
  const wrong = outcomes.filter((o) => !o.correct);
  return (
    <Card className="mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <Ring value={acc} size={140} stroke={13}>
            <div>
              <p className="font-display text-3xl font-black text-ink">
                <CountUp value={Math.round(acc * 100)} />%
              </p>
              <p className="text-xs text-muted">
                {correct}/{outcomes.length} đúng
              </p>
            </div>
          </Ring>
          {/* Huy hiệu 3D theo kết quả, bật lên một lần */}
          <Emoji3D
            emoji={acc === 1 ? '🏆' : acc >= 0.8 ? '🌟' : acc >= 0.5 ? '💪' : '📚'}
            size={60}
            className="absolute -right-5 -top-3 animate-bounce-in drop-shadow-[0_8px_10px_rgb(28_27_26/0.22)] [animation-delay:200ms]"
          />
        </div>
        <h2 className="mt-4 text-2xl font-extrabold text-ink">{acc === 1 ? 'Hoàn hảo!' : acc >= 0.8 ? 'Xuất sắc!' : acc >= 0.5 ? 'Làm tốt lắm!' : 'Cố lên, luyện thêm nhé!'}</h2>
        <p className="text-muted">
          +{xp} <Term k="xp">XP</Term> · {MODES.find((m) => m.key === mode)?.title}
        </p>
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
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [autoSpeak, setAutoSpeak] = useLocalStorage('practice-auto-speak', true);
  const { accent, rate } = useAccent();
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

  const onAnswer = (correct: boolean, given: string, gaveUp = false) => {
    if (!q || answered) return;
    setAnswered({ correct, given, gaveUp });
    // Trả lời xong → đọc to đúng từ đó (nối âm với mặt chữ). Tắt được bằng nút loa ở đầu phiên.
    if (autoSpeak) {
      const w = answerWord(q);
      pronounce(w, { audio: w === q.item.term ? q.item.audio : undefined, accent, rate });
    }
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
        <p className="flex items-center gap-2 font-display text-lg font-extrabold text-ink">
          {title && <Emoji3D emoji={title.emoji} size={28} />} {title?.title}
        </p>
        {mode !== 'match' && mode !== 'synonym' && questions.length > 0 && <Progress value={(idx + (answered ? 1 : 0)) / questions.length} className="mt-1.5" />}
      </div>
      {combo >= 2 && (
        <span className="inline-flex animate-pop items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
          <Flame className="h-4 w-4 origin-bottom animate-flicker fill-orange-400" /> {combo} đúng liên tiếp
        </span>
      )}
      {mode !== 'match' && mode !== 'synonym' && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setAutoSpeak((v) => !v)}
          aria-pressed={autoSpeak}
          aria-label={autoSpeak ? 'Đang bật tự đọc từ sau mỗi câu — bấm để tắt' : 'Đang tắt tự đọc từ — bấm để bật'}
          title={autoSpeak ? 'Tự đọc từ sau mỗi câu: bật' : 'Tự đọc từ sau mỗi câu: tắt'}
          className={autoSpeak ? 'text-brand-600 dark:text-brand-300' : 'text-muted'}
        >
          {autoSpeak ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>
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
    // Bộ chủ đề chưa đủ dữ liệu cho dạng bài này (vd. họ từ, đồng nghĩa) → gợi ý dạng Tổng hợp với cùng chủ đề.
    // Sổ từ trống/quá ít → chọn ngay một bộ chủ đề để luyện đúng dạng bài đang chọn, không phải quay lại từ đầu.
    const playTopic = (id: number, m: PracticeMode = mode) =>
      navigate(`/practice/play?${new URLSearchParams({ mode: m, source: 'topic', topicId: String(id), count: String(count) })}`);
    if (source === 'topic' && topicId) {
      return (
        <EmptyState
          icon="🪹"
          title="Chủ đề này chưa đủ dữ liệu cho dạng bài này"
          description="Một số dạng bài (họ từ, từ đồng nghĩa…) cần thêm dữ liệu mà bộ chủ đề này chưa có. Thử dạng Tổng hợp hoặc chọn dạng khác."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {mode !== 'mixed' && (
                <Button variant="primary" onClick={() => playTopic(topicId, 'mixed')}>
                  Luyện Tổng hợp với chủ đề này
                </Button>
              )}
              <LinkButton to={`/practice?source=topic&topicId=${topicId}`} variant="outline">
                Chọn dạng bài khác
              </LinkButton>
            </div>
          }
        />
      );
    }
    return (
      <EmptyState
        icon="🪹"
        title="Sổ từ chưa đủ từ cho lượt luyện này"
        description="Luyện ngay với một bộ từ chủ đề IELTS có sẵn — chọn chủ đề bên dưới là bắt đầu, không cần lưu từ trước."
        className="mx-auto max-w-3xl"
        action={
          <div className="space-y-4">
            <TopicPicker layout="wrap" onPick={(id) => playTopic(id)} />
            <LinkButton to="/practice" variant="ghost">
              Quay lại chọn dạng bài
            </LinkButton>
          </div>
        }
      />
    );
  }

  if (done) {
    // Đặt lại ngay khi bấm (không đợi dữ liệu mới) → màn kết quả cũ không hiện lại và không bắn pháo giấy lần nữa
    const again = () => {
      setDone(false);
      setIdx(0);
      setOutcomes([]);
      setAnswered(null);
      setRound((r) => r + 1);
    };
    return <Results outcomes={outcomes} xp={xp} mode={mode} onAgain={again} />;
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
