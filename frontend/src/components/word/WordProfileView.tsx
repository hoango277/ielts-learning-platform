import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, BookmarkPlus, Info, Link2, Network, Sparkles, Video } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { WordProfile } from '../../lib/types';
import { cn, formatTime, posLabel } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Badge, ErrorBox, Skeleton } from '../ui/primitives';
import { AudioButton, Highlight, LevelBadge } from './bits';

const POS_ORDER = ['verb', 'noun', 'adjective', 'adverb'];
const POS_TONE: Record<string, string> = {
  verb: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  noun: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
  adjective: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  adverb: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
};

export function useWordProfile(term: string, enabled = true) {
  return useQuery({ queryKey: ['word-profile', term.toLowerCase()], queryFn: () => api.wordProfile(term), enabled: enabled && Boolean(term), staleTime: 30 * 60_000 });
}

function Section({ title, icon, children, hint }: { title: string; icon: React.ReactNode; children: React.ReactNode; hint?: string }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-wide text-ink">
        {icon} {title}
      </h3>
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function AddWordButton({ word }: { word: string }) {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ['word-keys'], queryFn: api.wordKeys, staleTime: 60_000 });
  const inBook = keys.data?.some((k) => k.key === word.toLowerCase());
  const add = useMutation({
    mutationFn: () => api.createWord({ term: word }),
    onSuccess: ({ word: w, existed }) => {
      toast.success(existed ? `“${w.term}” đã có trong sổ` : `Đã thêm “${w.term}” vào sổ từ`);
      qc.invalidateQueries({ queryKey: ['word-keys'] });
      qc.invalidateQueries({ queryKey: ['words'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (inBook) return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Trong sổ</Badge>;
  return (
    <button
      type="button"
      onClick={() => add.mutate()}
      disabled={add.isPending}
      className="rounded-md p-0.5 text-muted transition hover:bg-violet-100 hover:text-violet-700 disabled:opacity-50 dark:hover:bg-violet-500/15"
      aria-label={`Thêm ${word} vào sổ từ`}
      title="Thêm vào sổ từ"
    >
      <BookmarkPlus className="h-4 w-4" />
    </button>
  );
}

/**
 * Hồ sơ từ: họ từ, nghĩa chính, từ đồng nghĩa (định nghĩa + độ phổ biến + nhãn văn phong + collocation),
 * collocation của chính từ đó và các câu chứa từ trong video đã xem.
 */
export function WordProfileView({ term, compact = false }: { term: string; compact?: boolean }) {
  const q = useWordProfile(term);
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
        <p className="text-center text-xs text-muted">Đang tổng hợp từ WordNet, Datamuse và Wiktionary…</p>
      </div>
    );
  return <ProfileBody p={q.data} compact={compact} />;
}

function ProfileBody({ p, compact }: { p: WordProfile; compact: boolean }) {
  const familyByPos = POS_ORDER.map((pos) => ({ pos, items: p.family.filter((f) => f.pos === pos) })).filter((g) => g.items.length);
  return (
    <div className={cn('space-y-6', compact && 'space-y-5')}>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-extrabold text-ink">{p.lemma}</h1>
          <AudioButton term={p.lemma} />
          {p.mainPos && <span className="text-muted">({posLabel(p.mainPos)})</span>}
          {p.labels.map((l) => (
            <Badge key={l} className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              {l}
            </Badge>
          ))}
          <AddWordButton word={p.lemma} />
        </div>
      )}

      {familyByPos.length > 1 && (
        <Section title="Họ từ" icon={<Network className="h-4 w-4 text-sky-500" />} hint="Biết cả họ từ giúp bạn đổi dạng linh hoạt khi nói và viết (decide → decision → decisive → decisively).">
          <div className="grid gap-2 sm:grid-cols-2">
            {familyByPos.map((g) => (
              <div key={g.pos} className={cn('rounded-xl border p-2.5', POS_TONE[g.pos])}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide opacity-80">{posLabel(g.pos)}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {g.items.map((f) => (
                    <span key={f.word} className="inline-flex items-center gap-1">
                      <Link to={`/profile/${encodeURIComponent(f.word)}`} className="font-bold hover:underline">
                        {f.word}
                      </Link>
                      {f.meaning && <span className="text-xs opacity-80">· {f.meaning}</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {!compact && p.senses.length > 0 && (
        <Section title="Các nghĩa chính" icon={<Info className="h-4 w-4 text-violet-500" />}>
          <ol className="space-y-2">
            {p.senses.map((s, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-3 text-sm">
                <span className="mr-1.5 text-xs font-bold text-muted">{posLabel(s.pos)}</span>
                <span className="text-ink">{s.gloss}</span>
                {s.examples[0] && (
                  <p className="mt-1 italic text-muted">
                    “<Highlight text={s.examples[0]} term={p.lemma} />”
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {p.synonyms.length > 0 && (
        <Section
          title="Từ đồng nghĩa & sắc thái"
          icon={<Sparkles className="h-4 w-4 text-fuchsia-500" />}
          hint="So sánh định nghĩa, độ phổ biến, nhãn văn phong và từ hay đi kèm để chọn từ đúng ngữ cảnh — từ đồng nghĩa hiếm khi thay thế được cho nhau hoàn toàn."
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {p.synonyms.map((s) => (
              <div key={s.word} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link to={`/profile/${encodeURIComponent(s.word)}`} className="font-bold text-ink hover:text-violet-600 hover:underline">
                    {s.word}
                  </Link>
                  <AudioButton term={s.word} size="sm" />
                  {s.pos && <span className="text-xs text-muted">{posLabel(s.pos)}</span>}
                  <LevelBadge level={s.level} />
                  {s.labels.map((l) => (
                    <Badge key={l} className="bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                      {l}
                    </Badge>
                  ))}
                  <span className="ml-auto">
                    <AddWordButton word={s.word} />
                  </span>
                </div>
                {s.gloss && <p className="mt-1 text-sm leading-relaxed text-muted">{s.gloss}</p>}
                {s.collocations.length > 0 && <p className="mt-1 text-xs text-ink/80">Hay đi với: {s.collocations.join(' · ')}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {p.upgrade && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="mb-1 font-bold">💡 “{p.upgrade.basic}” là từ cơ bản hay bị dùng quá nhiều. Thử thay bằng:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {p.upgrade.note.split(' · ').map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <Link to="/practice/play?mode=upgrade&source=all&count=10" className="mt-2 inline-flex items-center gap-1 font-semibold underline">
            Luyện “nâng cấp từ” <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {p.collocations.length > 0 && (
        <Section title="Collocation" icon={<Link2 className="h-4 w-4 text-emerald-500" />} hint="Những từ hay đi cùng — học theo cụm để nói tự nhiên hơn.">
          <div className="space-y-2">
            {p.collocations.map((g) => (
              <div key={g.label}>
                <p className="mb-1 text-xs font-semibold text-muted">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.items.map((c) => (
                    <span key={c.text} className="rounded-lg bg-surface-2 px-2 py-1 text-sm font-semibold text-ink">
                      {c.text}
                      {c.vi && <span className="ml-1 font-normal text-muted">· {c.vi}</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {p.occurrences.length > 0 && (
        <Section title="Trong video bạn đã xem" icon={<Video className="h-4 w-4 text-rose-500" />}>
          <ul className="space-y-1.5">
            {p.occurrences.map((o, i) => (
              <li key={i}>
                <Link to={`/watch/${o.videoId}?t=${Math.floor(o.start)}`} className="block rounded-xl p-2 text-sm hover:bg-surface-2">
                  <span className="mr-1.5 font-mono text-xs text-rose-600 dark:text-rose-400">{formatTime(o.start)}</span>
                  <Highlight text={o.text} term={p.lemma} />
                  {o.videoTitle && <span className="block truncate text-xs text-muted">{o.videoTitle}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!compact && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            Quay lại
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted">Nguồn: {p.sources.join(' · ')}</p>
    </div>
  );
}
