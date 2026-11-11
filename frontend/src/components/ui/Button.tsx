import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/utils';
import { Spinner } from './primitives';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white shadow-[0_6px_20px_-6px_rgba(124,58,237,0.55)] hover:brightness-110 active:brightness-95 disabled:opacity-50',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 disabled:opacity-50',
  soft: 'bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25 disabled:opacity-50',
  ghost: 'text-ink hover:bg-surface-2 disabled:opacity-40',
  outline: 'border border-line bg-surface text-ink hover:bg-surface-2 disabled:opacity-50',
  danger: 'bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-50',
  success: 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50',
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

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] disabled:active:scale-100';

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
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  disabled,
}: {
  to: string;
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
  return (
    <Link to={to} className={cls}>
      {icon}
      {children}
    </Link>
  );
}
