import { ArrowUpRight, ChevronDown, CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_LABEL, GLOSSARY } from '../../lib/glossary';
import { cn } from '../../lib/utils';

const GAP = 10;
const MARGIN = 12;
const FOCUSABLE = 'a[href], button:not([disabled])';

interface Pos {
  top: number;
  left: number;
  arrow: number;
  above: boolean;
}

/**
 * Thuật ngữ có giải thích: gạch chân chấm, rê chuột (máy tính) hoặc chạm (điện thoại) để xem nghĩa;
 * "Giải thích thêm" mở phần chi tiết ngay trong thẻ nên không làm gián đoạn việc đang học.
 * `icon` → hiện nút (?) nhỏ thay vì gạch chân chữ (dùng cạnh nhãn, tiêu đề).
 * Không đặt bên trong <button>/<a> khác (HTML không cho lồng phần tử tương tác).
 */
export function Term({ k, children, icon, className }: { k: string; children?: ReactNode; icon?: boolean; className?: string }) {
  const entry = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const id = useId();

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
    setExpanded(false);
  }, []);

  const place = useCallback(() => {
    const t = triggerRef.current;
    const p = popRef.current;
    if (!t || !p) return;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Thuật ngữ đã cuộn khuất khỏi màn hình → đóng thay vì để thẻ lơ lửng
    if (r.bottom < 0 || r.top > vh) {
      close();
      return;
    }
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const above = vh - r.bottom < h + GAP + MARGIN && r.top > vh - r.bottom;
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(MARGIN, center - w / 2), vw - w - MARGIN);
    const top = above ? Math.max(MARGIN, r.top - h - GAP) : r.bottom + GAP;
    setPos({ top, left, above, arrow: Math.min(Math.max(16, center - left), w - 16) });
  }, [close]);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, expanded, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!triggerRef.current?.contains(n) && !popRef.current?.contains(n)) close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Bắt ở pha capture và chặn lan tiếp: Esc chỉ đóng thẻ giải thích, không đóng luôn hộp thoại đang chứa nó
      e.stopPropagation();
      const a = document.activeElement;
      const hadFocus = !!a && (triggerRef.current?.contains(a) || popRef.current?.contains(a));
      close();
      if (hadFocus) triggerRef.current?.focus();
    };
    const onMove = () => requestAnimationFrame(place);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close, place]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  if (!entry) return <>{children}</>;

  const hoverOpen = () => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(true), 120);
  };
  const hoverClose = () => {
    window.clearTimeout(hoverTimer.current);
    if (!pinned) hoverTimer.current = window.setTimeout(close, 160);
  };

  const toggle = (focusInside: boolean) => {
    window.clearTimeout(hoverTimer.current);
    if (open && pinned) {
      close();
      return;
    }
    setOpen(true);
    setPinned(true);
    // Mở bằng bàn phím → đưa focus vào thẻ để Tab tới được các nút bên trong
    if (focusInside) requestAnimationFrame(() => popRef.current?.focus());
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      // Không để phím lọt ra phím tắt của trang (vd. Enter/Space lật thẻ ở trang Ôn tập)
      e.preventDefault();
      e.stopPropagation();
      toggle(true);
    }
  };

  // Tab ra khỏi thẻ → đóng và trả focus về thuật ngữ để thứ tự Tab của trang không bị nhảy
  const onPopKey = (e: KeyboardEvent) => {
    // Thẻ nằm ngoài cây DOM của trang (portal) — phím gõ bên trong không được kích hoạt phím tắt của trang
    e.stopPropagation();
    if (e.key !== 'Tab') return;
    const items = [...(popRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const last = items[items.length - 1];
    if (!e.shiftKey && last && document.activeElement !== last) return;
    if (e.shiftKey && document.activeElement !== popRef.current && document.activeElement !== items[0]) return;
    e.preventDefault();
    close();
    triggerRef.current?.focus();
  };

  const cat = CATEGORY_LABEL[entry.category];

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-describedby={`${id}-d`}
        aria-label={icon ? `Giải thích: ${entry.term}` : undefined}
        onClick={(e) => {
          // preventDefault: nằm trong <label> thì không kích hoạt ô nhập/công tắc đi kèm
          e.preventDefault();
          e.stopPropagation();
          toggle(false);
        }}
        onKeyDown={onTriggerKey}
        onPointerEnter={(e) => e.pointerType === 'mouse' && hoverOpen()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && hoverClose()}
        className={cn(
          icon
            ? 'inline-flex h-5 w-5 shrink-0 -translate-y-px cursor-help items-center justify-center rounded-full align-middle text-muted/80 transition hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300'
            : 'term rounded-sm transition-colors hover:text-violet-700 dark:hover:text-violet-300',
          open && (icon ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300' : 'text-violet-700 dark:text-violet-300'),
          className,
        )}
      >
        {icon ? <CircleHelp className="h-4 w-4" aria-hidden="true" /> : (children ?? entry.term)}
        <span id={`${id}-d`} hidden>
          {entry.short}
        </span>
      </span>
      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={entry.term}
            tabIndex={-1}
            onKeyDown={onPopKey}
            onPointerEnter={(e) => e.pointerType === 'mouse' && window.clearTimeout(hoverTimer.current)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && hoverClose()}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className={cn(
              'fixed z-[70] w-[min(21rem,calc(100vw-24px))] rounded-2xl border border-line bg-surface p-4 text-left font-sans text-sm font-normal normal-case tracking-normal text-ink shadow-lift outline-none',
              pos && 'animate-pop',
              pos?.above ? 'origin-bottom' : 'origin-top',
            )}
          >
            {pos && (
              <span
                aria-hidden="true"
                className={cn('absolute h-3 w-3 rotate-45 border-line bg-surface', pos.above ? '-bottom-1.5 border-b border-r' : '-top-1.5 border-l border-t')}
                style={{ left: pos.arrow - 6 }}
              />
            )}
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted">
              <span aria-hidden="true">{cat.emoji}</span> {cat.label}
            </p>
            <p className="mt-1 font-display text-base font-extrabold leading-snug text-ink">{entry.term}</p>
            <p className="mt-1.5 leading-relaxed text-ink/90">{entry.short}</p>
            {expanded && entry.long && <p className="mt-2 animate-fade-in leading-relaxed text-muted">{entry.long}</p>}
            {entry.example && (!entry.long || expanded) && (
              <p className="mt-2.5 rounded-xl bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-muted">
                <span className="font-semibold text-ink">Ví dụ: </span>
                {entry.example}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3 text-[13px] font-bold">
              {entry.long && !expanded ? (
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    setPinned(true);
                  }}
                  className="inline-flex items-center gap-0.5 text-violet-600 hover:underline dark:text-violet-300"
                >
                  Giải thích thêm <ChevronDown className="h-4 w-4" />
                </button>
              ) : (
                <span />
              )}
              {/* Mở tab mới để không làm mất bài đang học dở (phiên luyện tập, đang ghi âm…) */}
              <a
                href={`/glossary#${entry.key}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-0.5 text-muted hover:text-ink hover:underline"
              >
                Bảng thuật ngữ <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
