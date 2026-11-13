import { useId } from 'react';
import type { TimelineMark, TimelineSpec } from '../../lib/types';
import { cn } from '../../lib/utils';

/*
 * Trục thời gian (SVG tĩnh, không hiệu ứng lặp): vị trí 0 = quá khứ xa, 100 = tương lai xa, "bây giờ" mặc định ở 60.
 * ×: một việc tại một thời điểm · đoạn: việc kéo dài · × × ×: thói quen · lượn sóng: đang diễn ra ·
 * mũi tên cong: nối một việc tới một mốc (hoàn thành) · vạch đứt: mốc tham chiếu.
 */

const W = 400;
const H = 124;
const AXIS = 70;
const X0 = 22;
const X1 = 372;
const xOf = (p: number) => X0 + (Math.max(0, Math.min(100, p)) / 100) * (X1 - X0);

const MAIN_STROKE = 'stroke-brand-600 dark:stroke-brand-300';
const OTHER_STROKE = 'stroke-orange-500 dark:stroke-orange-400';
const MAIN_FILL = 'fill-brand-700 dark:fill-brand-200';
const OTHER_FILL = 'fill-orange-600 dark:fill-orange-300';

function Label({ x, y, text, tone = 'main' }: { x: number; y: number; text?: string; tone?: 'main' | 'other' | 'muted' }) {
  if (!text) return null;
  const cls = tone === 'main' ? MAIN_FILL : tone === 'other' ? OTHER_FILL : 'fill-muted';
  // Viền nền quanh chữ (halo) để vạch "bây giờ" / trục không cắt ngang nhãn
  return (
    <text
      x={Math.max(X0 + 10, Math.min(X1 - 10, x))}
      y={y}
      textAnchor="middle"
      strokeWidth={5}
      strokeLinejoin="round"
      className={cn('stroke-surface font-display text-[12px] font-bold [paint-order:stroke]', cls)}
    >
      {text}
    </text>
  );
}

function Cross({ x, size = 6, tone }: { x: number; size?: number; tone: 'main' | 'other' }) {
  const cls = tone === 'main' ? MAIN_STROKE : OTHER_STROKE;
  return (
    <g className={cls} strokeWidth={3} strokeLinecap="round">
      <line x1={x - size} y1={AXIS - size} x2={x + size} y2={AXIS + size} />
      <line x1={x - size} y1={AXIS + size} x2={x + size} y2={AXIS - size} />
    </g>
  );
}

function Mark({ m, uid, i }: { m: TimelineMark; uid: string; i: number }) {
  switch (m.type) {
    case 'point': {
      const tone = m.tone ?? 'main';
      const x = xOf(m.at);
      return (
        <g>
          <Cross x={x} tone={tone} />
          <Label x={x} y={tone === 'main' ? AXIS - 16 : AXIS + 26} text={m.label} tone={tone} />
        </g>
      );
    }
    case 'span': {
      const tone = m.tone ?? 'main';
      const a = xOf(m.from);
      const b = xOf(m.to);
      const gid = `${uid}-g${i}`;
      const color = tone === 'main' ? 'var(--color-brand-500)' : 'var(--color-orange-500)';
      const fadeL = m.open === 'left' || m.open === 'both';
      const fadeR = m.open === 'right' || m.open === 'both';
      return (
        <g>
          <defs>
            <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={a} y1={0} x2={b} y2={0}>
              <stop offset="0" stopColor={color} stopOpacity={fadeL ? 0 : 0.75} />
              <stop offset={fadeL ? '0.3' : '0'} stopColor={color} stopOpacity={0.75} />
              <stop offset={fadeR ? '0.7' : '1'} stopColor={color} stopOpacity={0.75} />
              <stop offset="1" stopColor={color} stopOpacity={fadeR ? 0 : 0.75} />
            </linearGradient>
          </defs>
          <line x1={a} y1={AXIS} x2={b} y2={AXIS} stroke={`url(#${gid})`} strokeWidth={9} strokeLinecap={fadeL || fadeR ? 'butt' : 'round'} />
          <Label x={(a + b) / 2} y={tone === 'main' ? AXIS - 16 : AXIS + 26} text={m.label} tone={tone} />
        </g>
      );
    }
    case 'repeat': {
      const a = xOf(m.from);
      const b = xOf(m.to);
      const n = Math.max(3, Math.min(9, Math.round((m.to - m.from) / 10) + 1));
      const xs = Array.from({ length: n }, (_, k) => a + ((b - a) * k) / (n - 1));
      return (
        <g>
          {xs.map((x, k) => (
            <Cross key={k} x={x} size={4.5} tone="main" />
          ))}
          <Label x={(a + b) / 2} y={AXIS - 16} text={m.label} />
        </g>
      );
    }
    case 'progress': {
      const tone = m.tone ?? 'main';
      const a = xOf(m.from);
      const b = xOf(m.to);
      let d = `M${a},${AXIS}`;
      let k = 0;
      for (let x = a; x + 8 <= b + 0.01; x += 8, k++) d += ` q4,${k % 2 ? 9 : -9} 8,0`;
      return (
        <g>
          <path d={d} fill="none" className={tone === 'main' ? MAIN_STROKE : OTHER_STROKE} strokeWidth={3} strokeLinecap="round" />
          <Label x={(a + b) / 2} y={tone === 'main' ? AXIS - 18 : AXIS + 28} text={m.label} tone={tone} />
        </g>
      );
    }
    case 'link': {
      const a = xOf(m.from);
      const b = xOf(m.to);
      const top = AXIS - 34;
      return (
        <g>
          <path
            d={`M${a},${AXIS - 6} Q${(a + b) / 2},${top} ${b - 2},${AXIS - 8}`}
            fill="none"
            className="stroke-violet-500 dark:stroke-violet-300"
            strokeWidth={2.5}
            strokeDasharray="5 4"
            markerEnd={`url(#${uid}-arrow)`}
          />
          <text
            x={Math.max(X0 + 10, Math.min(X1 - 10, (a + b) / 2))}
            y={top + 8}
            textAnchor="middle"
            strokeWidth={5}
            strokeLinejoin="round"
            className="fill-violet-600 stroke-surface font-display text-[12px] font-bold [paint-order:stroke] dark:fill-violet-300"
          >
            {m.label}
          </text>
        </g>
      );
    }
    case 'ref': {
      const x = xOf(m.at);
      return (
        <g>
          <line x1={x} y1={AXIS - 24} x2={x} y2={AXIS + 16} className="stroke-muted" strokeWidth={2} strokeDasharray="4 4" />
          <Label x={x} y={AXIS + 32} text={m.label} tone="muted" />
        </g>
      );
    }
  }
}

function describe(spec: TimelineSpec) {
  const labels = spec.marks.map((m) => m.label).filter(Boolean);
  return `Trục thời gian${spec.caption ? `: ${spec.caption}` : ''}${labels.length ? ` (${labels.join(', ')})` : ''}`;
}

export function Timeline({ spec, className }: { spec: TimelineSpec; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const nx = xOf(spec.now ?? 60);
  return (
    <figure className={cn('rounded-2xl border border-line bg-surface-2/50 px-2 pb-2 pt-1', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={describe(spec)}>
        <defs>
          <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-violet-500 dark:fill-violet-300" />
          </marker>
        </defs>
        {/* Trục: quá khứ → tương lai */}
        <line x1={X0} y1={AXIS} x2={X1 + 4} y2={AXIS} className="stroke-line" strokeWidth={2} />
        <path d={`M${X1 - 2},${AXIS - 5} L${X1 + 6},${AXIS} L${X1 - 2},${AXIS + 5}`} fill="none" className="stroke-line" strokeWidth={2} strokeLinejoin="round" />
        <text x={X0} y={H - 6} className="fill-muted text-[11px]">
          Quá khứ
        </text>
        <text x={X1 + 6} y={H - 6} textAnchor="end" className="fill-muted text-[11px]">
          Tương lai
        </text>
        {/* Bây giờ */}
        <line x1={nx} y1={AXIS - 40} x2={nx} y2={AXIS + 20} className="stroke-brand-500/70" strokeWidth={2} />
        <text x={nx} y={AXIS - 46} textAnchor="middle" className="fill-brand-600 font-display text-[11px] font-extrabold uppercase tracking-wide dark:fill-brand-300">
          Bây giờ
        </text>
        {spec.marks.map((m, i) => (
          <Mark key={i} m={m} uid={uid} i={i} />
        ))}
      </svg>
      {spec.caption && <figcaption className="px-2 text-center text-sm text-muted">{spec.caption}</figcaption>}
    </figure>
  );
}
