import { api } from './api';

/**
 * Thông báo đẩy (Web Push): đăng ký service worker và gói đăng ký push với máy chủ.
 * Máy chủ tự gửi nhắc ôn thẻ sắp quên kể cả khi đã đóng tab (trình duyệt vẫn chạy).
 */
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(undefined);
  return navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

function base64UrlToBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

/** Đăng ký (hoặc làm mới) push cho thiết bị này; đổi khoá máy chủ thì tự đăng ký lại. */
export async function subscribePush() {
  if (!(await registerServiceWorker())) throw new Error('Trình duyệt không cho trang này chạy nền (service worker).');
  // `ready` không bao giờ xong nếu service worker không kích hoạt được → giới hạn thời gian chờ thay vì treo mãi
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Service worker chưa sẵn sàng — hãy tải lại trang rồi thử lại.')), 10_000)),
  ]);
  const { publicKey } = await api.pushPublicKey();
  const key = base64UrlToBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.pushSubscribe(sub.toJSON());
  return sub;
}

export async function unsubscribePush() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
