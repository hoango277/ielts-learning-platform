import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { CheckCheck, Layers, PartyPopper, RotateCcw, Settings2, Undo2, Video } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { Card, EmptyState, ErrorBox, Kbd, Progress, Segmented, Skeleton, Switch } from '../components/ui/primitives';
import { ClipPlayer } from '../components/video/ClipPlayer';
import { AudioButton, Highlight, useAccent } from '../components/word/bits';
import { useLocalStorage } from '../hooks/misc';
import { useHotkeys } from '../hooks/useHotkeys';
import { api } from '../lib/api';
import { pronounce } from '../lib/speech';
import type { PhraseCard, ReviewCard } from '../lib/types';
import { cn, formatTime, posLabel, relativeTime } from '../lib/utils';

type Direction = 'en-vi' | 'vi-en' | 'mixed';
type Filter = 'all' | 'words' | 'phrases';
type QItem = { kind: 'word'; card: ReviewCard } | { kind: 'phrase'; card: PhraseCard };

const RATINGS = [
  { value: 1 as const, label: 'Quên', key: '1', className: 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/30' },
  { value: 2 as const, label: 'Khó', key: '2', className: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30' },
  { value: 3 as const, label: 'Nhớ', key: '3', className: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30' },
  { value: 4 as const, label: 'Dễ', key: '4', className: 'bg-sky-500 hover:bg-sky-600 shadow-sky-500/30' },
];

const LEARN_AGAIN_MS = 20 * 60_000;
const sameItem = (a: QItem, b: QItem) => a.kind === b.kind && a.card.id === b.card.id;

/** Trộn thẻ mẫu câu vào giữa thẻ từ (cứ 3 thẻ từ chen 1 mẫu câu) để buổi ôn đa dạng hơn. */
function mixQueue(words: ReviewCard[], phrases: PhraseCard[], filter: Filter): QItem[] {
  const w: QItem[] = filter === 'phrases' ? [] : words.map((card) => ({ kind: 'word', card }));
  const p: QItem[] = filter === 'words' ? [] : phrases.map((card) => ({ kind: 'phrase', card }));
  const out: QItem[] = [];
  let pi = 0;
  w.forEach((item, i) => {
    out.push(item);
    if ((i + 1) % 3 === 0 && pi < p.length) out.push(p[pi++]);
  });
  while (pi < p.length) out.push(p[pi++]);
  return out;
}

function CardFace({ card, side, reversed }: { card: ReviewCard; side: 'front' | 'back'; reversed: boolean }) {
  const ex = card.examples[0];
  const showTerm = (side === 'front') !== reversed;
  if (side === 'front') {
    return reversed ? (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Từ tiếng Anh nào có nghĩa là…</p>
        <p className="text-3xl font-extrabold text-ink">{card.meaning}</p>
        {card.pos && <p className="text-sm text-muted">({posLabel(card.pos)})</p>}
        {card.definition && <p className="max-w-md text-sm italic text-muted">{card.definition}</p>}
      </div>
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">{card.term}</p>
        <div className="flex items-center gap-2 text-muted">
          {card.ipa && <span className="font-mono">{card.ipa}</span>}
          <AudioButton term={card.term} audio={card.audio} />
        </div>
        {ex && (
          <p className="mt-2 max-w-lg text-base leading-relaxed text-muted">
            “<Highlight text={ex.en} term={card.term} />”
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-6 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xl font-extrabold text-ink">{card.term}</span>
        {card.ipa && <span className="font-mono text-sm text-muted">{card.ipa}</span>}
        <AudioButton term={card.term} audio={card.audio} />
        {card.pos && <span className="text-sm text-muted">· {posLabel(card.pos)}</span>}
      </div>
      <p className={cn('font-bold text-violet-700 dark:text-violet-300', showTerm ? 'text-2xl' : 'text-xl')}>{card.meaning}</p>
      {card.definition && <p className="text-sm leading-relaxed text-muted">{card.definition}</p>}
      {card.examples.slice(0, 2).map((e, i) => (
        <div key={i} className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="text-ink">
            <Highlight text={e.en} term={card.term} />
          </p>
          {e.vi && <p className="mt-0.5 text-muted">{e.vi}</p>}
          {e.videoId && (
            <Link to={`/watch/${e.videoId}?t=${Math.floor(e.time ?? 0)}`} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400">
              <Video className="h-3.5 w-3.5" /> Xem lại trong video ({formatTime(e.time ?? 0)})
            </Link>
          )}
        </div>
      ))}
      {card.collocations.length > 0 && <p className="text-sm text-muted">Collocation: {card.collocations.slice(0, 4).join(' · ')}</p>}
      {card.note && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">💡 {card.note}</p>}
    </div>
  );
}

/** Câu có cụm cần học bị che (mặt trước) hoặc tô màu (mặt sau). */
export function ChunkSentence({ sentence, chunk, hidden, className }: { sentence: string; chunk: string; hidden: boolean; className?: string }) {
  const i = chunk ? sentence.toLowerCase().indexOf(chunk.toLowerCase()) : -1;
  if (i < 0) return <span className={className}>{sentence}</span>;
  return (
    <span className={className}>
      {sentence.slice(0, i)}
      {hidden ? (
        <span className="mx-0.5 inline-block min-w-20 rounded-md border-b-4 border-violet-400 bg-violet-100/60 px-2 text-center text-violet-500 dark:bg-violet-500/15">
          {chunk.split(' ').map((w) => w[0] + '…').join(' ')}
        </span>
      ) : (
        <span className="rounded-md bg-violet-100 px-1 font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">{sentence.slice(i, i + chunk.length)}</span>
      )}
      {sentence.slice(i + chunk.length)}
    </span>
  );
}

function PhraseFace({ card, side }: { card: PhraseCard; side: 'front' | 'back' }) {
  if (side === 'front') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-500">Mẫu câu · nghe và nhớ lại cụm bị che</p>
        <p className="max-w-xl text-xl font-semibold leading-relaxed text-ink sm:text-2xl">
          <ChunkSentence sentence={card.sentence} chunk={card.chunk} hidden />
        </p>
        {!card.chunk && <p className="text-sm text-muted">Nhớ lại nghĩa và cách dùng của cả câu</p>}
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-6 text-left">
      <p className="text-xl font-semibold leading-relaxed text-ink">
        <ChunkSentence sentence={card.sentence} chunk={card.chunk} hidden={false} />
      </p>
      {card.sentenceVi && <p className="text-muted">{card.sentenceVi}</p>}
      {card.chunk && (
        <p className="rounded-xl bg-violet-50 p-3 text-sm dark:bg-violet-500/10">
          <b className="text-violet-700 dark:text-violet-200">{card.chunk}</b>
          {card.chunkVi && <span className="text-ink"> — {card.chunkVi}</span>}
        </p>
      )}
      {card.note && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">💡 {card.note}</p>}
      {card.videoId && (
        <Link
          to={`/watch/${card.videoId}?t=${Math.floor(card.start ?? 0)}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
        >
          <Video className="h-3.5 w-3.5" /> {card.videoTitle ?? 'Xem trong video'} ({formatTime(card.start ?? 0)})
        </Link>
      )}
    </div>
  );
}

function Summary({ stats, onRestart }: { stats: { reviewed: number; good: number; xp: number; startedAt: number }; onRestart: () => void }) {
  useEffect(() => {
    if (stats.reviewed === 0) return;
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: ['#8b5cf6', '#d946ef', '#fb923c', '#10b981', '#0ea5e9'] });
  }, [stats.reviewed]);
  const minutes = Math.max(1, Math.round((Date.now() - stats.startedAt) / 60000));
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <PartyPopper className="mx-auto h-14 w-14 text-fuchsia-500" />
      <h2 className="mt-3 text-2xl font-extrabold text-ink">Hoàn thành phiên ôn tập!</h2>
      <p className="mt-1 text-muted">Bạn đã ôn hết các thẻ đến hạn. Bộ não của bạn sẽ cảm ơn bạn 🧠</p>
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-violet-50 p-3 dark:bg-violet-500/10">
          <p className="text-2xl font-extrabold text-violet-600 dark:text-violet-300">{stats.reviewed}</p>
          <p className="text-xs text-muted">lượt ôn</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-300">{stats.reviewed ? Math.round((stats.good / stats.reviewed) * 100) : 0}%</p>
          <p className="text-xs text-muted">nhớ được</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-500/10">
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-300">+{stats.xp}</p>
          <p className="text-xs text-muted">XP · {minutes} phút</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <LinkButton to="/today" variant="primary">Tiếp tục kế hoạch hôm nay</LinkButton>
        <LinkButton to="/speaking" variant="outline">Luyện nói lại câu đã lưu</LinkButton>
        <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={onRestart}>
          Kiểm tra thẻ mới
        </Button>
      </div>
    </Card>
  );
}

export default function Review() {
  const qc = useQueryClient();
  const { accent } = useAccent();
  const [direction, setDirection] = useLocalStorage<Direction>('review-direction', 'en-vi');
  const [autoAudio, setAutoAudio] = useLocalStorage('review-audio', true);
  const [filter, setFilter] = useLocalStorage<Filter>('review-filter', 'all');
  const [showSettings, setShowSettings] = useState(false);
  const [session, setSession] = useState(0);
  const queueQ = useQuery({ queryKey: ['review-queue', session], queryFn: () => api.reviewQueue({ limit: 200 }), staleTime: Infinity, gcTime: 0 });
  const [queue, setQueue] = useState<QItem[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, good: 0, xp: 0, startedAt: Date.now() });
  const [playSignal, setPlaySignal] = useState(0);
  const reversedMap = useRef(new Map<number, boolean>());

  useEffect(() => {
    if (queueQ.data) {
      setQueue(mixQueue(queueQ.data.cards, queueQ.data.phrases ?? [], filter));
      setStats({ reviewed: 0, good: 0, xp: 0, startedAt: Date.now() });
      setFlipped(false);
    }
  }, [queueQ.data, filter]);

  const item = queue[0];
  const card = item?.kind === 'word' ? item.card : undefined;
  const reversed = card
    ? direction === 'mixed'
      ? (reversedMap.current.get(card.id) ?? (reversedMap.current.set(card.id, Math.random() < 0.5), reversedMap.current.get(card.id)!))
      : direction === 'vi-en'
    : false;

  // Tự phát âm khi hiện mặt có từ tiếng Anh; thẻ mẫu câu thì tự phát đoạn video gốc
  useEffect(() => {
    if (!item || !autoAudio) return;
    if (item.kind === 'phrase') {
      if (!flipped) setPlaySignal((n) => n + 1);
      return;
    }
    if (!reversed && !flipped) pronounce(item.card.term, { audio: item.card.audio, accent });
    if (reversed && flipped) pronounce(item.card.term, { audio: item.card.audio, accent });
  }, [item?.kind, item?.card.id, flipped]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['overview'] });
    qc.invalidateQueries({ queryKey: ['words'] });
    qc.invalidateQueries({ queryKey: ['word-keys'] });
    qc.invalidateQueries({ queryKey: ['phrases'] });
    qc.invalidateQueries({ queryKey: ['today'] });
  };

  const rate = useMutation({
    mutationFn: async ({ target, rating }: { target: QItem; rating: 1 | 2 | 3 | 4 }) => {
      if (target.kind === 'word') {
        const r = await api.review(target.card.id, rating);
        return { next: r.nextReview, xp: r.xp, updated: { kind: 'word', card: r.card } as QItem };
      }
      const r = await api.reviewPhrase(target.card.id, rating);
      return { next: r.nextReview, xp: r.xp, updated: { kind: 'phrase', card: r.phrase } as QItem };
    },
    onSuccess: (res, { rating }) => {
      setStats((s) => ({ ...s, reviewed: s.reviewed + 1, good: s.good + (rating >= 3 ? 1 : 0), xp: s.xp + res.xp }));
      setQueue((q) => {
        const rest = q.slice(1);
        // Thẻ còn trong bước học ngắn hạn → quay lại sau vài thẻ (giống Anki)
        if (new Date(res.next).getTime() - Date.now() < LEARN_AGAIN_MS) {
          const pos = Math.min(rest.length, 3);
          return [...rest.slice(0, pos), res.updated, ...rest.slice(pos)];
        }
        return rest;
      });
      setFlipped(false);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const known = useMutation({
    mutationFn: (id: number) => api.updateWord(id, { known: true }),
    onSuccess: (w) => {
      toast.success(`“${w.term}” đã được đánh dấu là đã thuộc — sẽ không xuất hiện khi ôn`);
      setQueue((q) => q.filter((c) => !(c.kind === 'word' && c.card.id === w.id)));
      setFlipped(false);
      invalidate();
    },
  });

  const undo = useMutation({
    mutationFn: api.undoReview,
    onSuccess: (res) => {
      const restored: QItem | null = res.card ? { kind: 'word', card: res.card } : res.phrase ? { kind: 'phrase', card: res.phrase } : null;
      if (!restored) {
        toast.message('Không có lượt ôn nào để hoàn tác');
        return;
      }
      setQueue((q) => [restored, ...q.filter((c) => !sameItem(c, restored))]);
      setStats((s) => ({ ...s, reviewed: Math.max(0, s.reviewed - 1) }));
      setFlipped(true);
      invalidate();
    },
  });

  const doRate = (r: 1 | 2 | 3 | 4) => item && flipped && !rate.isPending && rate.mutate({ target: item, rating: r });
  useHotkeys({
    space: () => item && setFlipped((f) => !f),
    Enter: () => item && (flipped ? doRate(3) : setFlipped(true)),
    '1': () => doRate(1),
    '2': () => doRate(2),
    '3': () => doRate(3),
    '4': () => doRate(4),
    z: () => undo.mutate(),
    r: () => item?.kind === 'phrase' && setPlaySignal((n) => n + 1),
  });

  const counts = useMemo(
    () => ({
      new: queue.filter((c) => c.card.state === 0).length,
      learning: queue.filter((c) => c.card.state === 1 || c.card.state === 3).length,
      review: queue.filter((c) => c.card.state === 2).length,
      phrases: queue.filter((c) => c.kind === 'phrase').length,
    }),
    [queue],
  );

  if (queueQ.error) return <ErrorBox error={queueQ.error} onRetry={() => queueQ.refetch()} />;
  if (queueQ.isPending) return <Skeleton className="mx-auto h-[460px] max-w-2xl rounded-3xl" />;

  const summary = queueQ.data.summary;
  const hasPhrases = (queueQ.data.phraseSummary?.total ?? 0) > 0;
  const filterBar = hasPhrases && (
    <Segmented<Filter>
      size="sm"
      value={filter}
      onChange={setFilter}
      ariaLabel="Loại thẻ"
      options={[
        { value: 'all', label: 'Tất cả' },
        { value: 'words', label: 'Từ vựng' },
        { value: 'phrases', label: 'Mẫu câu' },
      ]}
    />
  );

  if (!item) {
    if (stats.reviewed > 0) return <Summary stats={stats} onRestart={() => setSession((s) => s + 1)} />;
    return (
      <div className="space-y-4">
        {filterBar && <div className="flex justify-center">{filterBar}</div>}
        <EmptyState
          icon="🎉"
          title="Không có thẻ nào đến hạn"
          description={
            summary.newTotal > 0
              ? `Bạn đã học đủ ${summary.newLimit === 0 ? 'số thẻ mới hôm nay' : 'thẻ mới'}. Có thể tăng số thẻ mới/ngày trong Cài đặt.`
              : 'Thêm từ vào sổ (từ video hoặc bộ chủ đề) hoặc lưu mẫu câu từ phụ đề để bắt đầu ôn theo lịch lặp lại ngắt quãng.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <LinkButton to="/practice" variant="primary">Luyện tập tự do</LinkButton>
              <LinkButton to="/topics" variant="outline">Thêm từ theo chủ đề</LinkButton>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            <Layers className="h-7 w-7 text-fuchsia-500" /> Ôn tập
          </h1>
          <p className="text-sm text-muted">Lặp lại ngắt quãng FSRS — trả lời trung thực để lịch ôn chính xác nhất</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filterBar}
          <span className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-bold">
            <span className="text-sky-500" title="Thẻ mới">{counts.new}</span>
            <span className="text-amber-500" title="Đang học">{counts.learning}</span>
            <span className="text-violet-500" title="Ôn lại">{counts.review}</span>
          </span>
          <Button size="icon" variant="ghost" onClick={() => undo.mutate()} aria-label="Hoàn tác (Z)" title="Hoàn tác lượt vừa rồi (Z)" disabled={stats.reviewed === 0}>
            <Undo2 className="h-5 w-5" />
          </Button>
          <Button size="icon" variant={showSettings ? 'soft' : 'ghost'} onClick={() => setShowSettings((v) => !v)} aria-label="Tuỳ chọn" aria-expanded={showSettings}>
            <Settings2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {showSettings && (
        <Card className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            Chiều thẻ từ:
            <Segmented<Direction>
              size="sm"
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'en-vi', label: 'Anh → Việt' },
                { value: 'vi-en', label: 'Việt → Anh' },
                { value: 'mixed', label: 'Trộn' },
              ]}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Switch checked={autoAudio} onChange={setAutoAudio} label="Tự phát âm" /> Tự phát âm / phát đoạn gốc
          </label>
        </Card>
      )}

      <Progress value={stats.reviewed + queue.length ? stats.reviewed / (stats.reviewed + queue.length) : 0} />

      {/* Trình phát đoạn gốc đặt ngoài thẻ lật 3D (iframe trong vùng biến đổi 3D bị vẽ đè, che mất nút) */}
      {item.kind === 'phrase' && (
        <div className="flex items-center justify-center gap-3">
          <ClipPlayer clip={{ videoId: item.card.videoId, start: item.card.start, end: item.card.end, text: item.card.sentence }} playSignal={playSignal} size="sm" />
          <p className="max-w-48 text-xs text-muted">
            Nghe giọng gốc trong video rồi nhớ lại cụm bị che · phím <Kbd>R</Kbd> nghe lại
          </p>
        </div>
      )}

      <div className="perspective">
        {/* Vùng bấm để lật (chuột/chạm); bàn phím dùng Space hoặc nút “Hiện đáp án”. Không dùng <button> vì bên trong có nút phát âm. */}
        <div
          onClick={() => setFlipped((f) => !f)}
          className="relative block h-[380px] w-full cursor-pointer text-left transition-transform duration-500 preserve-3d sm:h-[420px]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
        >
          <div className="card absolute inset-0 overflow-hidden backface-hidden">
            <div className={cn('absolute inset-x-0 top-0 h-1.5', item.kind === 'phrase' ? 'bg-linear-to-r from-fuchsia-500 to-orange-400' : 'bg-brand')} />
            {item.kind === 'word' ? <CardFace card={item.card} side="front" reversed={reversed} /> : <PhraseFace card={item.card} side="front" />}
            <p className="absolute inset-x-0 bottom-4 text-center text-xs text-muted">
              Bấm thẻ hoặc <Kbd>Space</Kbd> để lật{item.kind === 'phrase' && <> · <Kbd>R</Kbd> nghe lại</>}
            </p>
          </div>
          <div className="card absolute inset-0 overflow-hidden backface-hidden rotate-y-180">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-emerald-400 to-sky-400" />
            {item.kind === 'word' ? <CardFace card={item.card} side="back" reversed={reversed} /> : <PhraseFace card={item.card} side="back" />}
          </div>
        </div>
      </div>

      {flipped ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                disabled={rate.isPending}
                onClick={() => doRate(r.value)}
                className={cn('flex flex-col items-center rounded-2xl py-3 text-white shadow-lg transition active:scale-95 disabled:opacity-60', r.className)}
              >
                <span className="text-base font-extrabold">{r.label}</span>
                <span className="text-xs font-semibold text-white/85">{item.card.preview[r.value]}</span>
                <span className="mt-1 hidden rounded bg-white/20 px-1.5 text-[10px] font-bold sm:block">{r.key}</span>
              </button>
            ))}
          </div>
          {item.kind === 'word' && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" icon={<CheckCheck className="h-4 w-4 text-teal-500" />} onClick={() => known.mutate(item.card.id)}>
                Tôi đã thuộc từ này — không cần ôn nữa
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Button variant="primary" size="lg" className="w-full" onClick={() => setFlipped(true)}>
          Hiện đáp án
        </Button>
      )}

      <p className="text-center text-xs text-muted">
        {item.kind === 'phrase' ? 'Mẫu câu · ' : ''}
        {item.card.state === 0 ? 'Thẻ mới' : item.card.lastReview ? `Lần ôn trước: ${relativeTime(item.card.lastReview)}` : ''} · Phím <Kbd>1</Kbd>–<Kbd>4</Kbd> để chấm,{' '}
        <Kbd>Z</Kbd> hoàn tác
      </p>
    </div>
  );
}
