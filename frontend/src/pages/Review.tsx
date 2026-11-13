import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { CheckCheck, Layers, RotateCcw, Settings2, Undo2, Video } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { Celebration } from '../components/ui/Celebration';
import { ChunkSentence } from '../components/phrase/ChunkSentence';
import { Card, EmptyState, ErrorBox, Kbd, Progress, Segmented, Skeleton, Switch } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { ClipPlayer } from '../components/video/ClipPlayer';
import { AudioButton, Highlight, useAccent } from '../components/word/bits';
import { useLocalStorage } from '../hooks/misc';
import { useHotkeys } from '../hooks/useHotkeys';
import { api } from '../lib/api';
import { pronounce } from '../lib/speech';
import type { PhraseCard, ReviewCard } from '../lib/types';
import { cn, formatTime, posLabel, relativeTime, CONFETTI_COLORS } from '../lib/utils';

type Direction = 'en-vi' | 'vi-en' | 'mixed';
type Filter = 'all' | 'words' | 'phrases';
type QItem = { kind: 'word'; card: ReviewCard } | { kind: 'phrase'; card: PhraseCard };

// Nút chấm nổi khối: --edge là màu "đáy" đậm hơn cùng tông
const RATINGS = [
  { value: 1 as const, label: 'Quên', hint: 'Không nhớ ra', key: '1', className: 'bg-rose-500 hover:bg-rose-400 [--edge:var(--color-rose-700)]' },
  { value: 2 as const, label: 'Khó', hint: 'Nhớ ra nhưng vất vả', key: '2', className: 'bg-amber-500 hover:bg-amber-400 [--edge:var(--color-amber-700)]' },
  { value: 3 as const, label: 'Nhớ', hint: 'Nhớ được bình thường', key: '3', className: 'bg-emerald-500 hover:bg-emerald-400 [--edge:var(--color-emerald-700)]' },
  { value: 4 as const, label: 'Dễ', hint: 'Nhớ ngay lập tức', key: '4', className: 'bg-sky-500 hover:bg-sky-400 [--edge:var(--color-sky-700)]' },
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
          {card.ipa && <span className="font-ipa">{card.ipa}</span>}
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
        {card.ipa && <span className="font-ipa text-sm text-muted">{card.ipa}</span>}
        <AudioButton term={card.term} audio={card.audio} />
        {card.pos && <span className="text-sm text-muted">· {posLabel(card.pos)}</span>}
      </div>
      <p className={cn('font-bold text-brand-700 dark:text-brand-300', showTerm ? 'text-2xl' : 'text-xl')}>{card.meaning}</p>
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
      {card.collocations.length > 0 && (
        <p className="text-sm text-muted">
          <Term k="collocation">Hay đi cùng</Term>: {card.collocations.slice(0, 4).join(' · ')}
        </p>
      )}
      {card.note && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">💡 {card.note}</p>}
    </div>
  );
}

function PhraseFace({ card, side }: { card: PhraseCard; side: 'front' | 'back' }) {
  if (side === 'front') {
    // Thẻ luyện thì: mặt trước có gợi ý ngữ cảnh tiếng Việt (không nói tên thì để không lộ đáp án)
    const tenseCard = Boolean(card.tense);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-500">{tenseCard ? 'Thì · nói cả câu, nhớ lại động từ bị che' : 'Mẫu câu · nghe và nhớ lại cụm bị che'}</p>
        {tenseCard && card.note && <p className="max-w-xl rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink">💡 {card.note}</p>}
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
        <p className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10">
          <b className="text-brand-700 dark:text-brand-200">{card.chunk}</b>
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
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, colors: CONFETTI_COLORS });
  }, [stats.reviewed]);
  const minutes = Math.max(1, Math.round((Date.now() - stats.startedAt) / 60000));
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <Celebration emoji="🎉" title="Hoàn thành phiên ôn tập!" description="Bạn đã ôn hết các thẻ đến hạn. Bộ não của bạn sẽ cảm ơn bạn 🧠" className="py-0" />
      <div className="stagger mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-brand-50 p-3 dark:bg-brand-500/10">
          <p className="text-2xl font-extrabold text-brand-600 dark:text-brand-300">{stats.reviewed}</p>
          <p className="text-xs text-muted">lượt ôn</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-300">{stats.reviewed ? Math.round((stats.good / stats.reviewed) * 100) : 0}%</p>
          <p className="text-xs text-muted">nhớ được</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3 dark:bg-amber-500/10">
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-300">+{stats.xp}</p>
          <p className="text-xs text-muted">
            <Term k="xp">XP</Term> · {minutes} phút
          </p>
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

/** Khoá định danh một thẻ trong hàng đợi (từ hoặc mẫu câu) */
function itemKey(c: QItem) {
  return `${c.kind}:${c.card.id}`;
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
  // Trong một phiên: thẻ đã chấm xong (không quay lại) / đã đánh dấu thuộc, và bản mới nhất của thẻ còn ở bước học ngắn hạn.
  // Nhờ vậy đổi bộ lọc hay hàng đợi tải lại (vd. sau hộp khởi động) không đưa thẻ đã chấm quay lại → không bị ghi lịch ôn hai lần.
  const finished = useRef(new Set<string>());
  const latest = useRef(new Map<string, QItem>());
  // Mỗi lượt chấm trong phiên (để hoàn tác trừ đúng số "nhớ được" và XP)
  const [history, setHistory] = useState<{ good: number; xp: number }[]>([]);

  useEffect(() => {
    finished.current = new Set();
    latest.current = new Map();
    setHistory([]);
    setStats({ reviewed: 0, good: 0, xp: 0, startedAt: Date.now() });
  }, [session]);

  useEffect(() => {
    if (queueQ.data) {
      setQueue(
        mixQueue(queueQ.data.cards, queueQ.data.phrases ?? [], filter)
          .filter((c) => !finished.current.has(itemKey(c)))
          .map((c) => latest.current.get(itemKey(c)) ?? c),
      );
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
      const good = rating >= 3 ? 1 : 0;
      setStats((s) => ({ ...s, reviewed: s.reviewed + 1, good: s.good + good, xp: s.xp + res.xp }));
      setHistory((h) => [...h, { good, xp: res.xp }]);
      const again = new Date(res.next).getTime() - Date.now() < LEARN_AGAIN_MS;
      const key = itemKey(res.updated);
      if (again) latest.current.set(key, res.updated);
      else finished.current.add(key);
      setQueue((q) => {
        const rest = q.slice(1);
        // Thẻ còn trong bước học ngắn hạn → quay lại sau vài thẻ (giống Anki)
        if (again) {
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
      finished.current.add(`word:${w.id}`);
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
      finished.current.delete(itemKey(restored));
      latest.current.set(itemKey(restored), restored);
      setQueue((q) => [restored, ...q.filter((c) => !sameItem(c, restored))]);
      // Trừ đúng lượt vừa hoàn tác (số "nhớ được" và XP), không chỉ số lượt
      const last = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      setStats((s) => ({ ...s, reviewed: Math.max(0, s.reviewed - 1), good: Math.max(0, s.good - (last?.good ?? 0)), xp: Math.max(0, s.xp - (last?.xp ?? 0)) }));
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
    // Chỉ hoàn tác lượt chấm trong phiên này (tránh hoàn tác nhầm lượt ôn ở hộp khởi động / luyện tập)
    z: () => history.length > 0 && !undo.isPending && undo.mutate(),
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
          <p className="text-sm text-muted">
            Ôn theo <Term k="srs">lặp lại ngắt quãng</Term> (<Term k="fsrs">FSRS</Term>) — chấm thật lòng để lịch ôn chính xác nhất
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filterBar}
          {/* Số thẻ còn lại trong phiên, theo trạng thái */}
          <span className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted">
            <span title="Thẻ mới: chưa ôn lần nào">
              <b className="text-sm text-sky-500">{counts.new}</b> mới
            </span>
            <span title="Đang học: vừa học, sẽ hỏi lại sau ít phút">
              <b className="text-sm text-amber-500">{counts.learning}</b> đang học
            </span>
            <span title="Ôn lại: thẻ đã nhớ, nay đến hạn ôn theo lịch">
              <b className="text-sm text-brand-500">{counts.review}</b> ôn lại
            </span>
          </span>
          <Button size="icon" variant="ghost" onClick={() => undo.mutate()} aria-label="Hoàn tác (Z)" title="Hoàn tác lượt vừa rồi (Z)" disabled={history.length === 0 || undo.isPending}>
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

      <div className="perspective relative pb-4">
        {/* Các thẻ còn lại xếp chồng phía sau cho có chiều sâu */}
        {queue.length > 2 && <div aria-hidden="true" className="absolute inset-x-8 bottom-0 top-4 rounded-2xl border border-line bg-surface/50" />}
        {queue.length > 1 && <div aria-hidden="true" className="absolute inset-x-4 bottom-2 top-2 rounded-2xl border border-line bg-surface/80 shadow-soft" />}
        {/* Vùng bấm để lật (chuột/chạm); bàn phím dùng Space hoặc nút “Hiện đáp án”. Không dùng <button> vì bên trong có nút phát âm. */}
        <div
          onClick={() => setFlipped((f) => !f)}
          className="relative block h-[380px] w-full cursor-pointer text-left transition-transform duration-500 preserve-3d sm:h-[420px]"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}
        >
          <div className="card absolute inset-0 overflow-hidden shadow-lift backface-hidden">
            <div className={cn('absolute inset-x-0 top-0 h-1.5', item.kind === 'phrase' ? 'bg-linear-to-r from-fuchsia-500 to-orange-400' : 'bg-brand')} />
            {item.kind === 'word' ? <CardFace card={item.card} side="front" reversed={reversed} /> : <PhraseFace card={item.card} side="front" />}
            <p className="absolute inset-x-0 bottom-4 text-center text-xs text-muted">
              Bấm thẻ hoặc <Kbd>Space</Kbd> để lật{item.kind === 'phrase' && <> · <Kbd>R</Kbd> nghe lại</>}
            </p>
          </div>
          <div className="card absolute inset-0 overflow-hidden shadow-lift backface-hidden rotate-y-180">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-emerald-400 to-sky-400" />
            {item.kind === 'word' ? <CardFace card={item.card} side="back" reversed={reversed} /> : <PhraseFace card={item.card} side="back" />}
          </div>
        </div>
      </div>

      {flipped ? (
        <div className="animate-fade-in space-y-3">
          <p className="flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-muted">
            Bạn nhớ thẻ này đến đâu? <Term k="ratings" icon />
            <span className="hidden font-normal sm:inline">· dòng nhỏ dưới mỗi nút là lúc thẻ quay lại</span>
          </p>
          <div className="grid grid-cols-4 gap-2 pb-1 sm:gap-3">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                disabled={rate.isPending}
                onClick={() => doRate(r.value)}
                title={`${r.hint} → ôn lại sau ${item.card.preview[r.value]}`}
                className={cn('press flex flex-col items-center rounded-2xl py-3 text-white disabled:opacity-60', r.className)}
              >
                <span className="font-display text-base font-extrabold">{r.label}</span>
                <span className="text-xs font-semibold text-white/90">{item.card.preview[r.value]}</span>
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
