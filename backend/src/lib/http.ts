export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const { retries = 2, timeoutMs = 15000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'User-Agent': DEFAULT_UA, ...opts.headers },
        body: opts.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new HttpError(res.status, `HTTP ${res.status} từ ${new URL(url).host}`);
      }
      const text = await res.text();
      if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}: ${text.slice(0, 200)}`);
      return text;
    } catch (err) {
      lastError = err;
      // 4xx (trừ 429) là lỗi cố định — không thử lại
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      if (attempt < retries) await sleep(400 * 2 ** attempt + Math.random() * 200);
    }
  }
  throw lastError;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const text = await fetchText(url, opts);
  return JSON.parse(text) as T;
}

/** Giới hạn đồng thời + khoảng cách tối thiểu giữa các lần gọi (lịch sự với API miễn phí). */
export function createLimiter(concurrency: number, minIntervalMs = 0) {
  let active = 0;
  let lastStart = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    const wait = Math.max(0, lastStart + minIntervalMs - Date.now());
    if (wait > 0) {
      setTimeout(next, wait);
      return;
    }
    active++;
    lastStart = Date.now();
    queue.shift()!();
  };

  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

/** Cache trong bộ nhớ có TTL và giới hạn kích thước (LRU đơn giản). */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();
  private ttlMs: number;
  private max: number;
  // Không dùng "parameter property" để Node chạy được file .ts trực tiếp (chế độ strip-types)
  constructor(ttlMs: number, max = 500) {
    this.ttlMs = ttlMs;
    this.max = max;
  }

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs = this.ttlMs) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }

  delete(key: string) {
    this.map.delete(key);
  }
}

/** Gộp các lời gọi trùng nhau đang chạy (tránh gọi API 2 lần cho cùng 1 key). */
export function dedupe<T>() {
  const inflight = new Map<string, Promise<T>>();
  return (key: string, fn: () => Promise<T>): Promise<T> => {
    const existing = inflight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
