import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Eye, Send, SpellCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { FORM_META, tenseColor } from '../../components/tenses/meta';
import { TenseReport } from '../../components/tenses/TenseReport';
import { Button } from '../../components/ui/Button';
import { Card, ErrorBox, Select, Skeleton, Textarea } from '../../components/ui/primitives';
import { api } from '../../lib/api';
import type { TenseAnalysis, TensePrompt, TenseWritingResult } from '../../lib/types';
import { cn, relativeTime } from '../../lib/utils';

const countSentences = (t: string) => (t.match(/[^.!?\n]*[\p{L}][^.!?\n]*([.!?]+|\n|$)/gu) ?? []).filter((s) => /\p{L}/u.test(s)).length;
const draftKey = (id: string) => `tense-draft:${id}`;

export default function WritingPage() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const prompts = useQuery({ queryKey: ['tense-prompts'], queryFn: api.tensePrompts, staleTime: Infinity });
  const lessons = useQuery({ queryKey: ['tenses'], queryFn: api.tenses, staleTime: 60_000 });
  const writings = useQuery({ queryKey: ['tense-writings'], queryFn: api.tenseWritings });

  const lessonFilter = params.get('lesson');
  const list = prompts.data ?? [];
  const promptId = params.get('prompt') ?? list.find((p) => !lessonFilter || p.lesson === lessonFilter)?.id ?? list[0]?.id;
  const prompt = list.find((p) => p.id === promptId);

  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<TenseAnalysis | null>(null);
  const [result, setResult] = useState<TenseWritingResult | null>(null);
  const [showModel, setShowModel] = useState(false);

  // Bản nháp theo đề (chỉ lưu trong trình duyệt này)
  useEffect(() => {
    if (!promptId) return;
    let draft = '';
    try {
      draft = localStorage.getItem(draftKey(promptId)) ?? '';
    } catch {
      draft = '';
    }
    setText(draft);
    setAnalysis(null);
    setResult(null);
    setShowModel(false);
  }, [promptId]);
  useEffect(() => {
    if (!promptId) return;
    const t = window.setTimeout(() => {
      try {
        if (text.trim()) localStorage.setItem(draftKey(promptId), text);
        else localStorage.removeItem(draftKey(promptId));
      } catch {
        /* chế độ ẩn danh */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [text, promptId]);

  const check = useMutation({ mutationFn: () => api.tenseAnalyze(text), onSuccess: setAnalysis, onError: (e) => toast.error((e as Error).message) });
  const submit = useMutation({
    mutationFn: () => api.submitTenseWriting({ promptId: promptId!, text }),
    onSuccess: (r) => {
      setResult(r);
      setAnalysis(r.analysis);
      setShowModel(true);
      qc.invalidateQueries({ queryKey: ['tense-writings'] });
      qc.invalidateQueries({ queryKey: ['tenses'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      if (r.xp) toast.success(`Đã nộp bài · +${r.xp} XP`);
      try {
        localStorage.removeItem(draftKey(promptId!));
      } catch {
        /* bỏ qua */
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const groups = useMemo(() => {
    const byLesson = new Map<string, TensePrompt[]>();
    for (const p of list) byLesson.set(p.lesson, [...(byLesson.get(p.lesson) ?? []), p]);
    const order = [...(lessons.data?.lessons.map((l) => l.id) ?? []), 'mixed'];
    return order.filter((k) => byLesson.has(k)).map((k) => ({ key: k, title: k === 'mixed' ? 'Tổng hợp (dạng IELTS)' : `${lessons.data?.lessons.find((l) => l.id === k)?.order}. ${lessons.data?.lessons.find((l) => l.id === k)?.title ?? k}`, items: byLesson.get(k)! }));
  }, [list, lessons.data]);

  if (prompts.error) return <ErrorBox error={prompts.error} onRetry={() => prompts.refetch()} />;
  if (!prompts.data)
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );

  const n = countSentences(text);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/tenses" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Thì
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-ink">Viết đoạn & soát thì</h1>
          <p className="text-sm text-muted">Viết theo đề, bấm “Soát thì” bao nhiêu lần cũng được; nộp bài để lưu và xem bài mẫu.</p>
        </div>
        <Select value={promptId} onChange={(e) => setParams({ prompt: e.target.value })} aria-label="Chọn đề" className="h-10 w-full sm:w-80">
          {groups.map((g) => (
            <optgroup key={g.key} label={g.title}>
              {g.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {prompt && (
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-extrabold text-ink">{prompt.title}</h2>
            {prompt.ielts && (
              <span className="rounded-full bg-brand-500/12 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:text-brand-300">
                IELTS {prompt.ielts === 'speaking' ? 'Speaking' : prompt.ielts === 'task1' ? 'Task 1' : 'Task 2'}
              </span>
            )}
          </div>
          <p className="text-[15px] text-ink">{prompt.prompt}</p>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-muted">
            {prompt.guide.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted">Nên dùng:</span>
            {prompt.targets.map((f) => {
              const t = result?.targets.find((x) => x.form === f);
              return (
                <span
                  key={f}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    t ? (t.used ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200') : 'bg-surface-2 text-ink',
                  )}
                >
                  {t ? t.used ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} /> : <span className="h-2 w-2 rounded-full" style={{ background: tenseColor(f) }} />}
                  {FORM_META[f].label}
                </span>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          rows={9}
          placeholder="Viết bằng tiếng Anh ở đây… (mỗi câu kết thúc bằng dấu chấm)"
          aria-label="Bài viết"
          spellCheck={false}
          className="text-[15px] leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('text-xs font-semibold', prompt && n >= prompt.minSentences ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted')}>
            {n} câu · {words} từ {prompt && `· cần ít nhất ${prompt.minSentences} câu`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" icon={<SpellCheck className="h-4 w-4" />} onClick={() => check.mutate()} loading={check.isPending} disabled={!text.trim()}>
              Soát thì
            </Button>
            <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={() => submit.mutate()} loading={submit.isPending} disabled={text.trim().length < 10 || !promptId}>
              Nộp bài
            </Button>
          </div>
        </div>
      </Card>

      {analysis && (
        <Card className="space-y-3 p-5">
          <h2 className="font-extrabold text-ink">Kết quả soát thì</h2>
          {result && !result.enough && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Bài mới có {result.sentenceCount} câu — viết đủ {result.minSentences} câu để được tính XP.</p>}
          <TenseReport analysis={analysis} />
        </Card>
      )}

      {prompt && (
        <Card className="space-y-2 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-extrabold text-ink">Bài mẫu</h2>
            {!showModel && (
              <Button size="sm" variant="ghost" icon={<Eye className="h-4 w-4" />} onClick={() => setShowModel(true)}>
                Xem (nên viết xong rồi mới xem)
              </Button>
            )}
          </div>
          {showModel ? <p className="leading-relaxed text-ink">{prompt.model}</p> : <p className="text-sm text-muted">Bài mẫu hiện sau khi bạn nộp bài.</p>}
        </Card>
      )}

      {!!writings.data?.length && (
        <Card className="space-y-2 p-5">
          <h2 className="font-extrabold text-ink">Bài đã nộp gần đây</h2>
          <ul className="divide-y divide-line">
            {writings.data.map((w) => (
              <li key={w.id} className="py-2">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <b className="text-ink">{w.title}</b>
                  <span className="text-xs text-muted">
                    {relativeTime(w.createdAt)} · {w.issueCount ? `${w.issueCount} chỗ cần xem` : 'không lỗi thì'}
                  </span>
                </p>
                <p className="line-clamp-2 text-sm text-muted">{w.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
