import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { TenseForm } from '../../lib/types';
import { FORM_META, tenseColor } from '../tenses/meta';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/primitives';

export interface PhraseDraft {
  text: string;
  start?: number;
  end?: number;
  /** Cụm chọn sẵn (vd. người học bôi đen trong phụ đề) */
  chunk?: string;
  /** Nhãn thì (lưu từ Kính thì) → câu hiện trong bài học thì tương ứng */
  tense?: TenseForm;
}

const strip = (s: string) => s.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');

/** Vị trí (theo từ) của một cụm trong câu, không phân biệt hoa thường. */
function rangeOf(tokens: string[], chunk: string): [number, number] | null {
  const target = chunk.toLowerCase().split(/\s+/).map(strip).filter(Boolean);
  if (!target.length) return null;
  const norm = tokens.map((t) => strip(t).toLowerCase());
  for (let i = 0; i + target.length <= norm.length; i++) {
    if (target.every((w, k) => norm[i + k] === w)) return [i, i + target.length - 1];
  }
  return null;
}

/**
 * Lưu một câu trong phụ đề vào sổ mẫu câu. Bấm vào từ đầu và từ cuối để chọn cụm cần học
 * (collocation, cụm động từ, cách diễn đạt); có gợi ý từ sổ từ, bộ chủ đề và danh sách collocation.
 */
export function SavePhraseDialog({ draft, videoId, onClose }: { draft: PhraseDraft | null; videoId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const tokens = useMemo(() => (draft?.text ?? '').split(/\s+/).filter(Boolean), [draft?.text]);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [withTense, setWithTense] = useState(true);

  useEffect(() => {
    setRange(draft?.chunk ? rangeOf(tokens, draft.chunk) : null);
    setAnchor(null);
    setNote('');
    setWithTense(true);
  }, [draft, tokens]);

  const suggestions = useQuery({
    queryKey: ['chunk-suggest', draft?.text],
    queryFn: () => api.suggestChunks(draft!.text),
    enabled: Boolean(draft?.text),
    staleTime: 5 * 60_000,
  });

  const chunk = range ? strip(tokens.slice(range[0], range[1] + 1).join(' ')) : '';

  const save = useMutation({
    mutationFn: (withChunk: boolean) =>
      api.createPhrase({
        sentence: draft!.text,
        chunk: withChunk ? chunk : undefined,
        videoId,
        start: draft!.start,
        end: draft!.end,
        note: note.trim() || undefined,
        tense: withTense ? draft!.tense : undefined,
      }),
    onSuccess: ({ existed }) => {
      toast.success(existed ? 'Mẫu câu này đã có trong sổ' : 'Đã lưu vào sổ mẫu câu', {
        description: existed ? undefined : 'Câu sẽ xuất hiện khi ôn tập và luyện nói lại.',
      });
      qc.invalidateQueries({ queryKey: ['phrases'] });
      qc.invalidateQueries({ queryKey: ['video-phrases', videoId] });
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['tense-lesson'] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const clickToken = (i: number) => {
    if (anchor === null) {
      setAnchor(i);
      setRange([i, i]);
    } else {
      setRange([Math.min(anchor, i), Math.max(anchor, i)]);
      setAnchor(null);
    }
  };

  return (
    <Modal
      open={Boolean(draft)}
      onClose={onClose}
      title="Lưu mẫu câu"
      description="Bấm vào từ đầu rồi từ cuối để chọn cụm muốn học (vd. make a decision). Khi ôn, cụm này sẽ bị che để bạn tự nhớ lại."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => save.mutate(false)} disabled={save.isPending}>
            Lưu cả câu, không chọn cụm
          </Button>
          <Button variant="primary" icon={<BookmarkPlus className="h-4 w-4" />} loading={save.isPending} disabled={!chunk} onClick={() => save.mutate(true)}>
            Lưu với cụm “{chunk || '…'}”
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-2xl bg-surface-2 p-4 text-lg leading-loose text-ink">
          {tokens.map((t, i) => {
            const inRange = range && i >= range[0] && i <= range[1];
            return (
              <span key={i}>
                <button
                  type="button"
                  onClick={() => clickToken(i)}
                  className={cn(
                    'rounded-md px-0.5 transition',
                    inRange ? 'bg-brand-500 text-white' : 'hover:bg-brand-100 dark:hover:bg-brand-500/20',
                    anchor === i && 'ring-2 ring-brand-400 ring-offset-1 ring-offset-surface-2',
                  )}
                >
                  {t}
                </button>{' '}
              </span>
            );
          })}
        </p>
        {chunk && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Cụm đã chọn:</span>
            <span className="rounded-lg bg-brand-100 px-2 py-0.5 font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{chunk}</span>
            <button type="button" onClick={() => setRange(null)} className="text-muted hover:text-ink" aria-label="Bỏ chọn cụm">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {(suggestions.data?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Gợi ý cụm đáng học
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.data!.map((s) => (
                <button
                  key={s.text}
                  type="button"
                  onClick={() => setRange(rangeOf(tokens, s.text))}
                  className="rounded-xl border border-line bg-surface px-2.5 py-1 text-sm font-semibold text-ink transition hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10"
                  title={s.source === 'notebook' ? 'Có trong sổ từ của bạn' : s.source === 'collocation' ? 'Collocation hay dùng' : 'Trong bộ từ chủ đề'}
                >
                  {s.text}
                  {s.meaning && <span className="ml-1 font-normal text-muted">· {s.meaning}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {draft?.tense && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <input type="checkbox" checked={withTense} onChange={(e) => setWithTense(e.target.checked)} className="h-4 w-4 accent-brand-500" />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: tenseColor(draft.tense) }} />
            <span className="text-ink">
              Gắn nhãn thì <b>{FORM_META[draft.tense].label}</b> — câu sẽ hiện trong bài học thì này
            </span>
          </label>
        )}
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (không bắt buộc): khi nào dùng, sắc thái…" aria-label="Ghi chú" maxLength={500} />
      </div>
    </Modal>
  );
}
