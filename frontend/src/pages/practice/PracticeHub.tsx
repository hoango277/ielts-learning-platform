import { useQuery } from '@tanstack/react-query';
import { Check, Play } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Card, Segmented, Select } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { api } from '../../lib/api';
import type { PracticeMode, PracticeSource } from '../../lib/types';
import { cn } from '../../lib/utils';

export const MODES: { key: PracticeMode; title: string; desc: string; emoji: string; tone: string }[] = [
  { key: 'mixed', title: 'Tổng hợp', desc: 'Trộn mọi dạng bài — hiệu quả nhất', emoji: '🎯', tone: 'from-violet-500 to-fuchsia-500' },
  { key: 'quiz', title: 'Trắc nghiệm', desc: 'Chọn nghĩa đúng / từ đúng / theo định nghĩa', emoji: '🧩', tone: 'from-sky-500 to-indigo-500' },
  { key: 'cloze', title: 'Điền từ vào chỗ trống', desc: 'Điền từ còn thiếu trong câu ví dụ thật', emoji: '✍️', tone: 'from-emerald-500 to-teal-400' },
  { key: 'listening', title: 'Nghe & gõ', desc: 'Nghe phát âm rồi gõ lại từ', emoji: '🎧', tone: 'from-rose-500 to-orange-400' },
  { key: 'spelling', title: 'Chính tả từ', desc: 'Nhìn nghĩa tiếng Việt, gõ từ tiếng Anh', emoji: '🔤', tone: 'from-amber-500 to-yellow-400' },
  { key: 'match', title: 'Ghép cặp', desc: 'Ghép từ với nghĩa nhanh nhất có thể', emoji: '🃏', tone: 'from-pink-500 to-rose-400' },
  // Dùng từ tự nhiên: collocation, dạng từ, đồng nghĩa, nâng cấp từ cơ bản
  { key: 'collocation', title: 'Từ hay đi cùng', desc: 'Collocation — chọn từ đi kèm tự nhiên: make / do / take…', emoji: '🔗', tone: 'from-teal-500 to-cyan-400' },
  { key: 'wordform', title: 'Điền dạng từ', desc: 'Cùng một gốc từ: decide → decision → decisive, điền đúng dạng', emoji: '🧬', tone: 'from-indigo-500 to-violet-400' },
  { key: 'synonym', title: 'Ghép đồng nghĩa', desc: 'Ghép từ với từ đồng nghĩa phổ biến nhất', emoji: '🔁', tone: 'from-fuchsia-500 to-pink-400' },
  { key: 'upgrade', title: 'Nâng cấp từ', desc: 'Thay good / big / very… bằng từ hay hơn', emoji: '🚀', tone: 'from-orange-500 to-amber-400' },
];

const USAGE_MODES: PracticeMode[] = ['collocation', 'wordform', 'synonym', 'upgrade'];
/** Dạng bài dùng dữ liệu soạn sẵn — không cần chọn nguồn từ */
const CURATED: PracticeMode[] = ['collocation', 'upgrade'];

const SOURCES: { value: PracticeSource; label: string }[] = [
  { value: 'all', label: 'Từ đang học' },
  { value: 'due', label: 'Đến hạn ôn' },
  { value: 'weak', label: 'Hay sai' },
  { value: 'new', label: 'Mới thêm' },
  { value: 'recent', label: 'Gần đây' },
  { value: 'starred', label: '⭐ Có sao' },
  { value: 'topic', label: 'Theo chủ đề' },
];

export default function PracticeHub() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<PracticeMode>((params.get('mode') as PracticeMode) ?? 'mixed');
  const [source, setSource] = useState<PracticeSource>((params.get('source') as PracticeSource) ?? 'all');
  const [count, setCount] = useState(10);
  const [topicId, setTopicId] = useState<number | ''>(Number(params.get('topicId')) || '');
  const topics = useQuery({ queryKey: ['topics'], queryFn: api.topics, staleTime: 5 * 60_000 });
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  const words = overview.data?.totals.words ?? 0;

  const start = () => {
    const qs = new URLSearchParams({ mode, source, count: String(count) });
    if (source === 'topic' && topicId) qs.set('topicId', String(topicId));
    navigate(`/practice/play?${qs}`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-amber-400 via-orange-500 to-rose-500 p-6 text-white shadow-[0_14px_34px_-12px_rgb(249_115_22/0.6)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 animate-float-slow rounded-full bg-white/20 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 animate-float-slow rounded-full bg-yellow-200/30 blur-2xl [animation-delay:-4s]" />
        <h1 className="relative text-2xl font-black sm:text-3xl">Luyện tập 🎮</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/90">
          Ôn từ chủ động bằng nhiều dạng bài. Trả lời đúng một từ đang đến hạn sẽ được tính luôn như một lượt ôn tập.
        </p>
        {words < 4 && (
          <p className="relative mt-3 inline-block rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold">
            Sổ từ đang có {words} từ — hãy chọn “Theo chủ đề” để luyện ngay với bộ từ IELTS có sẵn.
          </p>
        )}
      </section>

      {(
        [
          { title: 'Ôn từ vựng', desc: 'Nhớ nghĩa, chính tả và phát âm của từ trong sổ', modes: MODES.filter((m) => !USAGE_MODES.includes(m.key)) },
          {
            title: 'Dùng từ tự nhiên',
            desc: (
              <>
                <Term k="collocation">Cụm từ hay đi cùng</Term>, <Term k="word_family">họ từ</Term>, <Term k="synonym">từ đồng nghĩa</Term> và{' '}
                <Term k="upgrade">nâng cấp từ</Term> — để nói và viết tự nhiên như người bản xứ
              </>
            ),
            modes: MODES.filter((m) => USAGE_MODES.includes(m.key)),
          },
        ] as { title: string; desc: ReactNode; modes: typeof MODES }[]
      ).map((group) => (
      <section key={group.title} className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-ink">{group.title}</h2>
            <p className="text-sm text-muted">{group.desc}</p>
          </div>
          {group.modes.some((m) => m.key === 'upgrade') && (
            <Link to="/practice/upgrades" className="text-sm font-semibold text-violet-600 hover:underline dark:text-violet-300">
              Sổ tay nâng cấp từ →
            </Link>
          )}
        </div>
      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {group.modes.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            aria-pressed={mode === m.key}
            className={cn(
              'card card-hover group relative flex items-start gap-3 p-4 text-left',
              mode === m.key && 'border-violet-400 bg-violet-50/60 ring-2 ring-violet-500 dark:border-violet-400/60 dark:bg-violet-500/10',
            )}
          >
            <span
              className={cn(
                'icon-tile flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br text-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110',
                m.tone,
              )}
            >
              {m.emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[17px] font-extrabold text-ink">{m.title}</span>
              <span className="block text-sm text-muted">{m.desc}</span>
            </span>
            {mode === m.key && (
              <span className="absolute right-3 top-3 flex h-6 w-6 animate-pop items-center justify-center rounded-full bg-violet-500 text-white shadow-soft">
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            )}
          </button>
        ))}
      </div>
      </section>
      ))}

      <Card className="space-y-5 p-5">
        {CURATED.includes(mode) ? (
          <p className="text-sm text-muted">Dạng bài này dùng bộ câu soạn sẵn, ưu tiên những cụm có từ nằm trong sổ của bạn.</p>
        ) : (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Luyện những từ nào?</p>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSource(s.value)}
                className={cn(
                  'h-9 rounded-xl px-3.5 font-display text-sm font-bold transition active:scale-95',
                  source === s.value ? 'bg-ink text-bg shadow-card' : 'bg-surface-2 text-ink hover:bg-surface-3',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {source === 'topic' && (
            <Select className="mt-3 max-w-sm" value={topicId} onChange={(e) => setTopicId(Number(e.target.value) || '')} aria-label="Chọn chủ đề">
              <option value="">— Chọn chủ đề —</option>
              {topics.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name} · {t.nameVi} ({t.wordCount} từ)
                </option>
              ))}
            </Select>
          )}
        </div>
        )}
        {mode !== 'match' && mode !== 'synonym' && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-ink">Số câu:</span>
            <Segmented
              value={count}
              onChange={setCount}
              options={[
                { value: 10, label: '10' },
                { value: 20, label: '20' },
                { value: 30, label: '30' },
              ]}
            />
          </div>
        )}
        <Button variant="primary" size="lg" icon={<Play className="h-5 w-5 fill-current" />} onClick={start} disabled={source === 'topic' && !topicId && !CURATED.includes(mode)}>
          Bắt đầu
        </Button>
      </Card>
    </div>
  );
}
