import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

// ---- Kiểu tối thiểu cho YouTube IFrame Player API ----
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  destroy(): void;
  unloadModule?(name: string): void;
}

/** Tắt hẳn phụ đề của YouTube (kể cả khi người dùng từng bật CC) — app hiển thị phụ đề riêng. */
function hideYouTubeCaptions(p: YTPlayer) {
  try {
    p.unloadModule?.('captions');
    p.unloadModule?.('cc');
  } catch {
    /* API không chính thức — bỏ qua nếu không có */
  }
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
        onPlaybackRateChange?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const PlayerState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

let apiPromise: Promise<void> | null = null;

function loadIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('Không tải được YouTube Player'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

/** Kho thời gian phát dùng chung — component chỉ re-render khi cần (useSyncExternalStore). */
export interface TimeStore {
  get(): number;
  subscribe(fn: () => void): () => void;
}

function createTimeStore() {
  let value = 0;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(v: number) {
      value = v;
      subs.forEach((fn) => fn());
    },
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

/** Đọc thời gian phát, làm tròn theo bước `step` giây để giảm số lần render. */
export function usePlayerTime(store: TimeStore, step = 0.25) {
  return useSyncExternalStore(store.subscribe, () => Math.floor(store.get() / step) * step);
}

export const PLAYER_ERRORS: Record<number, string> = {
  2: 'ID video không hợp lệ.',
  5: 'Trình duyệt không phát được video này.',
  100: 'Video không tồn tại hoặc đã bị đặt riêng tư.',
  101: 'Chủ sở hữu không cho phép phát video này bên ngoài YouTube.',
  150: 'Chủ sở hữu không cho phép phát video này bên ngoài YouTube.',
};

export function useYouTubePlayer(videoId: string, opts: { start?: number; rate?: number } = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<number>(PlayerState.UNSTARTED);
  const [error, setError] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(opts.rate ?? 1);
  const store = useMemo(createTimeStore, []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const initial = useRef(opts);

  useEffect(() => {
    let disposed = false;
    setReady(false);
    setError(null);
    store.set(initial.current.start ?? 0);
    loadIframeApi()
      .then(() => {
        if (disposed || !containerRef.current || !window.YT) return;
        const mount = document.createElement('div');
        containerRef.current.replaceChildren(mount);
        playerRef.current = new window.YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            start: Math.floor(initial.current.start ?? 0),
            cc_load_policy: 0, // tắt phụ đề của YouTube: app hiển thị phụ đề riêng
            iv_load_policy: 3,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (disposed) return;
              setReady(true);
              setDuration(e.target.getDuration());
              hideYouTubeCaptions(e.target);
              if (rateRef.current !== 1) e.target.setPlaybackRate(rateRef.current);
            },
            onStateChange: (e) => {
              setState(e.data);
              if (e.data === PlayerState.PLAYING || e.data === PlayerState.BUFFERING) {
                setDuration(e.target.getDuration());
                hideYouTubeCaptions(e.target);
              }
            },
            onError: (e) => setError(e.data),
            onPlaybackRateChange: (e) => setRateState(e.data),
          },
        });
      })
      .catch(() => setError(5));
    return () => {
      disposed = true;
      try {
        playerRef.current?.destroy();
      } catch {
        /* iframe đã bị gỡ */
      }
      playerRef.current = null;
    };
  }, [videoId, store]);

  // Đồng hồ nội suy: YouTube chỉ cập nhật getCurrentTime vài lần/giây → nội suy để highlight từng từ mượt
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    let anchorTime = 0;
    let anchorAt = 0;
    let lastReported = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = playerRef.current;
      if (!p) return;
      const reported = p.getCurrentTime?.() ?? 0;
      const now = performance.now();
      const playing = stateRef.current === PlayerState.PLAYING;
      if (reported !== lastReported || !playing) {
        lastReported = reported;
        anchorTime = reported;
        anchorAt = now;
      }
      const t = playing ? anchorTime + ((now - anchorAt) / 1000) * rateRef.current : reported;
      // không để nội suy chạy quá xa giá trị thật
      const value = playing && t - reported > 1 ? reported : t;
      if (Math.abs(value - store.get()) > 0.015) store.set(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, store]);

  // Trước onReady, đối tượng YT.Player chưa có các phương thức → gọi an toàn bằng ?.()
  const play = useCallback(() => playerRef.current?.playVideo?.(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo?.(), []);
  const toggle = useCallback(() => {
    if (stateRef.current === PlayerState.PLAYING) playerRef.current?.pauseVideo?.();
    else playerRef.current?.playVideo?.();
  }, []);
  const seek = useCallback(
    (t: number, autoplay = false) => {
      const p = playerRef.current;
      if (!p?.seekTo) return;
      p.seekTo(Math.max(0, t), true);
      store.set(Math.max(0, t));
      if (autoplay) p.playVideo?.();
    },
    [store],
  );
  const setRate = useCallback((r: number) => {
    playerRef.current?.setPlaybackRate?.(r);
    setRateState(r);
  }, []);
  const getTime = useCallback(() => playerRef.current?.getCurrentTime?.() ?? store.get(), [store]);

  return {
    containerRef,
    ready,
    state,
    playing: state === PlayerState.PLAYING || state === PlayerState.BUFFERING,
    error,
    duration,
    rate,
    timeStore: store as TimeStore,
    play,
    pause,
    toggle,
    seek,
    setRate,
    getTime,
  };
}

export type PlayerApi = ReturnType<typeof useYouTubePlayer>;
