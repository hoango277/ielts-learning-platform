import { BookmarkPlus, Flag, GraduationCap } from 'lucide-react';
import { Link } from 'react-router';
import type { VerbForm } from '../../lib/types';
import { Button } from '../ui/Button';
import { FORM_META, tenseColor } from './meta';

export interface TenseInfo {
  form: VerbForm;
  /** Cụm động từ để hiển thị ("Have … been") */
  phrase: string;
  onSave?: () => void;
  onReport?: () => void;
}

/** Kính thì: dải đầu popover khi bấm vào động từ có màu — thì gì, vì sao, học bài nào, lưu câu, báo nhận sai. */
export function TenseStrip({ info, onClose }: { info: TenseInfo; onClose: () => void }) {
  const meta = FORM_META[info.form];
  return (
    <div className="mb-3 rounded-xl border-2 bg-surface-2/60 p-3" style={{ borderColor: tenseColor(info.form) }}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tenseColor(info.form) }} />
        <span className="font-display">“{info.phrase}”</span>
        <span className="text-muted">·</span>
        <span>{meta.label}</span>
      </p>
      <p className="mt-1 text-sm text-ink">{meta.why}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {info.onSave && (
          <Button size="sm" variant="soft" icon={<BookmarkPlus className="h-4 w-4" />} onClick={info.onSave}>
            Lưu câu (nhãn thì)
          </Button>
        )}
        {meta.lesson && (
          <Link to={`/tenses/${meta.lesson}`} onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-ink hover:bg-surface-3">
            <GraduationCap className="h-4 w-4 text-brand-600 dark:text-brand-300" /> Học bài này
          </Link>
        )}
        {info.onReport && (
          <button type="button" onClick={info.onReport} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink" title="Báo app nhận diện sai thì ở chỗ này">
            <Flag className="h-3.5 w-3.5" /> Nhận sai?
          </button>
        )}
      </div>
    </div>
  );
}
