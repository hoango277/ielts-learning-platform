import { useEffect, useRef } from 'react';

type Handler = (e: KeyboardEvent) => void;

function keyName(e: KeyboardEvent) {
  const k = e.key === ' ' ? 'space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return [e.ctrlKey || e.metaKey ? 'mod' : '', e.shiftKey && e.key.length > 1 ? 'shift' : '', e.altKey ? 'alt' : '', k]
    .filter(Boolean)
    .join('+');
}

const INTERACTIVE = 'button, a[href], summary, select, [role="button"], [role="radio"], [role="switch"], [role="tab"], [role="checkbox"], [role="menuitem"], [role="option"]';

/** Nút/link đang được chọn bằng bàn phím (Tab) → Enter/Space thuộc về nó, không phải phím tắt của trang */
function keyboardFocusedControl(el: HTMLElement | null) {
  try {
    return Boolean(el?.matches?.(INTERACTIVE) && el.matches(':focus-visible'));
  } catch {
    return false;
  }
}

/**
 * Phím tắt. Bỏ qua khi đang gõ trong ô nhập (trừ tổ hợp có Ctrl/⌘ và Escape).
 * - scope 'page' (mặc định): tắt hẳn khi đang mở hộp thoại — để phím không tác động lên màn hình bị che phía sau
 *   (vd. đang mở hộp khởi động mà phím 3 lại chấm thẻ ở trang Ôn tập).
 * - scope 'dialog': phím tắt của chính hộp thoại (hộp khởi động, lướt thẻ…), chạy cả khi hộp thoại đang mở.
 * Enter/Space trên nút/link đang chọn bằng bàn phím luôn để nút đó tự xử lý.
 * Ví dụ: useHotkeys({ space: toggle, ArrowLeft: prev, 'mod+k': open })
 */
export function useHotkeys(map: Record<string, Handler>, enabled = true, scope: 'page' | 'dialog' = 'page') {
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
      if ((name === 'Enter' || name === 'space') && keyboardFocusedControl(el)) return;
      if (scope === 'page' && document.querySelector('[data-modal-open="true"]')) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, scope]);
}
