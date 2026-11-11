import { useEffect, useRef } from 'react';

type Handler = (e: KeyboardEvent) => void;

function keyName(e: KeyboardEvent) {
  const k = e.key === ' ' ? 'space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return [e.ctrlKey || e.metaKey ? 'mod' : '', e.shiftKey && e.key.length > 1 ? 'shift' : '', e.altKey ? 'alt' : '', k]
    .filter(Boolean)
    .join('+');
}

/**
 * Phím tắt toàn trang. Bỏ qua khi đang gõ trong ô nhập (trừ tổ hợp có Ctrl/⌘ và Escape).
 * Ví dụ: useHotkeys({ space: toggle, ArrowLeft: prev, 'mod+k': open })
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // defaultPrevented: một thành phần khác đã xử lý phím này (vd. thẻ giải thích thuật ngữ)
      if (e.isComposing || e.repeat || e.defaultPrevented) return;
      const name = keyName(e);
      const fn = ref.current[name];
      if (!fn) return;
      const el = e.target as HTMLElement | null;
      const typing = el?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (typing && !name.startsWith('mod+') && name !== 'Escape') return;
      // Đang ở trong hộp thoại thì chỉ nhận phím tắt khi hộp thoại không mở (trừ Escape)
      if (document.querySelector('[data-modal-open="true"]') && name !== 'Escape' && !el?.closest?.('[role="dialog"]')) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
