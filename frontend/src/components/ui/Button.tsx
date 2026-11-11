import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/utils';
import { Spinner } from './primitives';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

// Nút "nổi khối" (press): bóng đặc phía dưới bằng màu --edge, bấm thì lún xuống — cảm giác bấm thật như Duolingo
const VARIANTS: Record<Variant, string> = {
  primary: 'press bg-brand text-white [--edge:#5b21b6] hover:brightness-110 disabled:opacity-50 dark:[--edge:#2e1065]',
  secondary: 'press bg-surface-2 text-ink [--edge:#dcd5ee] hover:bg-surface-3 disabled:opacity-50 dark:[--edge:#0d0a14]',
  soft: 'press bg-violet-100 text-violet-700 [--edge:#d4c8fb] hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:[--edge:#1a1230] dark:hover:bg-violet-500/25 disabled:opacity-50',
  ghost: 'text-ink hover:bg-surface-2 active:scale-[0.97] disabled:opacity-40',
  outline: 'press border-2 border-line bg-surface text-ink [--edge:var(--border)] hover:bg-surface-2 disabled:opacity-50',
  danger: 'press bg-rose-500 text-white [--edge:#be123c] hover:bg-rose-600 disabled:opacity-50',
  success: 'press bg-emerald-500 text-white [--edge:#047857] hover:bg-emerald-600 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
  'icon-sm': 'h-8 w-8 rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

const BASE = 'inline-flex shrink-0 select-none items-center justify-center font-display font-extrabold tracking-[0.01em] transition-all duration-150';

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ref, ...rest }: ButtonProps) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}

/** Liên kết điều hướng trông như nút (tránh lồng <button> trong <a> — HTML không hợp lệ). */
export function LinkButton({
  to,
  href,
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  disabled,
}: {
  /** Đường dẫn trong app (react-router) */
  to?: string;
  /** Liên kết thường: tải file, trang ngoài */
  href?: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const cls = cn(BASE, VARIANTS[variant], SIZES[size], className);
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(cls, 'pointer-events-none opacity-50')}>
        {icon}
        {children}
      </span>
    );
  }
  if (href !== undefined || to === undefined) {
    return (
      <a href={href} className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={cls}>
      {icon}
      {children}
    </Link>
  );
}
