import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Play, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LinkButton } from '../../components/ui/Button';
import { Card, ErrorBox, Input, Skeleton } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { AudioButton } from '../../components/word/bits';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';

const POS_LABEL: Record<string, string> = { adj: 'Tính từ', verb: 'Động từ', noun: 'Danh từ', adv: 'Trạng từ', quantity: 'Lượng từ', prep: 'Giới từ' };

/** Sổ tay "nâng cấp từ": từ cơ bản hay bị dùng quá nhiều → từ thay thế kèm sắc thái (soạn tay). */
export default function Upgrades() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['upgrades'], queryFn: api.upgrades, staleTime: 5 * 60_000 });
  const keys = useQuery({ queryKey: ['word-keys'], queryFn: api.wordKeys, staleTime: 60_000 });
  const [q, setQ] = useState('');
  const inBook = useMemo(() => new Set((keys.data ?? []).map((k) => k.key)), [keys.data]);

  const add = useMutation({
    mutationFn: ({ word, vi, note }: { word: string; vi: string; note: string }) => api.createWord({ term: word, meaning: vi, note }),
    onSuccess: ({ word, existed }) => {
      toast.success(existed ? `“${word.term}” đã có trong sổ` : `Đã thêm “${word.term}” vào sổ từ`);
      qc.invalidateQueries({ queryKey: ['word-keys'] });
      qc.invalidateQueries({ queryKey: ['words'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list.data ?? [];
    return (list.data ?? []).filter((e) => e.basic.includes(s) || e.upgrades.some((u) => u.word.includes(s) || u.vi.toLowerCase().includes(s)));
  }, [list.data, q]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <LinkButton to="/practice" variant="ghost" size="icon" icon={<ArrowLeft className="h-5 w-5" />}>
          <span className="sr-only">Quay lại</span>
        </LinkButton>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            Sổ tay nâng cấp từ 🚀 <Term k="upgrade" icon />
          </h1>
          <p className="text-sm text-muted">Thay những từ hay bị lạm dụng (good, big, very, think…) bằng từ chính xác hơn — chú ý sắc thái và ngữ cảnh dùng.</p>
        </div>
        <LinkButton to="/practice/play?mode=upgrade&source=all&count=10" variant="primary" icon={<Play className="h-4 w-4 fill-current" />}>
          Luyện 10 câu
        </LinkButton>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm từ: good, quan trọng, increase…" className="pl-9" aria-label="Tìm từ" />
      </div>

      {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      {list.isPending ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((e) => (
            <Card key={e.basic} className="space-y-3 p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-ink line-through decoration-rose-400/70 decoration-2">{e.basic}</span>
                <span className="text-xs font-semibold text-muted">{POS_LABEL[e.pos] ?? e.pos}</span>
                {e.inNotebook.length > 0 && <span className="ml-auto text-xs font-semibold text-emerald-600">{e.inNotebook.length} từ đã trong sổ</span>}
              </div>
              <ul className="space-y-2">
                {e.upgrades.map((u) => {
                  const saved = inBook.has(u.word.toLowerCase());
                  return (
                    <li key={u.word} className="flex items-start gap-2 rounded-xl bg-surface-2 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-ink">{u.word}</span>
                          <AudioButton term={u.word} size="sm" />
                          <span className="text-sm text-brand-700 dark:text-brand-300">{u.vi}</span>
                        </p>
                        <p className="text-xs leading-relaxed text-muted">{u.note}</p>
                      </div>
                      <button
                        type="button"
                        disabled={saved || add.isPending}
                        onClick={() => add.mutate({ word: u.word, vi: u.vi, note: `Thay cho “${e.basic}”: ${u.note}` })}
                        className={cn(
                          'mt-0.5 rounded-lg p-1.5 transition',
                          saved ? 'text-emerald-600' : 'text-muted hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-brand-500/15',
                        )}
                        aria-label={saved ? `${u.word} đã trong sổ` : `Thêm ${u.word} vào sổ`}
                        title={saved ? 'Đã trong sổ từ' : 'Thêm vào sổ từ'}
                      >
                        {saved ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
          {!filtered.length && <p className="text-sm text-muted">Không có từ nào khớp “{q}”.</p>}
        </div>
      )}
    </div>
  );
}
