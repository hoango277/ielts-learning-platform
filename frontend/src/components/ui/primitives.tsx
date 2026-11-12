import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useCountUp } from '../../hooks/misc';
import { cn, formatNumber } from '../../lib/utils';
import { Emoji3D } from './Emoji3D';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-5 w-5 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function Badge({ className, children, title }: { className?: string; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-5',
        className ?? 'bg-surface-2 text-muted',
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface-2 px-1 font-sans text-[11px] font-semibold text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

const field =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/15 disabled:opacity-60';

export function Input({ className, ref, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(field, 'h-10', className)} {...rest} />;
}

export function Textarea({ className, ref, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea ref={ref} className={cn(field, 'min-h-[84px] py-2.5 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(field, 'h-10 cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b84a3' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, htmlFor, info }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; info?: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {/* `info` (nút giải thích thuật ngữ) nằm ngoài <label> để bấm vào không nhảy focus sang ô nhập */}
      <div className="flex items-center gap-1">
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
          {label}
        </label>
        {info}
      </div>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full shadow-[inset_0_1px_3px_rgb(0_0_0/0.18)] transition-colors duration-200',
        checked ? 'bg-brand-500' : 'bg-surface-3',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          checked ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-xl bg-surface-2 p-1 shadow-[inset_0_1px_2px_rgb(0_0_0/0.05)]', className)}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-display font-bold transition-all duration-200',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
            o.value === value ? 'bg-surface text-ink shadow-soft ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-3 shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      {/* Vệt sáng chạy qua thanh đang có tiến độ cho cảm giác "sống" */}
      <div
        className={cn('h-full rounded-full bg-brand transition-[width] duration-700 ease-out', pct > 0 && pct < 100 && 'shine', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Vòng tiến độ (mục tiêu ngày, tiến độ chủ đề). */
export function Ring({
  value,
  size = 64,
  stroke = 7,
  children,
  color = 'url(#ring-grad)',
  trackClass = 'stroke-surface-3',
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  color?: string;
  trackClass?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--color-brand-400)' }} />
            <stop offset="60%" style={{ stopColor: 'var(--color-brand-500)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--color-orange-400)' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClass} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset 0.7s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Con số chạy dần từ 0 lên giá trị thật khi xuất hiện. */
export function CountUp({ value }: { value: number }) {
  return <>{formatNumber(useCountUp(value))}</>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} aria-hidden="true" />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex animate-rise flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="relative isolate mb-5">
        <div className="blob absolute inset-0 -z-10 scale-[1.8] text-brand-400/35" />
        {typeof icon === 'string' ? (
          // Emoji → ảnh 3D lớn, không khung
          <Emoji3D emoji={icon} size={96} className="animate-float drop-shadow-[0_12px_14px_rgb(28_27_26/0.18)]" />
        ) : (
          <div className="flex h-20 w-20 animate-float items-center justify-center rounded-3xl border border-line bg-surface text-4xl shadow-card">{icon}</div>
        )}
      </div>
      <h3 className="text-xl font-extrabold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-ink">
          {icon}
          {title}
        </h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
      <p className="font-semibold">Có lỗi xảy ra</p>
      <p className="mt-1">{(error as Error)?.message ?? String(error)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Thử lại
        </button>
      )}
    </div>
  );
}
