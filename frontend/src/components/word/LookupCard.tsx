import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkCheck, BookmarkPlus, ExternalLink, Languages, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { LookupResult } from '../../lib/types';
import { cn, posLabel } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Badge, ErrorBox, Skeleton } from '../ui/primitives';
import { AudioButton, Highlight, StatusBadge } from './bits';

export function useSaveWord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createWord,
    onSuccess: ({ word, existed }) => {
      toast.success(existed ? `"${word.term}" đã có trong sổ — đã bổ sung câu ví dụ` : `Đã lưu "${word.term}" vào sổ từ`, {
        description: word.meaning,
      });
      qc.invalidateQueries({ queryKey: ['words'] });
      qc.invalidateQueries({ queryKey: ['word-keys'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['lookup'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function LookupSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

const PROVIDER_LABEL: Record<string, string> = { hymt: 'Hy-MT', google: 'Google', mymemory: 'MyMemory' };

export function LookupCard({
  term,
  context,
  videoId,
  videoTime,
  onSaved,
  compact,
}: {
  term: string;
  context?: string;
  videoId?: string;
  videoTime?: number;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const query = useQuery({
    queryKey: ['lookup', term.toLowerCase(), context ?? ''],
    queryFn: ({ signal }) => api.lookup(term, context, signal),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const save = useSaveWord();

  if (query.isPending) return <LookupSkeleton />;
  if (query.error) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;
  const r: LookupResult = query.data;

  const onSave = () =>
    save.mutate(
      {
        term: r.lemma && r.lemma !== r.term.toLowerCase() && !context ? r.lemma : r.term,
        context,
        contextVi: r.contextTranslation,
        videoId,
        videoTime,
        meaning: r.contextual?.text,
      },
      { onSuccess: () => onSaved?.() },
    );

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="break-words text-2xl font-extrabold tracking-tight text-ink">{r.term}</h3>
            {r.lemma && r.lemma !== r.term.toLowerCase() && <span className="text-sm text-muted">← {r.lemma}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            {r.pos && <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{posLabel(r.pos)}</Badge>}
            {(r.ipaUk || r.ipa) && <span className="font-mono text-[13px]">UK {r.ipaUk ?? r.ipa}</span>}
            <AudioButton term={r.lemma || r.term} audio={r.audioUk ?? (r.audioUs ? undefined : r.audio)} accent="uk" label="UK" size="sm" />
            {r.ipaUs && r.ipaUs !== r.ipaUk && <span className="font-mono text-[13px]">US {r.ipaUs}</span>}
            <AudioButton term={r.lemma || r.term} audio={r.audioUs} accent="us" label="US" size="sm" />
          </div>
        </div>
        {r.saved && <StatusBadge status={r.saved.status} />}
      </div>

      {r.contextual && (
        <div className="rounded-xl bg-linear-to-r from-violet-500/10 via-fuchsia-500/10 to-orange-400/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
            <Sparkles className="h-3.5 w-3.5" />
            Nghĩa trong câu
            <span className="font-medium normal-case text-muted">
              · {r.contextual.method === 'model' ? `${PROVIDER_LABEL[r.contextual.provider]} dịch theo ngữ cảnh` : 'khớp với bản dịch cả câu'}
            </span>
          </p>
          <p className="mt-1 text-lg font-bold text-ink">{r.contextual.text}</p>
        </div>
      )}

      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Languages className="h-3.5 w-3.5" /> Nghĩa chung · {PROVIDER_LABEL[r.provider]}
        </p>
        {r.translation ? (
          <p className={cn('mt-0.5 font-semibold text-ink', r.contextual ? 'text-base' : 'text-lg')}>{r.translation}</p>
        ) : (
          <p className="mt-0.5 text-sm text-muted">
            Chưa dịch được (dịch vụ dịch đang bận).{' '}
            <button type="button" onClick={() => query.refetch()} className="font-semibold text-violet-600 underline underline-offset-2">
              Thử lại
            </button>
          </p>
        )}
        {r.dict.length > 0 && (
          <ul className="mt-1.5 space-y-1 text-sm">
            {r.dict.slice(0, compact ? 2 : 4).map((d) => (
              <li key={d.pos} className="leading-relaxed">
                <span className="font-semibold text-muted">{d.pos}:</span> <span className="text-ink">{d.terms.slice(0, 6).join(', ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {r.meanings.length > 0 && (
        <div className="space-y-1.5 border-t border-line pt-3">
          {(r.sense ? [{ pos: r.sense.pos, definitions: [{ definition: r.sense.definition, example: r.sense.example }] }] : r.meanings)
            .slice(0, compact ? 1 : 2)
            .map((m, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold italic text-violet-600 dark:text-violet-300">{m.pos}</span>
                {r.sense && <span className="ml-1.5 text-xs text-muted">(nghĩa phù hợp ngữ cảnh)</span>}
                <ol className="ml-4 mt-0.5 list-decimal space-y-1 text-ink marker:text-muted">
                  {m.definitions.slice(0, compact ? 1 : 2).map((d, k) => (
                    <li key={k} className="leading-relaxed">
                      {d.definition}
                      {d.example && <p className="text-muted italic">“{d.example}”</p>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
        </div>
      )}

      {!compact && r.synonyms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs font-semibold text-muted">Đồng nghĩa:</span>
          {r.synonyms.slice(0, 8).map((s) => (
            <Badge key={s} className="bg-surface-2 text-ink">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {context && (
        <blockquote className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-2.5 text-sm leading-relaxed text-ink dark:bg-amber-400/10">
          <Highlight text={context} term={r.term} />
          {r.contextTranslation && <p className="mt-1 text-muted">{r.contextTranslation}</p>}
        </blockquote>
      )}

      {!compact && !context && r.examples.length > 0 && (
        <ul className="space-y-1 text-sm italic text-muted">
          {r.examples.slice(0, 2).map((e) => (
            <li key={e}>
              “<Highlight text={e} term={r.lemma || r.term} />”
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {r.saved ? (
          <Link
            to={`/notebook?word=${r.saved.id}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-100 px-4 text-sm font-semibold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            <BookmarkCheck className="h-4 w-4" /> Đã có trong sổ
          </Link>
        ) : (
          <Button variant="primary" onClick={onSave} loading={save.isPending} icon={<BookmarkPlus className="h-4 w-4" />}>
            Lưu vào sổ từ
          </Button>
        )}
        {context && r.saved && (
          <Button variant="ghost" size="sm" onClick={onSave} loading={save.isPending}>
            + Thêm câu này làm ví dụ
          </Button>
        )}
        <a
          href={`https://dictionary.cambridge.org/dictionary/english-vietnamese/${encodeURIComponent((r.lemma || r.term).replace(/\s+/g, '-'))}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
        >
          Cambridge <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href={`https://youglish.com/pronounce/${encodeURIComponent(r.lemma || r.term)}/english`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
        >
          YouGlish <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
