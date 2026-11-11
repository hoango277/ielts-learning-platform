import { memo } from 'react';
import { usePlayerTime, type TimeStore } from '../../hooks/useYouTubePlayer';
import { cn } from '../../lib/utils';
import type { Token } from './tokens';

export type WordClick = (token: Token, el: HTMLElement) => void;

/** Các từ của một câu; từ đã được đọc tới được tô màu (karaoke) nếu có timeStore. */
export const WordLine = memo(function WordLine({
  tokens,
  timeStore,
  onWordClick,
  className,
}: {
  tokens: Token[];
  timeStore?: TimeStore;
  onWordClick: WordClick;
  className?: string;
}) {
  return (
    <span className={className}>
      {timeStore ? (
        <KaraokeTokens tokens={tokens} timeStore={timeStore} onWordClick={onWordClick} />
      ) : (
        tokens.map((t, i) => <TokenSpan key={i} token={t} onWordClick={onWordClick} />)
      )}
    </span>
  );
});

function KaraokeTokens({ tokens, timeStore, onWordClick }: { tokens: Token[]; timeStore: TimeStore; onWordClick: WordClick }) {
  const t = usePlayerTime(timeStore, 0.05);
  return (
    <>
      {tokens.map((tk, i) => (
        <TokenSpan key={i} token={tk} spoken={tk.s <= t + 0.05} onWordClick={onWordClick} />
      ))}
    </>
  );
}

function TokenSpan({ token, spoken, onWordClick }: { token: Token; spoken?: boolean; onWordClick: WordClick }) {
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        className="word-token"
        data-status={token.status}
        data-spoken={spoken ? 'true' : undefined}
        onClick={(e) => {
          if (window.getSelection()?.toString().trim().includes(' ')) return; // đang bôi đen cụm từ
          onWordClick(token, e.currentTarget);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onWordClick(token, e.currentTarget);
        }}
      >
        {token.text}
      </span>{' '}
    </>
  );
}

export function SubtitleBar({
  tokens,
  translation,
  showTranslation,
  hidden,
  timeStore,
  onWordClick,
  index,
  total,
  autoPaused,
  onResume,
  onDisableAutoPause,
}: {
  tokens: Token[] | null;
  translation?: string;
  showTranslation: boolean;
  hidden?: boolean;
  timeStore: TimeStore;
  onWordClick: WordClick;
  index: number;
  total: number;
  /** Video vừa tự dừng ở cuối câu (tuỳ chọn “Tự dừng”) → giải thích cho người học. */
  autoPaused?: boolean;
  onResume?: () => void;
  onDisableAutoPause?: () => void;
}) {
  return (
    <div className="card relative min-h-[96px] px-5 py-4" aria-live="polite">
      {autoPaused && (
        <div className="-mx-5 -mt-4 mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-t-2xl bg-violet-50 px-4 py-2 text-xs font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">
          <span>⏸ Đã tự dừng ở cuối câu để bạn nhại lại</span>
          <button type="button" onClick={onResume} className="font-bold underline underline-offset-2">
            Nghe tiếp (Space)
          </button>
          <button type="button" onClick={onDisableAutoPause} className="font-bold underline underline-offset-2">
            Tắt tự dừng (A)
          </button>
        </div>
      )}
      <span className="absolute right-3 top-2 text-[11px] font-semibold text-muted">
        {index >= 0 ? index + 1 : 0}/{total}
      </span>
      {!tokens ? (
        <p className="text-center text-sm text-muted">Phụ đề sẽ hiện ở đây khi video phát.</p>
      ) : hidden ? (
        <p className="select-none text-center text-xl font-semibold tracking-wide text-muted blur-[6px]" aria-hidden="true">
          {tokens.map((t) => t.text).join(' ')}
        </p>
      ) : (
        <>
          <p className="text-center text-xl font-semibold leading-relaxed text-ink sm:text-2xl">
            <WordLine tokens={tokens} timeStore={timeStore} onWordClick={onWordClick} />
          </p>
          {showTranslation && (
            <p className={cn('mt-2 text-center text-base text-muted', !translation && 'animate-pulse')}>{translation ?? '…'}</p>
          )}
        </>
      )}
    </div>
  );
}
