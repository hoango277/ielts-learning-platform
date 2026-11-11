import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { ArrowLeft, Check, GalleryHorizontalEnd, Layers, Plus, Search, Target, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Badge, EmptyState, ErrorBox, Input, Kbd, Progress, Segmented, Skeleton } from '../components/ui/primitives';
import { AudioButton, Highlight, LevelBadge, StatusBadge, useAccent } from '../components/word/bits';
import { useHotkeys } from '../hooks/useHotkeys';
import { api } from '../lib/api';
import { pronounce } from '../lib/speech';
import type { LexiconEntry } from '../lib/types';
import { cn, colorOf, LEVEL_BAND, posLabel } from '../lib/utils';

function useAddWords(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lexiconIds?: number[]; known?: boolean }) => api.addTopicWords(slug, body),
    onSuccess: (r, body) => {
      qc.invalidateQueries({ queryKey: ['topic', slug] });
      qc.invalidateQueries({ queryKey: ['topics'] });
      qc.invalidateQueries({ queryKey: ['words'] });
      qc.invalidateQueries({ queryKey: ['word-keys'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      if (!body.lexiconIds || body.lexiconIds.length > 1) {
        toast.success(`Đã thêm ${r.added} từ vào sổ${r.updated ? `, cập nhật ${r.updated} từ` : ''}`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });
}

function WordCard({ w, slug }: { w: LexiconEntry; slug: string }) {
  const add = useAddWords(slug);
  const [open, setOpen] = useState(false);
  const ex = w.examples[0];
  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-lg font-extrabold text-ink">{w.word}</h3>
            <AudioButton term={w.word} audio={w.audioUs ?? w.audio} size="sm" />
          </div>
          <p className="text-xs text-muted">
            <span className="font-ipa">{w.ipaUs ?? w.ipa}</span> {w.pos && `· ${posLabel(w.pos)}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <LevelBadge level={w.level} />
          {w.group === 'core' && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" title="Từ/cụm cốt lõi của chủ đề — nên học trước">
              Cốt lõi
            </Badge>
          )}
        </div>
      </div>
      <p className="mt-2 font-semibold text-ink">{w.meaning}</p>
      {ex && (
        <div className="mt-2 rounded-xl bg-surface-2 p-2.5 text-sm">
          <p className="leading-relaxed text-ink">
            <Highlight text={ex.en} term={w.word} />
          </p>
          {ex.vi && <p className="mt-0.5 text-muted">{ex.vi}</p>}
        </div>
      )}
      {open && (
        <div className="mt-2 space-y-2 text-sm">
          {w.definitions.slice(0, 2).map((d, i) => (
            <p key={i} className="text-muted">
              <i className="text-violet-600 dark:text-violet-300">{d.pos}</i> {d.definition}
            </p>
          ))}
          {w.meanings.length > 0 && <p className="text-muted">{w.meanings.map((m) => `${m.pos}: ${m.terms.slice(0, 4).join(', ')}`).join(' · ')}</p>}
          {w.synonyms.length > 0 && <p className="text-muted">≈ {w.synonyms.slice(0, 6).join(', ')}</p>}
        </div>
      )}
      {w.collocations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {w.collocations.slice(0, 4).map((c) => (
            <span key={c} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-3">
        {w.status ? (
          <StatusBadge status={w.status} />
        ) : (
          <>
            <Button size="sm" variant="soft" loading={add.isPending && add.variables?.known === false} icon={<Plus className="h-4 w-4" />} onClick={() => add.mutate({ lexiconIds: [w.id], known: false })}>
              Học từ này
            </Button>
            <Button size="sm" variant="ghost" loading={add.isPending && add.variables?.known === true} icon={<Check className="h-4 w-4 text-teal-500" />} onClick={() => add.mutate({ lexiconIds: [w.id], known: true })}>
              Đã biết
            </Button>
          </>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} className="ml-auto text-xs font-semibold text-muted hover:text-ink">
          {open ? 'Thu gọn' : 'Chi tiết'}
        </button>
      </div>
    </article>
  );
}

/** Lướt thẻ kiểu Quizlet: biết rồi → đánh dấu đã thuộc; chưa biết → thêm vào sổ để học. */
function BrowseDeck({ words, slug, onClose }: { words: LexiconEntry[]; slug: string; onClose: () => void }) {
  const deck = useMemo(() => words.filter((w) => !w.status), [words]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [tally, setTally] = useState({ known: 0, learn: 0 });
  const add = useAddWords(slug);
  const { accent } = useAccent();
  const w = deck[i];
  useEffect(() => {
    setFlipped(false);
    if (w) pronounce(w.word, { audio: w.audioUs ?? w.audio, accent });
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (deck.length && i >= deck.length) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  }, [i, deck.length]);

  const decide = (known: boolean) => {
    if (!w) return;
    add.mutate({ lexiconIds: [w.id], known });
    setTally((t) => (known ? { ...t, known: t.known + 1 } : { ...t, learn: t.learn + 1 }));
    setI((x) => x + 1);
  };
  useHotkeys({ space: () => setFlipped((f) => !f), ArrowLeft: () => decide(false), ArrowRight: () => decide(true) });

  return (
    <Modal open onClose={onClose} title="Lướt thẻ chủ đề" description="Biết rồi → đánh dấu đã thuộc · Chưa biết → thêm vào sổ để ôn" size="lg">
      {!w ? (
        <EmptyState
          icon="🎉"
          title={deck.length ? 'Đã lướt hết!' : 'Bạn đã xử lý mọi từ của chủ đề'}
          description={deck.length ? `${tally.learn} từ đã thêm vào sổ để học · ${tally.known} từ bạn đã biết.` : undefined}
          action={
            <div className="flex gap-2">
              <LinkButton to="/review" variant="primary" icon={<Layers className="h-4 w-4" />}>
                  Ôn tập ngay
                </LinkButton>
              <Button variant="outline" onClick={onClose}>
                Đóng
              </Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          <Progress value={i / deck.length} />
          <button type="button" onClick={() => setFlipped((f) => !f)} className="perspective block h-72 w-full" aria-label="Lật thẻ">
            <div className="relative h-full w-full transition-transform duration-500 preserve-3d" style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl border border-line bg-surface-2 p-6 shadow-card backface-hidden">
                <LevelBadge level={w.level} />
                <p className="text-4xl font-extrabold text-ink">{w.word}</p>
                <p className="font-ipa text-muted">{w.ipaUs ?? w.ipa}</p>
                <p className="text-xs text-muted">Bấm để xem nghĩa</p>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto rounded-3xl border border-line bg-surface p-6 text-center shadow-card backface-hidden rotate-y-180">
                <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">{w.meaning}</p>
                {w.definitions[0] && <p className="text-sm text-muted">{w.definitions[0].definition}</p>}
                {w.examples[0] && (
                  <p className="text-sm italic text-ink">
                    “<Highlight text={w.examples[0].en} term={w.word} />”
                  </p>
                )}
              </div>
            </div>
          </button>
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" variant="outline" className="border-rose-200 text-rose-600 dark:border-rose-500/30" icon={<X className="h-5 w-5" />} onClick={() => decide(false)}>
              Chưa biết · học
            </Button>
            <Button size="lg" variant="success" icon={<Check className="h-5 w-5" />} onClick={() => decide(true)}>
              Đã biết
            </Button>
          </div>
          <p className="text-center text-xs text-muted">
            {i + 1}/{deck.length} · <Kbd>←</Kbd> chưa biết · <Kbd>→</Kbd> đã biết · <Kbd>Space</Kbd> lật
          </p>
        </div>
      )}
    </Modal>
  );
}

export default function TopicDetail() {
  const { slug = '' } = useParams();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['topic', slug], queryFn: () => api.topic(slug) });
  const add = useAddWords(slug);
  const [group, setGroup] = useState<'all' | 'core' | 'related'>('all');
  const [level, setLevel] = useState('all');
  const [status, setStatus] = useState<'all' | 'todo' | 'in'>('all');
  const [q, setQ] = useState('');
  const [browse, setBrowse] = useState(false);

  const words = useMemo(
    () =>
      (data?.words ?? []).filter(
        (w) =>
          (group === 'all' || w.group === group) &&
          (level === 'all' || w.level === level) &&
          (status === 'all' || (status === 'todo' ? !w.status : Boolean(w.status))) &&
          (!q || `${w.word} ${w.meaning}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, group, level, status, q],
  );
  const levels = useMemo(() => [...new Set((data?.words ?? []).map((w) => w.level).filter(Boolean) as string[])].sort(), [data]);

  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-3xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      </div>
    );

  const t = data.topic;
  const c = colorOf(t.color);
  const todo = data.words.filter((w) => !w.status).length;

  return (
    <div className="space-y-6">
      <Link to="/topics" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Tất cả chủ đề
      </Link>
      <section className={cn('relative overflow-hidden rounded-3xl bg-linear-to-br p-6 text-white shadow-card sm:p-8', c.gradient)}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 animate-float-slow rounded-full bg-white/20 blur-2xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-20 w-20 animate-float items-center justify-center rounded-3xl bg-white/20 text-5xl shadow-[inset_0_1px_0_rgb(255_255_255/0.4)] ring-1 ring-white/30 backdrop-blur">{t.icon}</span>
            <div>
              <h1 className="text-3xl font-black">{t.name}</h1>
              <p className="text-lg font-semibold text-white/90">{t.nameVi}</p>
              <p className="mt-1 max-w-xl text-sm text-white/85">{t.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-white text-ink hover:bg-white/90" icon={<GalleryHorizontalEnd className="h-4 w-4" />} onClick={() => setBrowse(true)} disabled={!todo}>
              Lướt thẻ ({todo})
            </Button>
            <LinkButton to={`/practice/play?mode=mixed&source=topic&topicId=${t.id}&count=10`} className="bg-white/20 text-white hover:bg-white/30" icon={<Target className="h-4 w-4" />}>
                Luyện tập
              </LinkButton>
            <Button className="bg-white/20 text-white hover:bg-white/30" icon={<Plus className="h-4 w-4" />} loading={add.isPending} onClick={() => add.mutate({})} disabled={!todo}>
              Thêm tất cả vào sổ
            </Button>
          </div>
        </div>
        <div className="relative mt-5 max-w-md">
          <div className="mb-1 flex justify-between text-xs font-semibold text-white/85">
            <span>{t.wordCount} từ</span>
            <span>
              {t.inNotebook} trong sổ · {t.mastered} đã nhớ
            </span>
          </div>
          <Progress value={t.wordCount ? t.inNotebook / t.wordCount : 0} className="h-2 bg-white/25" barClassName="bg-white" />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={group}
          onChange={setGroup}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'core', label: 'Cụm từ cốt lõi' },
            { value: 'related', label: 'Từ liên quan' },
          ]}
          ariaLabel="Nhóm từ"
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Mọi trạng thái' },
            { value: 'todo', label: 'Chưa học' },
            { value: 'in', label: 'Trong sổ' },
          ]}
          ariaLabel="Trạng thái"
        />
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm từ…" className="pl-9" aria-label="Tìm từ trong chủ đề" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {['all', ...levels].map((lv) => (
          <button
            key={lv}
            type="button"
            onClick={() => setLevel(lv)}
            title={lv !== 'all' ? `Ước lượng IELTS ${LEVEL_BAND[lv] ?? ''}` : undefined}
            className={cn('h-8 rounded-lg px-3 text-xs font-bold transition', level === lv ? 'bg-ink text-bg' : 'bg-surface-2 text-muted hover:text-ink')}
          >
            {lv === 'all' ? 'Mọi cấp độ' : lv}
          </button>
        ))}
      </div>

      {words.length === 0 ? (
        <EmptyState icon="🔍" title="Không có từ phù hợp" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {words.map((w) => (
            <WordCard key={w.id} w={w} slug={slug} />
          ))}
        </div>
      )}
      {browse && <BrowseDeck words={data.words} slug={slug} onClose={() => setBrowse(false)} />}
    </div>
  );
}
