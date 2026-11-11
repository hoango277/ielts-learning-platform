import { BookmarkPlus, Network, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useMediaQuery } from '../../hooks/misc';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { LookupCard } from './LookupCard';

export interface PopoverTarget {
  term: string;
  context?: string;
  rect: DOMRect;
  videoTime?: number;
}

const WIDTH = 380;

/** Popover tra từ neo cạnh từ được bấm (desktop) hoặc bottom sheet (mobile). */
export function WordPopover({
  target,
  videoId,
  onClose,
  onSavePhrase,
}: {
  target: PopoverTarget;
  videoId?: string;
  onClose: () => void;
  /** Lưu cả câu chứa từ/cụm này vào sổ mẫu câu (cụm đang tra được chọn sẵn) */
  onSavePhrase?: () => void;
}) {
  const mobile = useMediaQuery('(max-width: 639px)');
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useEffect(() => {
    if (mobile) return;
    const r = target.rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - WIDTH / 2), vw - WIDTH - 12);
    const below = vh - r.bottom;
    if (below > 440 || below > r.top) {
      setStyle({ left, top: r.bottom + 8, maxHeight: Math.max(240, below - 20) });
    } else {
      setStyle({ left, bottom: vh - r.top + 8, maxHeight: Math.max(240, r.top - 20) });
    }
  }, [target, mobile]);

  useEffect(() => {
    if (mobile) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    // trì hoãn để cú click mở popover không đóng nó ngay
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [mobile, onClose]);

  if (mobile) {
    return (
      <Modal open onClose={onClose} title="Tra từ">
        <LookupCard term={target.term} context={target.context} videoId={videoId} videoTime={target.videoTime} />
        <PopoverExtras term={target.term} onSavePhrase={onSavePhrase} onClose={onClose} />
      </Modal>
    );
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Tra từ ${target.term}`}
      className="scrollbar-thin fixed z-40 animate-pop overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-[0_24px_60px_-20px_rgba(30,10,60,0.45)]"
      style={{ width: WIDTH, ...style }}
    >
      <button type="button" onClick={onClose} aria-label="Đóng" className="absolute right-2.5 top-2.5 rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink">
        <X className="h-4 w-4" />
      </button>
      <LookupCard term={target.term} context={target.context} videoId={videoId} videoTime={target.videoTime} compact />
      <PopoverExtras term={target.term} onSavePhrase={onSavePhrase} onClose={onClose} />
    </div>,
    document.body,
  );
}

/** Hành động thêm: lưu cả câu làm mẫu câu, mở hồ sơ từ (họ từ, đồng nghĩa, collocation). */
function PopoverExtras({ term, onSavePhrase, onClose }: { term: string; onSavePhrase?: () => void; onClose: () => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
      {onSavePhrase && (
        <Button size="sm" variant="soft" icon={<BookmarkPlus className="h-4 w-4" />} onClick={onSavePhrase}>
          Lưu câu làm mẫu câu
        </Button>
      )}
      {!/\s/.test(term.trim()) && (
        <Link
          to={`/profile/${encodeURIComponent(term.trim().toLowerCase())}`}
          onClick={onClose}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-surface-2"
        >
          <Network className="h-4 w-4 text-sky-500" /> Hồ sơ từ
        </Link>
      )}
    </div>
  );
}
