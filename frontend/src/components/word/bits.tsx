import { Volume2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { pronounce } from '../../lib/speech';
import type { Settings, WordStatus } from '../../lib/types';
import { cn, LEVEL_BAND, LEVEL_CLASS, STATUS_META } from '../../lib/utils';
import { Badge } from '../ui/primitives';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 60_000 });
}

export function useAccent(): { accent: 'us' | 'uk'; rate: number } {
  const { data } = useSettings();
  return { accent: (data as Settings | undefined)?.accent ?? 'us', rate: data?.ttsRate ?? 0.95 };
}

export function AudioButton({
  term,
  audio,
  accent,
  label,
  className,
  size = 'md',
}: {
  term: string;
  audio?: string | null;
  accent?: 'us' | 'uk';
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const pref = useAccent();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        pronounce(term, { audio, accent: accent ?? pref.accent, rate: pref.rate });
      }}
      aria-label={`Phát âm ${term}${label ? ` (${label})` : ''}`}
      title={audio ? 'Nghe phát âm (giọng người thật)' : 'Nghe phát âm (giọng đọc máy)'}
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold text-violet-600 transition hover:bg-violet-100 active:scale-95 dark:text-violet-300 dark:hover:bg-violet-500/15',
        size === 'sm' ? 'h-7 px-1.5 text-xs' : 'h-8 px-2 text-xs',
        className,
      )}
    >
      <Volume2 className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {label}
    </button>
  );
}

export function StatusBadge({ status, className }: { status: WordStatus | null | undefined; className?: string }) {
  if (!status) return null;
  const m = STATUS_META[status];
  return (
    <Badge className={cn(m.className, className)} title={m.desc}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} />
      {m.label}
    </Badge>
  );
}

export function LevelBadge({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  return (
    <Badge className={LEVEL_CLASS[level] ?? 'bg-surface-2 text-muted'} title={`CEFR ${level} · ước lượng IELTS ${LEVEL_BAND[level] ?? ''}`}>
      {level}
    </Badge>
  );
}

/** Tô đậm từ cần học trong câu ví dụ. */
export function Highlight({ text, term, className }: { text: string; term: string; className?: string }) {
  const parts = term.trim().split(/\s+/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!parts.length || !parts[0]) return <>{text}</>;
  const stem = parts.map((p) => (p.length > 3 ? p.replace(/(e|y)$/i, '') : p) + "[\\p{L}']*").join('\\s+');
  const re = new RegExp(`(${stem})`, 'giu');
  const chunks = text.split(re);
  return (
    <>
      {chunks.map((c, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={cn('rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-400/25', className)}>
            {c}
          </mark>
        ) : (
          <span key={i}>{c}</span>
        ),
      )}
    </>
  );
}
