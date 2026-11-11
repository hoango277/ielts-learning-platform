import { Loader2, Play, RotateCcw, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PLAYER_ERRORS, useYouTubePlayer } from '../../hooks/useYouTubePlayer';
import { speak } from '../../lib/speech';
import { cn } from '../../lib/utils';
import { useAccent } from '../word/bits';

export interface ClipSource {
  videoId: string | null;
  start: number | null;
  end: number | null;
  /** Câu dùng cho giọng đọc máy khi không có video */
  text: string;
}

/**
 * Phát đúng một đoạn [start, end] của video YouTube (giọng thật của người nói) rồi tự dừng.
 * Không có video (câu nhập tay) → đọc bằng giọng máy. `playSignal` tăng lên = phát lại từ đầu đoạn.
 */
export function ClipPlayer({
  clip,
  playSignal = 0,
  onEnded,
  className,
  size = 'md',
  rate = 1,
}: {
  clip: ClipSource;
  playSignal?: number;
  onEnded?: () => void;
  className?: string;
  size?: 'sm' | 'md';
  rate?: number;
}) {
  if (!clip.videoId || clip.start == null) return <TtsClip text={clip.text} playSignal={playSignal} onEnded={onEnded} className={className} rate={rate} />;
  return <VideoClip key={clip.videoId} clip={clip as ClipSource & { videoId: string; start: number }} playSignal={playSignal} onEnded={onEnded} className={className} size={size} rate={rate} />;
}

function TtsClip({ text, playSignal, onEnded, className, rate }: { text: string; playSignal: number; onEnded?: () => void; className?: string; rate: number }) {
  const { accent } = useAccent();
  const [speaking, setSpeaking] = useState(false);
  const play = useCallback(() => {
    setSpeaking(true);
    speak(text, {
      accent,
      rate: 0.95 * rate,
      onEnd: () => {
        setSpeaking(false);
        onEnded?.();
      },
    });
  }, [text, accent, rate, onEnded]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!playSignal) return;
    }
    play();
  }, [playSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <button
      type="button"
      onClick={play}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200',
        className,
      )}
      title="Câu nhập tay — đọc bằng giọng máy"
    >
      <Volume2 className={cn('h-4 w-4', speaking && 'animate-pulse')} /> Nghe câu (giọng máy)
    </button>
  );
}

function VideoClip({
  clip,
  playSignal,
  onEnded,
  className,
  size,
  rate,
}: {
  clip: ClipSource & { videoId: string; start: number };
  playSignal: number;
  onEnded?: () => void;
  className?: string;
  size: 'sm' | 'md';
  rate: number;
}) {
  const player = useYouTubePlayer(clip.videoId, { start: clip.start, rate });
  const [active, setActive] = useState(false);
  const pending = useRef(false);
  const end = clip.end ?? clip.start + 6;
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const play = useCallback(() => {
    if (!player.ready) {
      pending.current = true;
      return;
    }
    player.setRate(rate);
    player.seek(Math.max(0, clip.start - 0.15), true);
    setActive(true);
  }, [player, clip.start, rate]);

  // Phát khi player sẵn sàng nếu đã được yêu cầu trước đó
  useEffect(() => {
    if (player.ready && pending.current) {
      pending.current = false;
      play();
    }
  }, [player.ready, play]);

  // Theo dõi thời gian để dừng đúng cuối đoạn
  useEffect(() => {
    if (!active) return;
    return player.timeStore.subscribe(() => {
      if (player.timeStore.get() >= end + 0.2) {
        player.pause();
        setActive(false);
        onEndedRef.current?.();
      }
    });
  }, [active, end, player]);

  useEffect(() => {
    if (!player.playing && active && player.state === 2) setActive(false);
  }, [player.playing, player.state, active]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!playSignal) return;
    }
    play();
  }, [playSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-black', size === 'sm' ? 'aspect-video w-40' : 'aspect-video w-full max-w-sm', className)}>
      <div ref={player.containerRef} className="pointer-events-none absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
      {player.error ? (
        <p className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-white/80">{PLAYER_ERRORS[player.error] ?? 'Không phát được video'}</p>
      ) : (
        <button
          type="button"
          onClick={play}
          aria-label={active ? 'Phát lại đoạn gốc' : 'Nghe đoạn gốc trong video'}
          className={cn('absolute inset-0 flex items-center justify-center transition', active ? 'bg-transparent opacity-0 hover:opacity-100' : 'bg-black/35 hover:bg-black/25')}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-violet-700 shadow-lg">
            {!player.ready && pending.current ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : active ? (
              <RotateCcw className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            )}
          </span>
        </button>
      )}
    </div>
  );
}
