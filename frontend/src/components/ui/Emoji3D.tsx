import { emoji3dUrl } from '../../lib/emoji3d';
import { cn } from '../../lib/utils';

/**
 * Emoji dạng ảnh 3D (đồng bộ trên mọi hệ điều hành, thay cho emoji phẳng của Windows).
 * Không có ảnh 3D → hiện emoji chữ. Ảnh tải lười, không chặn hiển thị trang.
 */
export function Emoji3D({ emoji, size = 32, className, label }: { emoji: string; size?: number; className?: string; label?: string }) {
  const url = emoji3dUrl(emoji);
  if (!url) {
    return (
      <span className={cn('inline-block leading-none', className)} style={{ fontSize: size * 0.82 }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        {emoji}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      // width/height là kích thước mặc định; class size-* (vd. "size-14 sm:size-22") ghi đè được để co theo màn hình
      className={cn('inline-block shrink-0 select-none', className)}
    />
  );
}
