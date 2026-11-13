import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Eye, PenLine, Play, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { FORM_META, tenseColor } from '../../components/tenses/meta';
import { Timeline } from '../../components/tenses/Timeline';
import { Button, LinkButton } from '../../components/ui/Button';
import { Emoji3D } from '../../components/ui/Emoji3D';
import { Card, EmptyState, ErrorBox, Skeleton } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { AudioButton } from '../../components/word/bits';
import { api } from '../../lib/api';
import { getRecognitionCtor } from '../../lib/speech';
import type { TenseForm, TenseLesson, TenseLessonId } from '../../lib/types';
import { cn, formatTime } from '../../lib/utils';
import { StatTriple } from './TensesHub';

function FormChip({ form }: { form: TenseForm }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink">
      <span className="h-2 w-2 rounded-full" style={{ background: tenseColor(form) }} />
      {FORM_META[form].label}
    </span>
  );
}

function Section({ title, desc, children, className }: { title: React.ReactNode; desc?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h2 className="text-lg font-extrabold text-ink">{title}</h2>
        {desc && <p className="text-sm text-muted">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/** Câu hỏi kiểm tra khái niệm: trả lời Có / Không rồi xem giải thích */
function CcqCard({ ccq }: { ccq: TenseLesson['ccq'][number] }) {
  const [pick, setPick] = useState<boolean | null>(null);
  const done = pick !== null;
  const right = pick === ccq.answer;
  return (
    <Card className="space-y-2 p-4">
      <p className="flex items-start gap-1 font-semibold text-ink">
        <span className="flex-1">“{ccq.sentence}”</span>
        <AudioButton term={ccq.sentence} size="sm" />
      </p>
      <p className="text-sm text-ink">{ccq.question}</p>
      <div className="flex gap-2">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            disabled={done}
            onClick={() => setPick(v)}
            className={cn(
              'h-9 flex-1 rounded-xl border-2 font-display text-sm font-bold transition',
              !done && 'border-line bg-surface hover:border-brand-300',
              done && v === ccq.answer && 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
              done && v === pick && v !== ccq.answer && 'border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
              done && v !== ccq.answer && v !== pick && 'border-line opacity-50',
            )}
          >
            {v ? 'Có' : 'Không'}
          </button>
        ))}
      </div>
      {done && (
        <p className={cn('rounded-xl p-2.5 text-sm', right ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100' : 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100')}>
          <b>{right ? 'Đúng rồi. ' : 'Chưa đúng. '}</b>
          {ccq.explain}
        </p>
      )}
    </Card>
  );
}

function ContrastCard({ c }: { c: TenseLesson['contrasts'][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-3 p-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          { side: c.a, ans: c.answerA, k: 'A' },
          { side: c.b, ans: c.answerB, k: 'B' },
        ].map(({ side, ans, k }) => (
          <div key={k} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <FormChip form={side.form} />
              <AudioButton term={side.en} size="sm" />
            </div>
            <p className="mt-1.5 font-semibold text-ink">{side.en}</p>
            {open && (
              <>
                <p className="text-sm text-muted">{side.vi}</p>
                <p className="mt-1.5 rounded-lg bg-surface-2 px-2 py-1 text-sm text-ink">
                  <b>{k}:</b> {ans}
                </p>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm font-semibold text-ink">❓ {c.question}</p>
      {open ? (
        <p className="rounded-xl bg-brand-50 p-2.5 text-sm text-brand-900 dark:bg-brand-500/10 dark:text-brand-100">{c.explain}</p>
      ) : (
        <Button size="sm" variant="soft" icon={<Eye className="h-4 w-4" />} onClick={() => setOpen(true)}>
          Tự trả lời trước, rồi bấm xem đáp án
        </Button>
      )}
    </Card>
  );
}

export default function LessonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['tense-lesson', id], queryFn: () => api.tenseLesson(id as TenseLessonId), enabled: Boolean(id) });
  const story = useMutation({
    mutationFn: () => api.tenseStory(id as TenseLessonId),
    onSuccess: (s) => navigate(`/fluency/${s.id}`),
    onError: (e) => toast.error((e as Error).message),
  });
  const canSpeak = Boolean(getRecognitionCtor());

  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  const { lesson, stats, videoExamples, prompts, counts } = q.data;
  const practice = (mode: string) => `/tenses/practice?mode=${mode}&lesson=${lesson.id}&count=10`;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-4">
        <Link to="/tenses" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Thì
        </Link>
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-surface-2">
            <Emoji3D emoji={lesson.emoji} size={46} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">Bài {lesson.order} / 6</p>
            <h1 className="text-2xl font-black text-ink sm:text-3xl">{lesson.title}</h1>
            <p className="text-[15px] font-semibold text-ink">💡 {lesson.idea}</p>
            <div className="flex flex-wrap gap-1.5">
              {lesson.forms.map((f) => (
                <FormChip key={f} form={f} />
              ))}
            </div>
            <div className="max-w-md pt-1">
              <StatTriple stats={stats} />
            </div>
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={practice('mixed')} variant="primary" icon={<Play className="h-4 w-4 fill-current" />}>
            Luyện bài này
          </LinkButton>
          <LinkButton to={practice('recognize')} variant="outline">
            🎧 Nhận ra ({counts.meaning + counts.ccq + counts.listen})
          </LinkButton>
          <LinkButton to={practice('speak')} variant="outline" disabled={!canSpeak}>
            🎤 Nói phản xạ
          </LinkButton>
          <LinkButton to={practice('type')} variant="outline">
            ⌨️ Gõ phản xạ
          </LinkButton>
          <LinkButton to={practice('fix')} variant="outline">
            🔍 Sửa câu sai
          </LinkButton>
        </div>
      </div>

      <Section title="Ý nghĩa & cách dùng" desc={<>Nhìn <Term k="timeline">trục thời gian</Term> trước, đọc giải thích sau. Bấm 🔊 để nghe ví dụ.</>}>
        <div className="space-y-4">
          {lesson.uses.map((u, i) => (
            <Card key={i} className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 font-display text-xs font-black text-white">{i + 1}</span>
                  <h3 className="font-display text-[17px] font-extrabold text-ink">{u.title}</h3>
                  <FormChip form={u.form} />
                </div>
                <p className="text-sm text-ink">{u.explain}</p>
                <ul className="space-y-1.5">
                  {u.examples.map((ex) => (
                    <li key={ex.en} className="rounded-xl bg-surface-2 px-3 py-2">
                      <p className="flex items-start gap-1 font-semibold text-ink">
                        <span className="flex-1">{ex.en}</span>
                        <AudioButton term={ex.en} size="sm" />
                      </p>
                      <p className="text-sm text-muted">{ex.vi}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <Timeline spec={u.timeline} className="self-start" />
            </Card>
          ))}
        </div>
      </Section>

      {lesson.ccq.length > 0 && (
        <Section title={<>Kiểm tra hiểu (<Term k="ccq">câu hỏi kiểm tra</Term>)</>} desc="Không hỏi “bạn hiểu chưa?” — trả lời câu hỏi về ý nghĩa để tự kiểm tra.">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {lesson.ccq.map((c) => (
              <CcqCard key={c.sentence + c.question} ccq={c} />
            ))}
          </div>
        </Section>
      )}

      {lesson.contrasts.length > 0 && (
        <Section title="Cặp câu dễ nhầm" desc="Hai câu chỉ khác dạng động từ — nhưng nghĩa khác hẳn.">
          <div className="space-y-3">
            {lesson.contrasts.map((c, i) => (
              <ContrastCard key={i} c={c} />
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {lesson.vietnamese.length > 0 && (
          <Section title="So với tiếng Việt" desc="Tiếng Việt dùng từ (đã, đang, sẽ…) và hay bỏ khi đã rõ; tiếng Anh bắt buộc đổi động từ.">
            <Card className="divide-y divide-line">
              {lesson.vietnamese.map((v) => (
                <div key={v.marker} className="space-y-0.5 p-3">
                  <p className="text-sm">
                    <b className="text-ink">{v.marker}</b> <span className="text-muted">→</span> <b className="text-brand-700 dark:text-brand-300">{v.english}</b>
                  </p>
                  <p className="text-sm text-muted">{v.note}</p>
                </div>
              ))}
            </Card>
          </Section>
        )}
        {lesson.traps.length > 0 && (
          <Section title="Bẫy hay gặp của người Việt">
            <Card className="divide-y divide-line">
              {lesson.traps.map((t) => (
                <div key={t.wrong} className="space-y-1 p-3">
                  <p className="flex items-start gap-1.5 text-sm text-rose-700 line-through decoration-rose-400/70 dark:text-rose-300">
                    <X className="mt-0.5 h-4 w-4 shrink-0 no-underline" /> {t.wrong}
                  </p>
                  <p className="flex items-start gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" /> {t.right}
                  </p>
                  <p className="text-sm text-muted">{t.why}</p>
                </div>
              ))}
            </Card>
          </Section>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {lesson.chunks.length > 0 && (
          <Section title="Cụm nói nhanh" desc="Thuộc nguyên cụm để nói không phải nghĩ — bấm 🔊 rồi nói theo.">
            <Card className="divide-y divide-line">
              {lesson.chunks.map((c) => (
                <div key={c.en} className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{c.en}</p>
                    <p className="text-sm text-muted">{c.vi}</p>
                  </div>
                  <AudioButton term={c.en} />
                </div>
              ))}
            </Card>
          </Section>
        )}
        <div className="space-y-6">
          {lesson.signals.words.length > 0 && (
            <Section title="Từ hay đi kèm" desc={lesson.signals.note}>
              <div className="flex flex-wrap gap-1.5">
                {lesson.signals.words.map((w) => (
                  <span key={w} className="rounded-full bg-surface-2 px-2.5 py-1 text-sm font-semibold text-ink">
                    {w}
                  </span>
                ))}
              </div>
            </Section>
          )}
          {lesson.pronunciation && (
            <Section title={`Phát âm: ${lesson.pronunciation.title}`}>
              <Card className="divide-y divide-line">
                {lesson.pronunciation.items.map((p) => (
                  <div key={p.text} className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">{p.text}</p>
                      <p className="text-sm text-muted">{p.note}</p>
                    </div>
                    <AudioButton term={p.text.replace(/\/[^/]*\//g, '').replace(/[()→]/g, ' ')} size="sm" />
                  </div>
                ))}
              </Card>
            </Section>
          )}
        </div>
      </div>

      {lesson.shapes.length > 0 && (
        <details className="card group p-4">
          <summary className="cursor-pointer font-display font-extrabold text-ink">Hình dạng câu (để tra cứu — không cần học thuộc)</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-120 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-3 font-semibold">Thì</th>
                  <th className="py-1 pr-3 font-semibold">Khẳng định</th>
                  <th className="py-1 pr-3 font-semibold">Phủ định</th>
                  <th className="py-1 font-semibold">Câu hỏi</th>
                </tr>
              </thead>
              <tbody>
                {lesson.shapes.map((s) => (
                  <tr key={s.form} className="border-t border-line align-top">
                    <td className="py-2 pr-3">
                      <FormChip form={s.form} />
                    </td>
                    <td className="py-2 pr-3 text-ink">{s.affirmative}</td>
                    <td className="py-2 pr-3 text-ink">{s.negative}</td>
                    <td className="py-2 text-ink">{s.question}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <Section
        title="Câu thật từ video của bạn"
        desc={
          <>
            Bật <Term k="tense_lens">Kính thì</Term> khi xem video, bấm vào động từ có màu của bài này rồi lưu câu — câu sẽ hiện ở đây và vào hàng ôn tập.
          </>
        }
      >
        {videoExamples.length ? (
          <Card className="divide-y divide-line">
            {videoExamples.map((ex) => (
              <Link key={ex.id} to={`/watch/${ex.videoId}?t=${Math.floor(ex.start ?? 0)}`} className="flex items-start gap-3 p-3 hover:bg-surface-2">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tenseColor(ex.tense) }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-ink">{ex.sentence}</span>
                  <span className="block truncate text-xs text-muted">
                    {ex.videoTitle ?? 'Video'} · {formatTime(ex.start ?? 0)}
                  </span>
                </span>
              </Link>
            ))}
          </Card>
        ) : (
          <EmptyState icon="🔎" title="Chưa có câu nào" description="Mở một video, bật nút “Thì” (phím G) và lưu câu có động từ thuộc bài này." action={<LinkButton to="/explore" variant="outline">Chọn video</LinkButton>} />
        )}
      </Section>

      <Section title="Viết & kể chuyện với thì này">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {prompts.map((p) => (
            <Link key={p.id} to={`/tenses/write?prompt=${p.id}`} className="card card-hover flex items-start gap-3 p-4">
              <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
              <span className="min-w-0">
                <span className="block font-display font-extrabold text-ink">{p.title}</span>
                <span className="line-clamp-2 block text-sm text-muted">{p.prompt}</span>
              </span>
            </Link>
          ))}
          <button type="button" onClick={() => story.mutate()} disabled={story.isPending} className="card card-hover flex items-start gap-3 p-4 text-left disabled:opacity-60">
            <Emoji3D emoji="⏱️" size={26} className="shrink-0" />
            <span className="min-w-0">
              <span className="block font-display font-extrabold text-ink">Kể chuyện 4/3/2</span>
              <span className="block text-sm text-muted">Nói cùng một đề 3 lượt: 2 → 1,5 → 1 phút, dùng thì của bài; sau mỗi lượt bấm “Soát thì”.</span>
            </span>
          </button>
        </div>
      </Section>
    </div>
  );
}
