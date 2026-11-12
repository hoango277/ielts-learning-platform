import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Progress, Segmented, Textarea } from '../ui/primitives';

type Group = 'core' | 'related' | 'advanced';
interface Result {
  term: string;
  ok: boolean;
  note: string;
}

/** Tách danh sách người dùng dán vào: mỗi dòng / dấu phẩy / chấm phẩy là một từ; bỏ số thứ tự "1." và trùng lặp */
export function parseTerms(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/[\n,;]+/)
    .map((t) => t.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim())
    .filter((t) => t && !seen.has(t.toLowerCase()) && Boolean(seen.add(t.toLowerCase())))
    .slice(0, 100);
}

/**
 * Thêm từ vào bộ: gõ hoặc dán nhiều từ cùng lúc. Máy chủ tự tra nghĩa, phiên âm, ví dụ cho từ mới
 * (vài giây mỗi từ) nên gửi lần lượt 2 từ một, có thanh tiến độ và báo từ nào không tra được.
 * `groups` = cho chọn nhóm (bộ chung của quản trị viên); bộ riêng chỉ có một nhóm.
 */
export function AddWordsPanel({ slug, groups = false, className }: { slug: string; groups?: boolean; className?: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [group, setGroup] = useState<Group>('related');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const cancelled = useRef(false);
  const terms = parseTerms(text);

  const run = async () => {
    if (!terms.length || busy) return;
    cancelled.current = false;
    setBusy(true);
    setDone(0);
    setTotal(terms.length);
    setResults([]);
    const queue = [...terms];
    const out: Result[] = [];
    const worker = async () => {
      while (queue.length && !cancelled.current) {
        const term = queue.shift()!;
        try {
          const r = await api.addTopicEntry(slug, { term, group: groups ? group : undefined });
          out.push({ term: r.word.word, ok: true, note: r.alreadyInTopic ? 'đã có trong bộ' : r.word.meaning });
        } catch (e) {
          out.push({ term, ok: false, note: (e as Error).message });
        }
        setDone((d) => d + 1);
        setResults([...out]);
        // Cập nhật danh sách từ dần dần để người dùng thấy từ mới xuất hiện ngay
        qc.invalidateQueries({ queryKey: ['topic', slug] });
      }
    };
    await Promise.all([worker(), worker()]);
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['topics'] });
    const ok = out.filter((r) => r.ok).length;
    const failed = out.length - ok;
    if (ok) toast.success(`Đã thêm ${ok} từ${failed ? ` · ${failed} từ chưa thêm được` : ''}`);
    else if (failed) toast.error('Chưa thêm được từ nào — xem chi tiết bên dưới.');
    // Giữ lại những từ lỗi để sửa chính tả rồi thêm lại
    setText(out.filter((r) => !r.ok).map((r) => r.term).join('\n'));
  };

  return (
    <section className={cn('card space-y-3 p-4 sm:p-5', className)} aria-label="Thêm từ vào bộ">
      <div>
        <h2 className="flex items-center gap-2 font-extrabold text-ink">
          <Plus className="h-5 w-5 text-brand-600 dark:text-brand-300" /> Thêm từ
        </h2>
        <p className="text-sm text-muted">
          Mỗi dòng một từ hoặc cụm từ (hoặc cách nhau bằng dấu phẩy) — dán cả danh sách cũng được. App tự điền nghĩa, phiên âm, câu ví dụ và cấp độ.
        </p>
      </div>
      <Textarea
        rows={4}
        value={text}
        disabled={busy}
        aria-label="Danh sách từ cần thêm"
        placeholder={'mitigate\nsustainable development\nbreak the ice'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/⌘ + Enter = thêm; chặn phím tắt toàn trang
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void run();
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        {groups && (
          <Segmented
            size="sm"
            value={group}
            onChange={setGroup}
            ariaLabel="Nhóm"
            options={[
              { value: 'core', label: 'Cốt lõi' },
              { value: 'related', label: 'Liên quan' },
              { value: 'advanced', label: 'Nâng cao' },
            ]}
          />
        )}
        <span className="text-sm text-muted">{terms.length ? `${terms.length} từ` : ''}</span>
        <div className="ml-auto flex gap-2">
          {busy && (
            <Button variant="ghost" onClick={() => (cancelled.current = true)}>
              Dừng
            </Button>
          )}
          <Button variant="primary" loading={busy} disabled={!terms.length} onClick={() => void run()} icon={<Plus className="h-4 w-4" />}>
            Thêm {terms.length > 1 ? `${terms.length} từ` : 'từ'}
          </Button>
        </div>
      </div>
      {total > 0 && (
        <div className="space-y-2" aria-live="polite">
          {busy && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted">
                Đang tra {done}/{total}… (mỗi từ mới mất vài giây)
              </p>
              <Progress value={total ? done / total : 0} />
            </div>
          )}
          {results.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {results.map((r) => (
                <li key={r.term} className="flex items-start gap-2">
                  {r.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  ) : (
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <span className="min-w-0">
                    <b className="text-ink">{r.term}</b> <span className="text-muted">— {r.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
