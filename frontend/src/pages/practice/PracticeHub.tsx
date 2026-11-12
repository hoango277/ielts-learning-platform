import { useQuery } from '@tanstack/react-query';
import { Check, Play } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Emoji3D } from '../../components/ui/Emoji3D';
import { TopicPicker } from '../../components/practice/TopicPicker';
import { Card, Segmented } from '../../components/ui/primitives';
import { HeroArt } from '../../components/ui/HeroArt';
import { Term } from '../../components/ui/Term';
import { api } from '../../lib/api';
import type { PracticeMode, PracticeSource } from '../../lib/types';
import { cn } from '../../lib/utils';

export const MODES: { key: PracticeMode; title: string; desc: string; emoji: string; tone: string }[] = [
  { key: 'mixed', title: 'Tổng hợp', desc: 'Trộn mọi dạng bài — hiệu quả nhất', emoji: '🎯', tone: 'from-brand-100 to-brand-200 dark:from-brand-500/25 dark:to-brand-500/10' },
  { key: 'quiz', title: 'Trắc nghiệm', desc: 'Chọn nghĩa đúng / từ đúng / theo định nghĩa', emoji: '🧩', tone: 'from-sky-100 to-sky-200 dark:from-sky-500/25 dark:to-sky-500/10' },
  { key: 'cloze', title: 'Điền từ vào chỗ trống', desc: 'Điền từ còn thiếu trong câu ví dụ thật', emoji: '✍️', tone: 'from-emerald-100 to-emerald-200 dark:from-emerald-500/25 dark:to-emerald-500/10' },
  { key: 'listening', title: 'Nghe & gõ', desc: 'Nghe phát âm rồi gõ lại từ', emoji: '🎧', tone: 'from-rose-100 to-rose-200 dark:from-rose-500/25 dark:to-rose-500/10' },
  { key: 'spelling', title: 'Chính tả từ', desc: 'Nhìn nghĩa tiếng Việt, gõ từ tiếng Anh', emoji: '🔤', tone: 'from-amber-100 to-amber-200 dark:from-amber-500/25 dark:to-amber-500/10' },
  { key: 'match', title: 'Ghép cặp', desc: 'Ghép từ với nghĩa nhanh nhất có thể', emoji: '🃏', tone: 'from-pink-100 to-pink-200 dark:from-pink-500/25 dark:to-pink-500/10' },
  // Dùng từ tự nhiên: collocation, dạng từ, đồng nghĩa, nâng cấp từ cơ bản
  { key: 'collocation', title: 'Từ hay đi cùng', desc: 'Collocation — chọn từ đi kèm tự nhiên: make / do / take…', emoji: '🔗', tone: 'from-teal-100 to-teal-200 dark:from-teal-500/25 dark:to-teal-500/10' },
  { key: 'wordform', title: 'Điền dạng từ', desc: 'Cùng một gốc từ: decide → decision → decisive, điền đúng dạng', emoji: '🧬', tone: 'from-indigo-100 to-indigo-200 dark:from-indigo-500/25 dark:to-indigo-500/10' },
  { key: 'synonym', title: 'Ghép đồng nghĩa', desc: 'Ghép từ với từ đồng nghĩa phổ biến nhất', emoji: '🔁', tone: 'from-fuchsia-100 to-fuchsia-200 dark:from-fuchsia-500/25 dark:to-fuchsia-500/10' },
  { key: 'upgrade', title: 'Nâng cấp từ', desc: 'Thay good / big / very… bằng từ hay hơn', emoji: '🚀', tone: 'from-orange-100 to-orange-200 dark:from-orange-500/25 dark:to-orange-500/10' },
];

const USAGE_MODES: PracticeMode[] = ['collocation', 'wordform', 'synonym', 'upgrade'];
/** Dạng bài dùng bộ câu soạn sẵn — không phụ thuộc nguồn từ */
const CURATED: PracticeMode[] = ['collocation', 'upgrade'];

/** Lọc trong sổ từ của bạn */
const NOTEBOOK_SOURCES: { value: PracticeSource; label: string; hint: string }[] = [
  { value: 'all', label: 'Tất cả', hint: 'Trộn các từ trong sổ, ưu tiên từ chưa thuộc.' },
  { value: 'due', label: 'Đến hạn ôn', hint: 'Từ đã đến lịch ôn — trả lời đúng được tính luôn là một lượt ôn tập.' },
  { value: 'weak', label: 'Hay sai', hint: 'Những từ bạn hay trả lời sai hoặc hay quên.' },
  { value: 'new', label: 'Mới thêm', hint: 'Từ mới lưu, chưa ôn lần nào.' },
  { value: 'recent', label: 'Gần đây', hint: 'Các từ lưu gần đây nhất.' },
  { value: 'starred', label: '⭐ Có sao', hint: 'Những từ bạn đã gắn sao.' },
];

/*
 * Trang Luyện tập — 2 bước:
 *  1) Luyện từ nào: sổ từ của bạn (lọc theo tình trạng) hoặc một bộ chủ đề IELTS (không cần có sẵn từ trong sổ).
 *  2) Bấm vào dạng bài là bắt đầu luôn.
 * Mở với ?source=topic&topicId=… (từ trang chủ đề) thì chủ đề đã được chọn sẵn.
 */
export default function PracticeHub() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [source, setSource] = useState<PracticeSource | null>((params.get('source') as PracticeSource) ?? null);
  const [count, setCount] = useState(10);
  const [topicId, setTopicId] = useState<number | ''>(Number(params.get('topicId')) || '');
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  const topics = useQuery({ queryKey: ['topics'], queryFn: api.topics, staleTime: 5 * 60_000 });
  const words = overview.data?.totals.words ?? 0;
  const due = overview.data?.review.dueNow ?? 0;

  // Chưa chọn nguồn: sổ còn ít từ (< 4) → mặc định bộ chủ đề, ngược lại luyện từ trong sổ
  const effective: PracticeSource = source ?? (overview.data && words < 4 ? 'topic' : 'all');
  const fromTopic = effective === 'topic';
  const topic = topics.data?.find((t) => t.id === topicId);
  const notebookHint = NOTEBOOK_SOURCES.find((s) => s.value === effective)?.hint;

  const start = (mode: PracticeMode) => {
    const qs = new URLSearchParams({ mode, source: effective, count: String(count) });
    if (fromTopic && topicId) qs.set('topicId', String(topicId));
    navigate(`/practice/play?${qs}`);
  };
  const blocked = (mode: PracticeMode) => !CURATED.includes(mode) && fromTopic && !topicId;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-hero [--hero-glow:var(--color-amber-400)] p-6 text-white shadow-glow sm:p-8">
        <HeroArt items={['🎯', '🧩', '🃏']} />
        <h1 className="pr-14 xl:pr-0 relative text-2xl font-black sm:text-3xl">Luyện tập</h1>
        <p className="relative mt-1 max-w-xl text-sm text-white/90">Chọn từ muốn luyện, rồi bấm vào một dạng bài để bắt đầu.</p>
      </section>

      {/* Bước 1: luyện từ nào */}
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-ink">
            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm text-white">1</span>
            Luyện từ nào?
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted">Số câu</span>
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
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Nguồn từ">
          {[
            { key: 'notebook', emoji: '📒', title: 'Sổ từ của bạn', desc: words ? `${words} từ đã lưu` : 'Sổ đang trống — lưu từ khi xem video hoặc từ bộ chủ đề', disabled: words === 0, active: !fromTopic },
            { key: 'topic', emoji: '📚', title: 'Bộ từ chủ đề IELTS', desc: `${topics.data?.length ?? 26} chủ đề có sẵn, không cần lưu trước`, disabled: false, active: fromTopic },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={o.active}
              disabled={o.disabled}
              onClick={() => setSource(o.key === 'topic' ? 'topic' : 'all')}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55',
                o.active ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-line bg-surface hover:border-brand-300',
              )}
            >
              <Emoji3D emoji={o.emoji} size={44} />
              <span className="min-w-0">
                <span className="block font-display font-extrabold text-ink">{o.title}</span>
                <span className="block text-sm text-muted">{o.desc}</span>
              </span>
              {o.active && <Check className="ml-auto h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" strokeWidth={3} />}
            </button>
          ))}
        </div>

        {fromTopic ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">{topic ? <>Đang chọn: <b className="text-ink">{topic.nameVi || topic.name}</b> ({topic.wordCount} từ)</> : 'Chọn một chủ đề:'}</p>
            <TopicPicker value={topicId} onPick={setTopicId} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {NOTEBOOK_SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSource(s.value)}
                  aria-pressed={effective === s.value}
                  className={cn(
                    'h-9 rounded-xl px-3.5 font-display text-sm font-bold transition active:scale-95',
                    effective === s.value ? 'bg-ink text-bg shadow-card' : 'bg-surface-2 text-ink hover:bg-surface-3',
                  )}
                >
                  {s.label}
                  {s.value === 'due' && due > 0 && <span className="ml-1 opacity-70">({due})</span>}
                </button>
              ))}
            </div>
            {notebookHint && <p className="text-sm text-muted">{notebookHint}</p>}
          </div>
        )}
      </Card>

      {/* Bước 2: bấm vào dạng bài để bắt đầu */}
      {(
        [
          { title: 'Ôn từ vựng', desc: 'Nhớ nghĩa, chính tả và phát âm', modes: MODES.filter((m) => !USAGE_MODES.includes(m.key)) },
          {
            title: 'Dùng từ tự nhiên',
            desc: (
              <>
                <Term k="collocation">Cụm từ hay đi cùng</Term>, <Term k="word_family">họ từ</Term>, <Term k="synonym">từ đồng nghĩa</Term> và{' '}
                <Term k="upgrade">nâng cấp từ</Term>
              </>
            ),
            modes: MODES.filter((m) => USAGE_MODES.includes(m.key)),
          },
        ] as { title: string; desc: ReactNode; modes: typeof MODES }[]
      ).map((group, gi) => (
        <section key={group.title} className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-ink">
                {gi === 0 && <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm text-white">2</span>}
                {gi === 0 ? 'Chọn dạng bài để bắt đầu' : group.title}
              </h2>
              <p className="text-sm text-muted">{gi === 0 ? 'Ôn từ vựng — nhớ nghĩa, chính tả và phát âm' : group.desc}</p>
            </div>
            {group.modes.some((m) => m.key === 'upgrade') && (
              <Link to="/practice/upgrades" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
                Sổ tay nâng cấp từ →
              </Link>
            )}
          </div>
          <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.modes.map((m) => {
              const off = blocked(m.key);
              const note = CURATED.includes(m.key)
                ? 'Bộ câu soạn sẵn'
                : m.key === 'match' || m.key === 'synonym'
                  ? '8 cặp mỗi lượt'
                  : null;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => start(m.key)}
                  disabled={off}
                  title={off ? 'Chọn một chủ đề ở bước 1 trước' : `Bắt đầu: ${m.title}`}
                  className="card card-hover group relative flex items-start gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span
                    className={cn(
                      'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br shadow-[inset_0_-2px_0_rgb(0_0_0/0.05)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110',
                      m.tone,
                    )}
                  >
                    <Emoji3D emoji={m.emoji} size={34} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-display text-[17px] font-extrabold text-ink">{m.title}</span>
                      {m.key === 'mixed' && <span className="rounded-full bg-brand-500/12 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700 dark:text-brand-300">Gợi ý</span>}
                    </span>
                    <span className="block text-sm text-muted">{m.desc}</span>
                    {note && <span className="mt-1 block text-xs font-semibold text-muted/80">{note}</span>}
                  </span>
                  <Play className="mt-1 h-4 w-4 shrink-0 fill-current text-brand-500 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
