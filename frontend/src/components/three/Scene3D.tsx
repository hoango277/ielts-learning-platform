import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { Emoji3D } from '../ui/Emoji3D';

/** Trình duyệt có WebGL không (máy rất cũ, tắt tăng tốc phần cứng → không) */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Dự phòng khi không vẽ được WebGL: cụm ảnh 3D tĩnh cùng chủ đề */
function Fallback({ compact }: { compact?: boolean }) {
  const s = compact ? 0.7 : 1;
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2">
      <Emoji3D emoji="💬" size={72 * s} className="-rotate-6" />
      <Emoji3D emoji="📖" size={110 * s} />
      <Emoji3D emoji="🎧" size={72 * s} className="rotate-6" />
    </div>
  );
}

/**
 * Cảnh 3D "4 kỹ năng IELTS" (three.js). Mã three.js được tải lười — chỉ trang dùng cảnh này mới tải.
 * Canvas hiện dần khi khung hình đầu tiên vẽ xong; không có WebGL thì hiện cụm ảnh 3D tĩnh.
 */
export function Scene3D({ compact, className }: { compact?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!hasWebGL()) {
      setFailed(true);
      return;
    }
    let disposed = false;
    let handle: { dispose: () => void } | null = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Chữ trên khối/bong bóng vẽ bằng font Nunito → đợi font (tối đa 1,5 giây) rồi mới dựng cảnh
    const fontReady = Promise.race([document.fonts?.load('900 100px "Nunito Variable"') ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]);
    Promise.all([import('./studyScene'), fontReady])
      .then(([{ createStudyScene }]) => {
        if (disposed) return;
        handle = createStudyScene(el, { compact, reducedMotion });
      })
      .catch(() => !disposed && setFailed(true));
    return () => {
      disposed = true;
      handle?.dispose();
    };
  }, [compact]);

  return (
    <div ref={ref} className={cn('pointer-events-none relative', className)} aria-hidden="true">
      {failed && <Fallback compact={compact} />}
    </div>
  );
}
