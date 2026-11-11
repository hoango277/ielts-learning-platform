import { BookA, Search, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { Input } from '../components/ui/primitives';
import { CATEGORY_LABEL, GLOSSARY_LIST, type GlossaryCategory } from '../lib/glossary';
import { cn } from '../lib/utils';

/** Bỏ dấu tiếng Việt để tìm "lap lai" vẫn ra "Lặp lại" */
function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const CATEGORIES = Object.keys(CATEGORY_LABEL) as GlossaryCategory[];

export default function Glossary() {
  const { hash } = useLocation();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<GlossaryCategory | 'all'>('all');
  const [flash, setFlash] = useState<string | null>(null);

  const list = useMemo(() => {
    const needle = fold(q.trim());
    return GLOSSARY_LIST.filter(
      (e) => (cat === 'all' || e.category === cat) && (!needle || fold(`${e.term} ${e.short} ${e.long ?? ''} ${e.example ?? ''}`).includes(needle)),
    );
  }, [q, cat]);

  // Mở từ thẻ giải thích (/glossary#fsrs) → cuộn tới và nháy sáng mục đó
  useEffect(() => {
    const key = decodeURIComponent(hash.slice(1));
    if (!key) return;
    setQ('');
    setCat('all');
    const t = window.setTimeout(() => {
      document.getElementById(`g-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlash(key);
    }, 60);
    const t2 = window.setTimeout(() => setFlash(null), 2400);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [hash]);

  return (
    <div className="mx-auto max-w-4xl">
      <section className="relative overflow-hidden rounded-3xl bg-brand-animated p-6 text-white shadow-glow sm:p-8">
        <div aria-hidden="true" className="absolute -right-10 -top-12 h-44 w-44 animate-float-slow rounded-full bg-white/15 blur-2xl" />
        <div aria-hidden="true" className="absolute -bottom-16 left-1/3 h-40 w-40 animate-float-slow rounded-full bg-amber-300/25 blur-2xl [animation-delay:-4s]" />
        <div className="relative flex items-start gap-4">
          <div className="hidden h-14 w-14 shrink-0 animate-float items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur sm:flex">
            <BookA className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Giải thích thuật ngữ</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/90 sm:text-[15px]">
              Những từ chuyên môn trong app, giải thích bằng tiếng Việt dễ hiểu. Gặp chữ có <span className="term decoration-white/80">gạch chân chấm</span> ở
              bất kỳ đâu, rê chuột hoặc chạm vào để xem nhanh.
            </p>
          </div>
        </div>
      </section>

      <div className="sticky top-14 z-10 -mx-4 mt-5 bg-bg/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm thuật ngữ… (vd. FSRS, collocation, lặp lại)"
            aria-label="Tìm thuật ngữ"
            className="h-11 pl-10 shadow-soft"
          />
        </div>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Lọc theo nhóm">
          {(['all', ...CATEGORIES] as const).map((c) => {
            const active = cat === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCat(c)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 font-display text-sm font-bold transition',
                  active ? 'border-transparent bg-ink text-bg shadow-card' : 'border-line bg-surface text-muted hover:border-violet-300 hover:text-ink',
                )}
              >
                {c === 'all' ? 'Tất cả' : `${CATEGORY_LABEL[c].emoji} ${CATEGORY_LABEL[c].label}`}
              </button>
            );
          })}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="py-16 text-center text-muted">
          <SearchX className="mx-auto h-10 w-10" />
          <p className="mt-3 font-semibold">Không tìm thấy thuật ngữ “{q}”.</p>
        </div>
      ) : (
        CATEGORIES.filter((c) => list.some((e) => e.category === c)).map((c) => (
          <section key={c} className="mt-6">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-ink">
              <span aria-hidden="true">{CATEGORY_LABEL[c].emoji}</span>
              {CATEGORY_LABEL[c].label}
            </h2>
            <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
              {list
                .filter((e) => e.category === c)
                .map((e) => (
                  <article
                    key={e.key}
                    id={`g-${e.key}`}
                    className={cn(
                      'card scroll-mt-40 p-5 transition-[box-shadow,border-color] duration-500',
                      flash === e.key && 'border-violet-400 ring-4 ring-violet-500/25 dark:border-violet-400',
                    )}
                  >
                    <h3 className="font-display text-[17px] font-extrabold leading-snug text-ink">{e.term}</h3>
                    <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink/90">{e.short}</p>
                    {e.long && <p className="mt-2 text-sm leading-relaxed text-muted">{e.long}</p>}
                    {e.example && (
                      <p className="mt-3 rounded-xl border border-dashed border-line bg-surface-2/70 px-3 py-2 text-[13px] leading-relaxed text-muted">
                        <span className="font-semibold text-ink">Ví dụ: </span>
                        {e.example}
                      </p>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
