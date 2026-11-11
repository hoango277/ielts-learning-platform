import { useEffect, useRef, useState } from 'react';

export function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/** Gọi `onVisible` khi phần tử "lính canh" lọt vào màn hình (cuộn vô hạn). */
export function useInView<T extends Element>(onVisible: () => void, enabled = true, rootMargin = '600px') {
  const ref = useRef<T>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, rootMargin]);
  return ref;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* chế độ ẩn danh */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Số chạy dần tới giá trị mới (thống kê, điểm). Người dùng bật "giảm chuyển động" thì hiện luôn giá trị cuối. */
export function useCountUp(value: number, duration = 700) {
  const [shown, setShown] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const start = current.current;
    const set = (n: number) => {
      current.current = n;
      setShown(n);
    };
    if (start === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      set(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      set(Math.round(start + (value - start) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}
