import { cn } from '../../lib/utils';
import { Emoji3D } from './Emoji3D';

/**
 * Cụm vật thể 3D trang trí ở bên phải khối chào (hero). Ảnh tĩnh nên không tốn CPU.
 * - Màn hình rộng (xl): một vật thể lớn + hai vật thể nhỏ xếp lệch nhau.
 * - Màn hình hẹp hơn: chỉ một vật thể nhỏ ở góc trên phải (tiêu đề hero nên chừa lề phải, vd. "pr-14 xl:pr-0").
 * Đặt làm con đầu tiên của <section className="relative ..."> hero.
 */
export function HeroArt({ items, className }: { items: [string, string?, string?]; className?: string }) {
  const [main, second, third] = items;
  const shadow = 'drop-shadow-[0_14px_16px_rgb(0_0_0/0.28)]';
  return (
    <>
      <Emoji3D emoji={main} size={52} className={cn('pointer-events-none absolute right-4 top-4 rotate-6 xl:hidden', shadow)} />
      <div aria-hidden="true" className={cn('pointer-events-none absolute right-8 top-1/2 hidden h-44 w-52 -translate-y-1/2 xl:block', className)}>
        <Emoji3D emoji={main} size={124} className={cn('absolute right-6 top-0 rotate-6', shadow)} />
        {second && <Emoji3D emoji={second} size={68} className={cn('absolute bottom-0 left-0 -rotate-12', shadow)} />}
        {third && <Emoji3D emoji={third} size={50} className={cn('absolute bottom-2 right-0 rotate-12', shadow)} />}
      </div>
    </>
  );
}
