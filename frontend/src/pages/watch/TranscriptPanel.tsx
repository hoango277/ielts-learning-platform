import { Bookmark, BookmarkCheck, Crosshair, Eye, Play, Repeat, Search } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { TimeStore } from '../../hooks/useYouTubePlayer';
import type { Sentence, VerbForm } from '../../lib/types';
import { FORM_META, FORM_ORDER, tenseColor } from '../../components/tenses/meta';
import { cn, formatTime } from '../../lib/utils';
import type { PopoverTarget } from '../../components/word/WordPopover';
import { WordLine, type WordClick } from './SubtitleBar';
import type { Token } from './tokens';

const Row = memo(function Row({
  sentence,
  tokens,
  active,
  translation,
  showTranslation,
  hidden,
  timeStore,
  onSeek,
  onLoop,
  onWordClick,
  saved,
  onSave,
}: {
  sentence: Sentence;
  tokens: Token[];
  active: boolean;
  saved: boolean;
  onSave?: (i: number) => void;
  translation?: string;
  showTranslation: boolean;
  hidden: boolean;
  timeStore?: TimeStore;
  onSeek: (i: number) => void;
  onLoop: (i: number) => void;
  onWordClick: (i: number) => WordClick;
}) {
  const [peek, setPeek] = useState(false);
  const blur = hidden && !peek;
  return (
    <div
      data-index={sentence.i}
      className={cn(
        'group relative flex gap-3 rounded-xl px-3 py-2.5 transition-colors',
        active ? 'bg-brand-50 ring-1 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30' : 'hover:bg-surface-2',
      )}
    >
      <button
        type="button"
        onClick={() => onSeek(sentence.i)}
        className={cn(
          'mt-0.5 h-6 shrink-0 rounded-md px-1.5 font-mono text-xs font-semibold tabular-nums transition',
          active ? 'bg-brand-500 text-white' : 'bg-surface-2 text-muted hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-brand-500/20',
        )}
        aria-label={`Phát từ ${formatTime(sentence.start)}`}
      >
        {formatTime(sentence.start)}
      </button>
      <div className="min-w-0 flex-1">
        {blur ? (
          <button type="button" onClick={() => setPeek(true)} className="w-full text-left" title="Bấm để xem câu">
            <span className="select-none text-[15px] leading-relaxed text-muted blur-[5px]">{sentence.text}</span>
          </button>
        ) : (
          <p className="text-[15px] leading-relaxed text-ink">
            <WordLine tokens={tokens} timeStore={active ? timeStore : undefined} onWordClick={onWordClick(sentence.i)} />
          </p>
        )}
        {showTranslation && !blur && translation && <p className="mt-0.5 text-sm leading-relaxed text-muted">{translation}</p>}
      </div>
      {saved && (
        <span className="mt-1 shrink-0 text-brand-500 group-hover:invisible" title="Đã lưu vào sổ mẫu câu">
          <BookmarkCheck className="h-4 w-4" />
        </span>
      )}
      <div className="absolute right-2 top-2 hidden gap-1 rounded-lg bg-surface/90 p-0.5 shadow-sm group-hover:flex">
        <button type="button" onClick={() => onSeek(sentence.i)} className="rounded-md p-1 text-muted hover:text-brand-600" aria-label="Phát câu này">
          <Play className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onLoop(sentence.i)} className="rounded-md p-1 text-muted hover:text-brand-600" aria-label="Lặp câu này">
          <Repeat className="h-3.5 w-3.5" />
        </button>
        {onSave && (
          <button
            type="button"
            onClick={() => onSave(sentence.i)}
            className={cn('rounded-md p-1 hover:text-brand-600', saved ? 'text-brand-500' : 'text-muted')}
            aria-label={saved ? 'Đã lưu mẫu câu — lưu thêm cụm khác' : 'Lưu câu vào sổ mẫu câu (B)'}
            title={saved ? 'Đã lưu — bấm để lưu thêm cụm khác' : 'Lưu vào sổ mẫu câu (B)'}
          >
            {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          </button>
        )}
        {hidden && (
          <button type="button" onClick={() => setPeek((v) => !v)} className="rounded-md p-1 text-muted hover:text-brand-600" aria-label="Xem câu">
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

export function TranscriptPanel({
  sentences,
  tokenized,
  activeIndex,
  translations,
  showTranslation,
  hideFrom,
  timeStore,
  onSeek,
  onLoop,
  onWordClick,
  onPhrase,
  savedStarts,
  onSavePhrase,
  lens,
  filterIndices,
}: {
  sentences: Sentence[];
  tokenized: Token[][];
  activeIndex: number;
  translations: Record<number, string>;
  showTranslation: boolean;
  /** Che các câu từ chỉ số này trở đi (chế độ chép chính tả) */
  hideFrom: number | null;
  timeStore: TimeStore;
  onSeek: (i: number) => void;
  onLoop: (i: number) => void;
  onWordClick: (i: number) => WordClick;
  onPhrase: (target: PopoverTarget) => void;
  /** Thời điểm bắt đầu (làm tròn 0,1 s) của các câu đã lưu vào sổ mẫu câu */
  savedStarts?: Set<number>;
  onSavePhrase?: (i: number) => void;
  /** Kính thì đang bật: số cụm động từ theo từng thì + lọc câu theo thì */
  lens?: { counts: Partial<Record<VerbForm, number>>; filter: VerbForm | null; onFilter: (f: VerbForm | null) => void; loading: boolean; failed?: boolean };
  /** Chỉ hiện các câu này (lọc theo thì) */
  filterIndices?: Set<number> | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const userScrollAt = useRef(0);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = filterIndices ? sentences.filter((s) => filterIndices.has(s.i)) : sentences;
    return q ? base.filter((s) => s.text.toLowerCase().includes(q)) : base;
  }, [sentences, query, filterIndices]);

  useEffect(() => {
    const c = ref.current;
    if (!follow || activeIndex < 0 || !c || query || filterIndices) return;
    if (Date.now() - userScrollAt.current < 4000) return;
    const el = c.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (el) c.scrollTo({ top: el.offsetTop - c.clientHeight / 3, behavior: 'smooth' });
  }, [activeIndex, follow, query, filterIndices]);

  const onMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
    if (!sel || sel.rangeCount === 0 || text.split(' ').length < 2 || text.length > 100) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer.parentElement?.closest<HTMLElement>('[data-index]');
    const idx = Number(node?.dataset.index);
    const s = sentences[idx];
    onPhrase({
      term: text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''),
      context: s?.text,
      rect: range.getBoundingClientRect(),
      videoTime: s?.start,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trong phụ đề…"
            aria-label="Tìm trong phụ đề"
            className="h-9 w-full rounded-lg bg-surface-2 pl-8 pr-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-400/40"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setFollow((v) => !v);
            userScrollAt.current = 0;
          }}
          aria-pressed={follow}
          title="Tự cuộn theo video"
          className={cn('inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold', follow ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'bg-surface-2 text-muted')}
        >
          <Crosshair className="h-4 w-4" /> Theo dõi
        </button>
      </div>
      {lens && (
        <div className="border-b border-line px-3 py-2">
          {lens.loading ? (
            <p className="text-xs text-muted">Đang nhận diện thì trong phụ đề…</p>
          ) : lens.failed ? (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Chưa nhận diện được thì cho phụ đề này.</p>
          ) : (
            <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc câu theo thì">
              <button
                type="button"
                onClick={() => lens.onFilter(null)}
                aria-pressed={!lens.filter}
                className={cn('h-7 rounded-lg px-2 text-[11px] font-bold', !lens.filter ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink')}
              >
                Tất cả
              </button>
              {FORM_ORDER.filter((f) => lens.counts[f]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => lens.onFilter(lens.filter === f ? null : f)}
                  aria-pressed={lens.filter === f}
                  title={`Chỉ hiện câu có ${FORM_META[f].label}`}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-bold transition',
                    lens.filter === f ? 'bg-ink text-bg' : 'bg-surface-2 text-ink hover:bg-surface-3',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: tenseColor(f) }} />
                  {FORM_META[f].label}
                  <span className="opacity-60">{lens.counts[f]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="px-4 pt-2 text-[11px] text-muted">
        {lens ? 'Bấm vào động từ có màu để xem vì sao dùng thì đó · bấm một màu để chỉ xem câu có thì đó · nhận diện tự động, có thể nhầm' : 'Bấm vào từ để tra nghĩa · Bôi đen nhiều từ để tra cụm từ'}
      </p>
      <div
        ref={ref}
        onWheel={() => (userScrollAt.current = Date.now())}
        onTouchMove={() => (userScrollAt.current = Date.now())}
        onMouseUp={onMouseUp}
        className="scrollbar-thin relative min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2"
      >
        {visible.map((s) => (
          <Row
            key={s.i}
            sentence={s}
            tokens={tokenized[s.i]}
            active={s.i === activeIndex}
            translation={translations[s.i]}
            showTranslation={showTranslation}
            hidden={hideFrom !== null && s.i >= hideFrom}
            timeStore={timeStore}
            onSeek={onSeek}
            onLoop={onLoop}
            onWordClick={onWordClick}
            saved={savedStarts?.has(Math.round(s.start * 10)) ?? false}
            onSave={onSavePhrase}
          />
        ))}
        {!visible.length && <p className="py-10 text-center text-sm text-muted">{query ? `Không có câu nào khớp “${query}”.` : 'Không có câu nào có thì này.'}</p>}
      </div>
    </div>
  );
}
