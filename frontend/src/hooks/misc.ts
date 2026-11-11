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
