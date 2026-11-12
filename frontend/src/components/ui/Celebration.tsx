import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Emoji3D } from './Emoji3D';

/**
 * Khoảnh khắc hoàn thành (xong buổi học, ôn hết thẻ, xong bộ thẻ…): vật thể 3D bật lên một lần + vài ngôi sao.
 * Chỉ chạy hiệu ứng khi xuất hiện, không lặp — dồn cảm xúc vào một khoảnh khắc thay vì rải rác khắp trang.
 */
export function Celebration({
  emoji = '🏆',
  title,
  description,
  children,
  className,
}: {
  emoji?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-8 text-center', className)} role="status">
      <div className="relative isolate mb-4">
        <div aria-hidden="true" className="blob absolute inset-0 -z-10 scale-[2.3] text-amber-300/45 dark:text-amber-400/25" />
        <Emoji3D emoji={emoji} size={128} className="animate-bounce-in drop-shadow-[0_18px_20px_rgb(28_27_26/0.25)]" />
        <Emoji3D emoji="✨" size={40} className="absolute -right-7 -top-1 animate-pop [animation-delay:250ms]" />
        <Emoji3D emoji="⭐" size={30} className="absolute -left-6 bottom-3 animate-pop [animation-delay:420ms]" />
      </div>
      <h2 className="text-2xl font-black text-balance text-ink">{title}</h2>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
