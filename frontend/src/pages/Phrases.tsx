import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, Layers, Mic, Pencil, Search, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { HeroArt } from '../components/ui/HeroArt';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { Badge, Card, EmptyState, ErrorBox, Field, Input, Skeleton } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { ClipPlayer } from '../components/video/ClipPlayer';
import { useDebounced } from '../hooks/misc';
import { api } from '../lib/api';
import type { Phrase, PhraseStatus } from '../lib/types';
import { cn, formatTime, relativeTime } from '../lib/utils';
import { ChunkSentence } from '../components/phrase/ChunkSentence';

const STATUS: Record<PhraseStatus, { label: string; className: string }> = {
  new: { label: 'Mới', className: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  learning: { label: 'Đang học', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200' },
  reviewing: { label: 'Đang ôn', className: 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200' },
  mastered: { label: 'Thành thạo', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
};

const TABS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'due', label: 'Đến hạn' },
  { key: 'new', label: 'Mới' },
  { key: 'learning', label: 'Đang học' },
  { key: 'reviewing', label: 'Đang ôn' },
  { key: 'mastered', label: 'Thành thạo' },
];

function EditDialog({ phrase, onClose }: { phrase: Phrase | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [chunk, setChunk] = useState('');
  const [chunkVi, setChunkVi] = useState('');
  const [note, setNote] = useState('');
  const [lastId, setLastId] = useState<number | null>(null);
  if (phrase && phrase.id !== lastId) {
    setLastId(phrase.id);
    setChunk(phrase.chunk);
    setChunkVi(phrase.chunkVi);
    setNote(phrase.note);
  }
  const save = useMutation({
    mutationFn: () => api.updatePhrase(phrase!.id, { chunk, chunkVi: chunk === phrase!.chunk ? chunkVi : undefined, note }),
    onSuccess: () => {
      toast.success('Đã cập nhật mẫu câu');
      qc.invalidateQueries({ queryKey: ['phrases'] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Modal
      open={Boolean(phrase)}
      onClose={onClose}
      title="Sửa mẫu câu"
      description={phrase?.sentence}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Cụm cần học" hint="Phải là một đoạn nằm trong câu. Đổi cụm thì nghĩa tiếng Việt sẽ được dịch lại.">
          <Input value={chunk} onChange={(e) => setChunk(e.target.value)} />
        </Field>
        <Field label="Nghĩa của cụm">
          <Input value={chunkVi} onChange={(e) => setChunkVi(e.target.value)} disabled={chunk !== phrase?.chunk} />
        </Field>
        <Field label="Ghi chú">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Khi nào dùng, sắc thái…" />
        </Field>
      </div>
    </Modal>
  );
}

function PhraseRow({ p, onEdit, onDelete }: { p: Phrase; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [signal, setSignal] = useState(0);
  return (
    <li className="card space-y-2 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-relaxed text-ink">
            <ChunkSentence sentence={p.sentence} chunk={p.chunk} hidden={false} />
          </p>
          {p.sentenceVi && <p className="mt-0.5 text-sm text-muted">{p.sentenceVi}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge className={STATUS[p.status].className}>{STATUS[p.status].label}</Badge>
            {p.chunk && p.chunkVi && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold text-ink">
                {p.chunk} = {p.chunkVi}
              </span>
            )}
            {p.speakCount > 0 && (
              <span className="inline-flex items-center gap-1 text-muted">
                <Mic className="h-3.5 w-3.5" /> nói {p.speakCount} lần
              </span>
            )}
            {p.videoId && (
              <Link to={`/watch/${p.videoId}?t=${Math.floor(p.start ?? 0)}`} className="inline-flex max-w-[16rem] items-center gap-1 truncate text-rose-600 hover:underline dark:text-rose-400">
                <Video className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{p.videoTitle ?? 'Video'}</span> · {formatTime(p.start ?? 0)}
              </Link>
            )}
            <span className="text-muted">· lưu {relativeTime(p.createdAt)}</span>
          </div>
          {p.note && <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">💡 {p.note}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon-sm"
            variant={open ? 'soft' : 'ghost'}
            onClick={() => {
              setOpen(true);
              setSignal((n) => n + 1);
            }}
            aria-label="Nghe đoạn gốc"
            title="Nghe đoạn gốc"
          >
            <Video className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Sửa">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onDelete} aria-label="Xoá">
            <Trash2 className="h-4 w-4 text-rose-500" />
          </Button>
        </div>
      </div>
      {open && <ClipPlayer clip={{ videoId: p.videoId, start: p.start, end: p.end, text: p.sentence }} playSignal={signal} />}
    </li>
  );
}

/** Sổ mẫu câu: các câu hay lưu từ video, kèm cụm cần học; ôn bằng FSRS và luyện nói lại. */
export default function Phrases() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Phrase | null>(null);
  const [deleting, setDeleting] = useState<Phrase | null>(null);
  const query = useDebounced(q, 250);
  const list = useQuery({
    queryKey: ['phrases', status, query, page],
    queryFn: () => api.phrases({ status, q: query, page, limit: 30 }),
    placeholderData: keepPreviousData,
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deletePhrase(id),
    onSuccess: () => {
      toast.success('Đã xoá mẫu câu');
      qc.invalidateQueries({ queryKey: ['phrases'] });
      // Bỏ đánh dấu "đã lưu" trên phụ đề của video chứa câu này
      qc.invalidateQueries({ queryKey: ['video-phrases'] });
    },
  });
  const counts = list.data?.counts ?? {};
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 30));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-hero [--hero-glow:var(--color-fuchsia-400)] p-6 text-white shadow-glow sm:p-8">
        <HeroArt items={['💬', '📝', '🔖']} />
        <h1 className="pr-14 xl:pr-0 relative flex items-center gap-2 text-2xl font-black sm:text-3xl">
          Sổ mẫu câu <Term k="phrase" icon className="text-white/80 hover:bg-white/20 hover:text-white dark:hover:text-white" />
        </h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/90">
          Lưu câu hay từ phụ đề (nút <BookmarkPlus className="inline h-4 w-4" /> hoặc phím B) để học theo cụm và nghe lại đúng giọng người nói.
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <LinkButton to="/review" variant="secondary" icon={<Layers className="h-4 w-4" />} className="bg-white/90 text-fuchsia-700 hover:bg-white">
            Ôn thẻ đến hạn ({counts.due ?? 0})
          </LinkButton>
          <LinkButton to="/speaking" variant="secondary" icon={<Mic className="h-4 w-4" />} className="bg-white/20 text-white hover:bg-white/30">
            Luyện nói lại
          </LinkButton>
        </div>
      </section>

      <Card className="space-y-3 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm trong câu, cụm, nghĩa, ghi chú…"
            className="pl-9"
            aria-label="Tìm mẫu câu"
          />
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setStatus(t.key);
                setPage(1);
              }}
              className={cn(
                'h-8 shrink-0 rounded-lg px-3 text-sm font-semibold transition',
                status === t.key ? 'bg-ink text-bg' : 'bg-surface-2 text-ink hover:bg-surface-3',
              )}
            >
              {t.label} <span className="opacity-60">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </Card>

      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      {list.isPending ? (
        <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : list.data && list.data.items.length === 0 ? (
        <EmptyState
          icon="💬"
          title={counts.all ? 'Không có mẫu câu nào khớp' : 'Chưa lưu mẫu câu nào'}
          description="Mở một video, di chuột vào câu trong phụ đề và bấm biểu tượng dấu trang (hoặc phím B) để lưu câu hay kèm cụm cần học."
          action={<LinkButton to="/explore" variant="primary">Tìm video để học</LinkButton>}
        />
      ) : (
        <ul className="space-y-3">
          {list.data?.items.map((p) => (
            <PhraseRow key={p.id} p={p} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </Button>
          <span className="text-sm text-muted">
            {page}/{totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Sau
          </Button>
        </div>
      )}

      <EditDialog phrase={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        title="Xoá mẫu câu?"
        message={deleting?.sentence}
        confirmLabel="Xoá"
        danger
      />
    </div>
  );
}
