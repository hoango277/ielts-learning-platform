import { useMemo } from 'react';
import type { WordStatus } from '../../lib/types';
import { cn, STATUS_META } from '../../lib/utils';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function dayLabel(iso: string) {
  return WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()];
}

/** Biểu đồ cột XP 7 ngày gần nhất. */
export function WeekBars({ data, goal }: { data: { day: string; xp: number }[]; goal: number }) {
  const max = Math.max(goal, ...data.map((d) => d.xp), 1);
  return (
    <div className="flex h-40 items-end gap-2 sm:gap-3" role="img" aria-label={`XP 7 ngày: ${data.map((d) => d.xp).join(', ')}`}>
      {data.map((d, i) => {
        const h = (d.xp / max) * 100;
        const today = i === data.length - 1;
        const reached = d.xp >= goal;
        return (
          <div key={d.day} className="flex h-full flex-1 flex-col items-center gap-1.5">
            <span className="text-[11px] font-semibold text-muted">{d.xp || ''}</span>
            <div className="relative flex w-full flex-1 items-end">
              <div
                className="absolute inset-x-0 border-t border-dashed border-brand-300 dark:border-brand-500/40"
                style={{ bottom: `${(goal / max) * 100}%` }}
                aria-hidden="true"
              />
              <div
                title={`${d.day}: ${d.xp} XP`}
                className={cn(
                  'w-full rounded-lg transition-all duration-700',
                  reached ? 'bg-linear-to-t from-brand-600 to-brand-400' : d.xp ? 'bg-brand-300 dark:bg-brand-500/50' : 'bg-surface-3',
                  today && 'ring-2 ring-brand-500/40 ring-offset-2 ring-offset-surface',
                )}
                style={{ height: `${Math.max(d.xp ? 6 : 3, h)}%` }}
              />
            </div>
            <span className={cn('text-xs font-semibold', today ? 'text-brand-600 dark:text-brand-300' : 'text-muted')}>{today ? 'Nay' : dayLabel(d.day)}</span>
          </div>
        );
      })}
    </div>
  );
}

const HEAT = [
  'bg-surface-3',
  'bg-brand-200 dark:bg-brand-900',
  'bg-brand-300 dark:bg-brand-700',
  'bg-brand-500 dark:bg-brand-500',
  'bg-brand-700 dark:bg-brand-300',
];

function heatLevel(xp: number) {
  if (!xp) return 0;
  if (xp < 20) return 1;
  if (xp < 50) return 2;
  if (xp < 100) return 3;
  return 4;
}

/** Bản đồ nhiệt hoạt động 1 năm (kiểu GitHub). */
export function Heatmap({ data }: { data: { day: string; xp: number }[] }) {
  const { weeks, months } = useMemo(() => {
    const map = new Map(data.map((d) => [d.day, d.xp]));
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 7 * 52 - end.getDay());
    const weeks: { day: string; xp: number; future: boolean }[][] = [];
    const months: { index: number; label: string }[] = [];
    const cursor = new Date(start);
    while (cursor <= end || cursor.getDay() !== 0) {
      if (cursor.getDay() === 0) weeks.push([]);
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (cursor.getDate() === 1 || (weeks.length === 1 && cursor.getDay() === 0)) {
        months.push({ index: weeks.length - 1, label: `Th${cursor.getMonth() + 1}` });
      }
      weeks[weeks.length - 1].push({ day: iso, xp: map.get(iso) ?? 0, future: cursor > end });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { weeks, months };
  }, [data]);

  const activeDays = data.filter((d) => d.xp > 0).length;
  return (
    <div>
      <div className="no-scrollbar overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          <div className="relative mb-1 h-4 text-[10px] font-semibold text-muted">
            {months.map((m) => (
              <span key={`${m.index}-${m.label}`} className="absolute" style={{ left: m.index * 14 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]" role="img" aria-label={`${activeDays} ngày có học trong năm qua`}>
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {w.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.xp} XP`}
                    className={cn('h-[11px] w-[11px] rounded-[3px]', d.future ? 'opacity-0' : HEAT[heatLevel(d.xp)])}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>{activeDays} ngày có học trong 12 tháng</span>
        <span className="flex items-center gap-1">
          Ít
          {HEAT.map((c, i) => (
            <span key={i} className={cn('h-[11px] w-[11px] rounded-[3px]', c)} />
          ))}
          Nhiều
        </span>
      </div>
    </div>
  );
}

const STATUS_ORDER: WordStatus[] = ['new', 'learning', 'reviewing', 'mastered', 'known'];

/** Thanh phân bố trạng thái các từ trong sổ. */
export function StatusBreakdown({ counts }: { counts: Record<WordStatus, number> }) {
  const total = STATUS_ORDER.reduce((a, s) => a + (counts[s] ?? 0), 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
        {total > 0 &&
          STATUS_ORDER.map((s) =>
            counts[s] ? <div key={s} className={STATUS_META[s].dot} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${STATUS_META[s].label}: ${counts[s]}`} /> : null,
          )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {STATUS_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_META[s].dot)} />
            <span className="flex-1 text-muted">{STATUS_META[s].label}</span>
            <span className="font-bold text-ink">{counts[s] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Số thẻ đến hạn trong 7 ngày tới. */
export function ForecastBars({ data }: { data: { day: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-24 items-end gap-2">
      {data.map((d, i) => (
        <div key={d.day} className="flex h-full flex-1 flex-col items-center gap-1">
          <span className="text-[11px] font-semibold text-muted">{d.count || ''}</span>
          <div className="flex w-full flex-1 items-end">
            <div className={cn('w-full rounded-md', i === 0 ? 'bg-orange-500' : 'bg-brand-300/80 dark:bg-brand-500/60')} style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-muted">{i === 0 ? 'Nay' : dayLabel(d.day)}</span>
        </div>
      ))}
    </div>
  );
}
