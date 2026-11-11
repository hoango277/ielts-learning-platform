import { Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PracticeItem } from '../../lib/types';
import { cn } from '../../lib/utils';

interface Tile {
  id: string;
  key: string; // item.key để ghép cặp
  text: string;
  kind: 'term' | 'meaning';
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ghép từ tiếng Anh với nghĩa tiếng Việt, tính giờ và số lần sai. */
export function MatchGame({ items, onFinish }: { items: PracticeItem[]; onFinish: (r: { seconds: number; mistakes: number; wrongKeys: Set<string> }) => void }) {
  const tiles = useMemo<Tile[]>(
    () =>
      shuffle([
        ...items.map((i) => ({ id: `t-${i.key}`, key: i.key, text: i.term, kind: 'term' as const })),
        ...items.map((i) => ({ id: `m-${i.key}`, key: i.key, text: i.meaning.split(/[,;]/)[0], kind: 'meaning' as const })),
      ]),
    [items],
  );
  const [selected, setSelected] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const wrongKeys = useRef(new Set<string>());
  const startedAt = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (items.length && matched.size === items.length) {
      onFinish({ seconds: Math.round((Date.now() - startedAt.current) / 1000), mistakes, wrongKeys: wrongKeys.current });
    }
  }, [matched, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (tile: Tile) => {
    if (matched.has(tile.key) || wrong.length) return;
    if (!selected) return setSelected(tile);
    if (selected.id === tile.id) return setSelected(null);
    if (selected.kind === tile.kind) return setSelected(tile);
    if (selected.key === tile.key) {
      setMatched((m) => new Set(m).add(tile.key));
      setSelected(null);
    } else {
      wrongKeys.current.add(selected.key).add(tile.key);
      setMistakes((m) => m + 1);
      setWrong([selected.id, tile.id]);
      setTimeout(() => {
        setWrong([]);
        setSelected(null);
      }, 600);
    }
  };

  const seconds = (now - startedAt.current) / 1000;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm font-semibold">
        <span className="inline-flex items-center gap-1.5 text-ink">
          <Timer className="h-4 w-4 text-pink-500" /> {seconds.toFixed(1)}s
        </span>
        <span className="text-muted">
          {matched.size}/{items.length} cặp · {mistakes} lần sai
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 pb-1 sm:grid-cols-4">
        {tiles.map((t) => {
          const done = matched.has(t.key);
          const isWrong = wrong.includes(t.id);
          const isSel = selected?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t)}
              disabled={done}
              className={cn(
                'flex min-h-[84px] items-center justify-center rounded-2xl border-2 p-3 text-center text-sm font-semibold shadow-[0_4px_0_0_var(--edge)] transition-all duration-200 [--edge:var(--border)]',
                done && 'scale-90 border-transparent bg-emerald-100 text-emerald-700 opacity-0 shadow-none dark:bg-emerald-500/15',
                !done && !isSel && !isWrong && 'border-line bg-surface text-ink hover:border-pink-300 hover:[--edge:#f9a8d4] active:translate-y-[3px] active:shadow-[0_1px_0_0_var(--edge)]',
                isSel && 'translate-y-[2px] border-pink-500 bg-pink-50 text-pink-700 shadow-[0_2px_0_0_var(--edge)] [--edge:#ec4899] dark:bg-pink-500/15 dark:text-pink-200',
                isWrong && 'animate-shake border-rose-500 bg-rose-50 text-rose-700 [--edge:#f43f5e] dark:bg-rose-500/15',
                t.kind === 'term' && !done && 'font-display text-base font-extrabold',
              )}
            >
              {t.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
