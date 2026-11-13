import { toast } from 'sonner';

/*
 * Toàn màn hình cho CẢ trang (document.documentElement) chứ không riêng khung video: popover tra từ, hộp thoại, thông báo
 * đều render qua portal vào <body> — nếu chỉ phóng to một phần tử con thì chúng bị che mất.
 * Trạng thái hiển thị (ẩn thanh bên / thanh trên cùng) đồng bộ qua sự kiện fullscreenchange trong AppShell.
 */

/** Trình duyệt cho phép toàn màn hình (iPhone Safari không hỗ trợ cho trang web thường) */
export const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true;

export function isPageFullscreen() {
  return typeof document !== 'undefined' && document.fullscreenElement === document.documentElement;
}

export function toggleFullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen().catch(() => undefined);
  return document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
    toast.error('Trình duyệt không cho bật toàn màn hình');
  });
}
