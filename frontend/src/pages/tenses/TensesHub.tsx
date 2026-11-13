import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Mic, Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FORM_META, seconds, tenseColor } from '../../components/tenses/meta';
import { LinkButton } from '../../components/ui/Button';
import { Emoji3D } from '../../components/ui/Emoji3D';
import { HeroArt } from '../../components/ui/HeroArt';
import { Card, ErrorBox, Progress, Segmented, Select, Skeleton } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { api } from '../../lib/api';
import { getRecognitionCtor } from '../../lib/speech';
import type { TenseLessonId, TensePracticeMode, TenseStats } from '../../lib/types';
import { cn } from '../../lib/utils';

/** Ba chỉ số của một bài / một thì: hiểu (% nhận ra đúng), dùng (% tự nói / gõ đúng), phản xạ (thời gian trả lời) */
export function StatTriple({ stats, compact }: { stats: TenseStats; compact?: boolean }) {
  const reflex = stats.speakMs ?? stats.typeMs;
  const items = [
    { label: 'Hiểu', value: stats.understand, text: stats.understand == null ? '—' : `${stats.understand}%` },
    { label: 'Dùng', value: stats.use, text: stats.use == null ? '—' : `${stats.use}%` },
  ];
  return (
    <div className={cn('grid grid-cols-3 gap-2', compact ? 'text-[11px]' : 'text-xs')}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <p className="flex justify-between font-semibold text-muted">
            <span>{it.label}</span>
            <span className="text-ink">{it.text}</span>
          </p>
          <Progress value={(it.value ?? 0) / 100} className="mt-1 h-1.5" />
        </div>
      ))}
      <div className="min-w-0">
        <p className="flex justify-between font-semibold text-muted">
          <span>Phản xạ</span>
          <span className="text-ink">{seconds(reflex)}</span>
        </p>
        {/* Phản xạ tốt: ≤ 3 s → thanh đầy; ≥ 8 s → rỗng */}
        <Progress value={reflex == null ? 0 : Math.max(0, Math.min(1, (8000 - reflex) / 5000))} className="mt-1 h-1.5" barClassName="bg-orange-500" />
      </div>
    </div>
  );
}

const MODES: { key: TensePracticeMode | 'write' | 'story'; title: string; desc: string; emoji: string; tone: string }[] = [
  { key: 'mixed', title: 'Trộn thì', desc: 'Xen kẽ mọi thì: nhận ra nghĩa, tự nói / gõ, sửa câu sai — giống lúc nói thật', emoji: '🎯', tone: 'from-brand-100 to-brand-200 dark:from-brand-500/25 dark:to-brand-500/10' },
  { key: 'recognize', title: 'Nhận ra', desc: 'Câu không có từ chỉ thời gian — nhìn / nghe động từ để đoán nghĩa', emoji: '🎧', tone: 'from-sky-100 to-sky-200 dark:from-sky-500/25 dark:to-sky-500/10' },
  { key: 'speak', title: 'Nói phản xạ', desc: 'Nhìn gợi ý tiếng Việt, nói câu tiếng Anh trong 6 → 4 → 3 giây', emoji: '🎤', tone: 'from-rose-100 to-rose-200 dark:from-rose-500/25 dark:to-rose-500/10' },
  { key: 'type', title: 'Gõ phản xạ', desc: 'Gõ câu tiếng Anh thật nhanh — app chấm động từ có đúng thì', emoji: '⌨️', tone: 'from-emerald-100 to-emerald-200 dark:from-emerald-500/25 dark:to-emerald-500/10' },
  { key: 'fix', title: 'Sửa câu sai', desc: 'Câu mắc lỗi thì người Việt hay gặp — tìm và sửa lại', emoji: '🔍', tone: 'from-amber-100 to-amber-200 dark:from-amber-500/25 dark:to-amber-500/10' },
  { key: 'write', title: 'Viết đoạn', desc: 'Viết 5–8 câu theo đề (có đề IELTS), app soát thì từng câu', emoji: '📝', tone: 'from-indigo-100 to-indigo-200 dark:from-indigo-500/25 dark:to-indigo-500/10' },
  { key: 'story', title: 'Kể chuyện 4/3/2', desc: 'Nói 2 → 1,5 → 1 phút với đề buộc dùng thì của bài, rồi soát thì', emoji: '⏱️', tone: 'from-orange-100 to-orange-200 dark:from-orange-500/25 dark:to-orange-500/10' },
];

export default function TensesHub() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['tenses'], queryFn: api.tenses });
  const [lesson, setLesson] = useState<TenseLessonId | ''>('');
  const [count, setCount] = useState(10);
  const canSpeak = Boolean(getRecognitionCtor());
  const story = useMutation({
    mutationFn: (id: TenseLessonId) => api.tenseStory(id),
    onSuccess: (s) => navigate(`/fluency/${s.id}`),
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  const data = q.data;

  const start = (key: (typeof MODES)[number]['key']) => {
    if (key === 'write') return navigate(`/tenses/write${lesson ? `?lesson=${lesson}` : ''}`);
    if (key === 'story') return story.mutate(lesson || 'past-simple');
    const qs = new URLSearchParams({ mode: key, count: String(count) });
    if (lesson) qs.set('lesson', lesson);
    navigate(`/tenses/practice?${qs}`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-hero [--hero-glow:var(--color-sky-400)] p-6 text-white shadow-glow sm:p-8">
        <HeroArt items={['⏳', '🎤', '📝']} />
        <h1 className="relative pr-14 text-2xl font-black sm:text-3xl xl:pr-0">Thì — hiểu nghĩa, nói phản xạ</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/90">
          Học 6 ý nghĩa thay vì 12 công thức: hiểu bằng trục thời gian → nhận ra trong câu thật → nói và viết thật nhanh.
        </p>
        {data && (
          <div className="relative mt-4 flex flex-wrap items-center gap-3">
            <div className="min-w-48 flex-1 rounded-2xl bg-white/15 p-3 sm:max-w-xs">
              <p className="flex justify-between text-xs font-bold uppercase tracking-wider text-white/80">
                <span>Trộn thì hôm nay</span>
                <span>
                  {Math.min(data.today.done, data.today.target)}/{data.today.target} câu
                </span>
              </p>
              <Progress value={Math.min(1, data.today.done / Math.max(1, data.today.target))} className="mt-2 h-2 bg-white/25" barClassName="bg-white" />
            </div>
            <LinkButton to={`/tenses/practice?mode=mixed&count=${data.today.target}`} variant="secondary" size="lg" icon={<Play className="h-4 w-4 fill-current" />}>
              {data.today.done >= data.today.target ? 'Luyện thêm' : 'Bắt đầu'}
            </LinkButton>
          </div>
        )}
      </section>

      {/* 1. Hiểu theo ý nghĩa */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">
            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm text-white">1</span>
            Hiểu theo ý nghĩa
          </h2>
          <p className="text-sm text-muted">
            Mỗi bài một ý: <Term k="timeline">trục thời gian</Term>, <Term k="ccq">câu hỏi kiểm tra</Term>, cặp câu dễ nhầm và bẫy hay gặp của người Việt. Học theo thứ tự từ trên xuống.
          </p>
        </div>
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!data &&
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          {data?.lessons.map((l) => (
            <Link key={l.id} to={`/tenses/${l.id}`} className="card card-hover group flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Emoji3D emoji={l.emoji} size={34} />
                  <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 font-display text-[11px] font-black text-white">{l.order}</span>
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[17px] font-extrabold text-ink">{l.title}</span>
                  <span className="line-clamp-3 text-sm text-muted">{l.summary || l.idea}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {l.forms.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: tenseColor(f) }} />
                    {FORM_META[f].label}
                  </span>
                ))}
              </div>
              <div className="mt-auto">
                <StatTriple stats={l.stats} compact />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 2. Luyện phản xạ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-ink">
              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm text-white">2</span>
              Luyện <Term k="reflex">phản xạ</Term>
            </h2>
            <p className="text-sm text-muted">
              Học riêng từng thì xong thì <Term k="interleaving">trộn các thì</Term> — lúc nói thật bạn phải tự chọn thì, không ai báo trước.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={lesson} onChange={(e) => setLesson(e.target.value as TenseLessonId | '')} aria-label="Luyện thì nào" className="h-9 w-auto min-w-44">
              <option value="">Mọi thì</option>
              {data?.lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.order}. {l.title}
                </option>
              ))}
            </Select>
            <Segmented
              value={count}
              onChange={setCount}
              ariaLabel="Số câu"
              options={[
                { value: 10, label: '10 câu' },
                { value: 20, label: '20 câu' },
              ]}
            />
          </div>
        </div>
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => {
            const off = m.key === 'speak' && !canSpeak;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => start(m.key)}
                disabled={off || (m.key === 'story' && story.isPending)}
                title={off ? 'Cần Chrome hoặc Edge để nhận dạng giọng nói' : m.title}
                className="card card-hover group relative flex items-start gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110', m.tone)}>
                  <Emoji3D emoji={m.emoji} size={34} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-[17px] font-extrabold text-ink">{m.title}</span>
                    {m.key === 'mixed' && <span className="rounded-full bg-brand-500/12 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:text-brand-300">Gợi ý</span>}
                  </span>
                  <span className="block text-sm text-muted">{m.desc}</span>
                  {off && <span className="mt-1 block text-xs font-semibold text-rose-600 dark:text-rose-400">Cần Chrome hoặc Edge (nhận dạng giọng nói)</span>}
                  {m.key === 'story' && (
                    <span className="mt-1 block text-xs font-semibold text-muted/80">{lesson ? `Đề cho bài: ${data?.lessons.find((l) => l.id === lesson)?.title}` : 'Chọn bài ở trên (mặc định: Quá khứ đơn)'}</span>
                  )}
                </span>
                <Play className="mt-1 h-4 w-4 shrink-0 fill-current text-brand-500 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. Kính thì trên video */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Emoji3D emoji="🔎" size={56} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-ink">
            Thấy thì trong video thật: <Term k="tense_lens">Kính thì</Term>
          </h2>
          <p className="text-sm text-muted">
            Khi xem video, bật nút <b className="text-ink">“Thì”</b> (phím G): động từ trong phụ đề được tô màu theo thì. Bấm vào một động từ để xem vì sao người nói dùng thì đó và lưu câu làm mẫu — câu lưu sẽ hiện trong bài học tương ứng.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(['present-simple', 'present-continuous', 'past-simple', 'past-continuous', 'present-perfect', 'past-perfect', 'future-will', 'future-going-to'] as const).map((f) => (
              <span key={f} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink">
                <span className="h-2 w-2 rounded-full" style={{ background: tenseColor(f) }} />
                {FORM_META[f].label}
              </span>
            ))}
          </div>
        </div>
        <LinkButton to="/explore" variant="outline" icon={<ArrowRight className="h-4 w-4" />} className="shrink-0">
          Chọn video
        </LinkButton>
      </Card>

      {/* Tiến bộ theo từng thì */}
      {data && (
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-extrabold text-ink">Tiến bộ theo từng thì</h2>
            <p className="text-xs text-muted">
              {data.totals.attempts} lượt luyện · {data.totals.writings} bài viết · kho {data.totals.items} câu luyện, {data.totals.prompts} đề viết
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-130 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-3 font-semibold">Thì</th>
                  <th className="py-1 pr-3 font-semibold">Hiểu</th>
                  <th className="py-1 pr-3 font-semibold">Dùng</th>
                  <th className="py-1 pr-3 font-semibold">
                    <Term k="reflex">Phản xạ</Term> nói
                  </th>
                  <th className="py-1 pr-3 font-semibold">Gõ xong</th>
                  <th className="py-1 font-semibold">Lượt</th>
                </tr>
              </thead>
              <tbody>
                {data.forms.map((f) => (
                  <tr key={f.form} className="border-t border-line">
                    <td className="py-2 pr-3 font-semibold text-ink">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: tenseColor(f.form) }} />
                      {f.label}
                    </td>
                    <td className="py-2 pr-3 text-ink">{f.understand == null ? '—' : `${f.understand}%`}</td>
                    <td className="py-2 pr-3 text-ink">{f.use == null ? '—' : `${f.use}%`}</td>
                    <td className="py-2 pr-3 text-ink">{seconds(f.speakMs)}</td>
                    <td className="py-2 pr-3 text-ink">{seconds(f.typeMs)}</td>
                    <td className="py-2 text-muted">{f.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            <b>Hiểu</b>: % câu nhận ra đúng · <b>Dùng</b>: % câu tự nói / gõ đúng ngay lần đầu · <b>Phản xạ nói</b>: thời gian từ lúc thấy đề tới khi bắt đầu nói (càng nhỏ càng tốt, mục tiêu ≤ 3 s) · <b>Gõ xong</b>: thời gian gõ xong một câu đúng.
          </p>
          {!canSpeak && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Mic className="h-3.5 w-3.5" /> Trình duyệt này chưa nhận dạng được giọng nói — luyện nói cần Chrome hoặc Edge.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
