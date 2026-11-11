import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerApi } from '../../hooks/useYouTubePlayer';
import type { Sentence } from '../../lib/types';
import { findSentenceIndex } from './tokens';

interface Segment {
  index: number;
  end: number;
  remaining: number; // số lần phát lại còn lại
  onDone?: () => void;
}

/** Thời điểm dừng của câu i: trước khi câu sau bắt đầu, nhưng không cắt mất đuôi câu. */
function pauseAt(sentences: Sentence[], i: number) {
  const cur = sentences[i];
  const next = sentences[i + 1];
  const end = next ? Math.min(cur.end + 0.15, next.start - 0.04) : cur.end + 0.2;
  return Math.max(end, cur.start + 0.3);
}

/**
 * Đồng bộ câu đang phát với thời gian video + điều khiển phát theo câu:
 *  - autoPause: tự dừng ở cuối mỗi câu (để nhại lại)
 *  - loop: lặp lại câu hiện tại
 *  - playSentence(i, {repeat, onDone}): phát đúng 1 câu (dùng cho shadowing / chép chính tả)
 */
export function usePlayback(player: PlayerApi, sentences: Sentence[], opts: { autoPause: boolean; loop: boolean }) {
  const [activeIndex, setActiveIndex] = useState(-1);
  /** Câu vừa bị tự dừng ở cuối (để giao diện giải thích vì sao video dừng); -1 nếu không. */
  const [autoPausedIndex, setAutoPausedIndex] = useState(-1);
  const segment = useRef<Segment | null>(null);
  const playerRef = useRef(player);
  playerRef.current = player;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const lastAutoPaused = useRef(-1);
  const activeRef = useRef(-1);
  const cooldownUntil = useRef(0);
  const lastTick = useRef<{ t: number; at: number } | null>(null);
  const store = player.timeStore;

  useEffect(() => {
    lastTick.current = null;
    return store.subscribe(() => {
      const p = playerRef.current;
      const t = store.get();
      const now = performance.now();
      const prev = lastTick.current;
      lastTick.current = { t, at: now };
      const prevIdx = activeRef.current;
      const idx = findSentenceIndex(sentences, t);
      if (idx !== prevIdx) {
        activeRef.current = idx;
        setActiveIndex(idx);
      }
      if (!p.playing || now < cooldownUntil.current) return;

      const seg = segment.current;
      if (seg) {
        const s = sentences[seg.index];
        if (s && t >= seg.end) {
          if (seg.remaining > 0) {
            seg.remaining--;
            p.seek(Math.max(0, s.start - 0.05), true);
          } else if (optsRef.current.loop) {
            p.seek(Math.max(0, s.start - 0.05), true);
          } else {
            segment.current = null;
            cooldownUntil.current = performance.now() + 500;
            lastAutoPaused.current = seg.index;
            p.pause();
            seg.onDone?.();
          }
        }
        return;
      }

      // Chế độ xem: tự dừng / lặp khi video VỪA ĐI QUA cuối câu đang phát.
      // So với lần cập nhật trước thay vì chỉ xét "t đã qua cuối câu" — nếu không, bắt đầu phát
      // trong khoảng lặng giữa hai câu sẽ bị dừng ngay; và vẫn bắt được khi trình duyệt bỏ sót khung hình.
      if (!prev || prevIdx < 0) return;
      const dt = t - prev.t;
      const natural = dt > 0 && dt <= ((now - prev.at) / 1000) * Math.max(1, p.rate) + 0.3; // phát tự nhiên, không phải tua
      if (!natural) return;
      const end = pauseAt(sentences, prevIdx);
      if (prev.t >= end || t < end) return;
      if (optsRef.current.loop) {
        p.seek(sentences[prevIdx].start, true);
      } else if (optsRef.current.autoPause && lastAutoPaused.current !== prevIdx) {
        lastAutoPaused.current = prevIdx;
        cooldownUntil.current = now + 500;
        setAutoPausedIndex(prevIdx);
        p.pause();
        // lỡ trôi sang câu sau → lùi về đúng cuối câu vừa đọc
        if (idx !== prevIdx) p.seek(end, false);
      }
    });
  }, [store, sentences]);

  const playSentence = useCallback(
    (index: number, o: { repeat?: number; onDone?: () => void } = {}) => {
      const s = sentences[index];
      if (!s) return;
      const next = sentences[index + 1];
      segment.current = {
        index,
        end: next ? Math.min(s.end + 0.2, Math.max(next.start, s.end)) : s.end + 0.3,
        remaining: Math.max(0, (o.repeat ?? 1) - 1),
        onDone: o.onDone,
      };
      cooldownUntil.current = 0;
      playerRef.current.seek(Math.max(0, s.start - 0.05), true);
    },
    [sentences],
  );

  const cancelSegment = useCallback(() => {
    segment.current = null;
  }, []);

  /** Nhảy tới đầu câu (chế độ xem). */
  const jumpTo = useCallback(
    (index: number, play = true) => {
      const i = Math.max(0, Math.min(sentences.length - 1, index));
      const s = sentences[i];
      if (!s) return;
      segment.current = null;
      lastAutoPaused.current = i - 1; // không dừng nhầm ở đuôi câu trước
      cooldownUntil.current = 0;
      playerRef.current.seek(s.start, play);
    },
    [sentences],
  );

  /** Tiếp tục phát sau khi đã tự dừng. */
  const resume = useCallback(() => {
    segment.current = null;
    cooldownUntil.current = 0;
    playerRef.current.play();
  }, []);

  return { activeIndex, autoPausedIndex, playSentence, cancelSegment, jumpTo, resume };
}
