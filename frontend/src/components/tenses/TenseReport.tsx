import { AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { useState } from 'react';
import type { TenseAnalysis } from '../../lib/types';
import { cn } from '../../lib/utils';
import { FORM_META, tenseColor } from './meta';

type ASentence = TenseAnalysis['sentences'][number];

/** Câu với động từ được tô theo thì và chỗ lỗi gạch sóng đỏ */
export function HighlightedSentence({ s, className }: { s: ASentence; className?: string }) {
  const cuts = new Set<number>([0, s.text.length]);
  for (const v of s.verbs) for (const [a, b] of v.parts) cuts.add(a).add(b);
  for (const i of s.issues) cuts.add(i.start).add(i.end);
  const pts = [...cuts].filter((n) => n >= 0 && n <= s.text.length).sort((x, y) => x - y);
  return (
    <p className={cn('leading-relaxed text-ink', className)}>
      {pts.slice(0, -1).map((a, k) => {
        const b = pts[k + 1];
        const v = s.verbs.find((x) => x.parts.some(([p, q]) => a >= p && b <= q));
        const bad = s.issues.some((i) => a >= i.start && b <= i.end);
        return (
          <span
            key={k}
            data-tense={v?.form}
            title={v ? v.label : undefined}
            className={cn(v && 'tense-mark', bad && 'underline decoration-rose-500 decoration-wavy decoration-2 underline-offset-4')}
          >
            {s.text.slice(a, b)}
          </span>
        );
      })}
    </p>
  );
}

function IssueRow({ issue }: { issue: ASentence['issues'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-amber-50 p-2.5 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
      <p>
        <b>“{issue.text}”</b> — {issue.hint}
      </p>
      {open ? (
        <p className="mt-1">
          {issue.fix && (
            <>
              Gợi ý sửa: <b className="text-emerald-700 dark:text-emerald-300">{issue.fix}</b>.{' '}
            </>
          )}
          {issue.explain}
        </p>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2">
          <Eye className="h-3.5 w-3.5" /> Tự sửa trước, rồi bấm xem cách sửa
        </button>
      )}
    </div>
  );
}

/** Kết quả soát thì một đoạn: các thì đã dùng + từng câu (tô màu) + lỗi (gợi ý trước, đáp án sau). */
export function TenseReport({ analysis, compact }: { analysis: TenseAnalysis; compact?: boolean }) {
  if (!analysis.sentences.length) return <p className="text-sm text-muted">Chưa có câu nào để soát.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {analysis.counts.map((c) => (
          <span key={c.form} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink">
            <span className="h-2 w-2 rounded-full" style={{ background: tenseColor(c.form) }} />
            {FORM_META[c.form]?.label ?? c.label} ×{c.count}
          </span>
        ))}
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-xs font-bold',
            analysis.issueCount ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300',
          )}
        >
          {analysis.issueCount ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {analysis.issueCount ? `${analysis.issueCount} chỗ nên xem lại` : 'Không thấy lỗi thì nào'}
        </span>
      </div>
      <ol className={cn('space-y-2', compact && 'text-sm')}>
        {analysis.sentences.map((s, i) => (
          <li key={i} className="space-y-1.5">
            <HighlightedSentence s={s} />
            {s.issues.map((iss) => (
              <IssueRow key={`${iss.start}-${iss.type}`} issue={iss} />
            ))}
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">Nhận diện thì tự động — đôi khi nhầm, nhất là câu rất dài hoặc lời nói không có dấu câu.</p>
    </div>
  );
}
