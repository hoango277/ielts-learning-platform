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
        data-tense={token.tense}
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
  variant = 'card',
  lifted,
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
  /**
   * card: khung thẻ dưới video (bố cục thường) · cinema: chữ sáng trên dải đen ngay dưới video (rạp / toàn màn hình) ·
   * overlay: đè lên phần dưới của video như phụ đề YouTube (toàn màn hình) — phần tử cha phải có `position: relative`.
   */
  variant?: 'card' | 'cinema' | 'overlay';
  /** overlay: thanh điều khiển của YouTube đang hiện (tạm dừng / rê chuột lên video) → nâng phụ đề lên trên thanh tua */
  lifted?: boolean;
}) {
  const cinema = variant === 'cinema';
  const counter = (
    <span className="text-[11px] font-semibold text-muted">
      {index >= 0 ? index + 1 : 0}/{total}
    </span>
  );
  const pauseActions = (
    <>
      <span>⏸ Đã tự dừng ở cuối câu để bạn nhại lại</span>
      <button type="button" onClick={onResume} className="font-bold underline underline-offset-2">
        Nghe tiếp (Space)
      </button>
      <button type="button" onClick={onDisableAutoPause} className="font-bold underline underline-offset-2">
        Tắt tự dừng (A)
      </button>
    </>
  );
  const body = !tokens ? (
    <p className="text-center text-sm text-muted">Phụ đề sẽ hiện ở đây khi video phát.</p>
  ) : hidden ? (
    <p className="select-none text-center text-xl font-semibold tracking-wide text-muted blur-[6px]" aria-hidden="true">
      {tokens.map((t) => t.text).join(' ')}
    </p>
  ) : (
    <>
      {/* Dải rạp: giãn dòng gọn + chữ dịch nhỏ hơn (như phụ đề phim) để 2 dòng + 2 dòng dịch vẫn vừa phần chừa sẵn */}
      <p className={cn('text-center text-xl font-semibold text-ink sm:text-2xl', cinema ? 'leading-snug' : 'leading-relaxed')}>
        <WordLine tokens={tokens} timeStore={timeStore} onWordClick={onWordClick} />
      </p>
      {showTranslation && (
        <p className={cn('text-center text-muted', cinema ? 'mt-1 text-sm' : 'mt-2 text-base', !translation && 'animate-pulse')}>{translation ?? '…'}</p>
      )}
    </>
  );

  if (variant === 'overlay') {
    // Như phụ đề YouTube: hộp nền đen mờ sát đáy video khi đang phát; khi thanh điều khiển của YouTube hiện (tạm dừng / rê
    // chuột lên video — chiếm ~115px dưới cùng) thì nâng lên trên thanh tua để không che. Chỉ hộp chữ nhận chuột (bấm từ
    // để tra); phần còn lại để chuột xuyên xuống video. Không có câu thì không hiện gì. Số thứ tự câu nằm ở thanh điều khiển.
    return (
      <div
        data-variant="overlay"
        data-lifted={lifted ? 'true' : undefined}
        className={cn(
          'dark pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-1.5 px-[5%] transition-[bottom] duration-200',
          lifted ? 'bottom-[7.5rem]' : 'bottom-[max(1.5rem,5%)]',
        )}
        aria-live="polite"
      >
        {autoPaused && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 rounded-md bg-black/80 px-3 py-1 text-xs font-medium text-brand-200">
            {pauseActions}
          </div>
        )}
        {tokens && (
          <div className="pointer-events-auto max-w-full rounded-md bg-black/75 px-3 py-1 text-center text-[clamp(1rem,1.6vw,1.75rem)] text-white">
            {hidden ? (
              <p className="select-none font-semibold leading-snug text-white/60 blur-[6px]" aria-hidden="true">
                {tokens.map((t) => t.text).join(' ')}
              </p>
            ) : (
              <>
                <p className="font-semibold leading-snug text-balance">
                  <WordLine tokens={tokens} timeStore={timeStore} onWordClick={onWordClick} />
                </p>
                {showTranslation && <p className={cn('mt-0.5 text-[0.72em] leading-snug text-white/80', !translation && 'animate-pulse')}>{translation ?? '…'}</p>}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  if (cinema) {
    // Luôn dùng bảng màu tối (lớp `dark` cho riêng dải này) vì nền là dải đen của chế độ rạp. Chiều cao tối thiểu cố định
    // (khớp THEATRE_FIT bên WatchPage): đủ 2 dòng, thêm chỗ cho dòng dịch khi bật song ngữ; thông báo "tự dừng" nằm
    // chung hàng với số câu nên hiện/ẩn không làm dải cao thêm.
    return (
      <div data-variant="cinema" className={cn('dark flex flex-col px-2 text-ink', showTranslation ? 'min-h-35' : 'min-h-27')} aria-live="polite">
        <div className="flex min-h-5 items-center justify-between gap-3">
          <span className="flex flex-wrap items-center gap-x-3 text-xs font-medium text-brand-200">{autoPaused && pauseActions}</span>
          {counter}
        </div>
        <div className="flex flex-1 flex-col justify-center py-1">{body}</div>
      </div>
    );
  }

  return (
    <div data-variant="card" className="card relative min-h-24 px-5 py-4" aria-live="polite">
      {autoPaused && (
        <div className="-mx-5 -mt-4 mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-t-2xl bg-brand-50 px-4 py-2 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
          {pauseActions}
        </div>
      )}
      <span className="absolute right-3 top-2">{counter}</span>
      {/* chừa lề hai bên để câu dài (hết bề ngang) không chạm số thứ tự câu ở góc trên */}
      <div className="sm:px-8">{body}</div>
    </div>
  );
}
