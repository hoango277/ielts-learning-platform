import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Ngữ cảnh theo request: người dùng đang đăng nhập.
 * Middleware xác thực chạy phần còn lại của request bên trong `runWithUser`,
 * nên mọi service có thể gọi `currentUserId()` mà không phải truyền userId qua từng hàm.
 */
const storage = new AsyncLocalStorage<{ userId: number }>();

export function runWithUser<T>(userId: number, fn: () => T): T {
  return storage.run({ userId }, fn);
}

export function currentUserId(): number {
  const ctx = storage.getStore();
  if (!ctx) {
    const err = new Error('Bạn cần đăng nhập') as Error & { status: number };
    err.status = 401;
    throw err;
  }
  return ctx.userId;
}
