import { useCallback, useEffect, useRef, useState } from 'react';
import { useRecorder } from './useRecorder';
import { useSpeechRecognition } from './useSpeechRecognition';

const NOTHING_HEARD = 'Không nghe thấy giọng nói, hãy thử lại.';

/**
 * Một lượt nói: vừa nhận dạng giọng nói (để chấm) vừa ghi âm (để người học nghe lại giọng mình
 * cạnh giọng gốc). Kết thúc khi người học bấm dừng hoặc trình duyệt tự dừng vì im lặng.
 * Lượt bị lỗi (mất mạng, micro…) hoặc không nghe được chữ nào thì KHÔNG tạo kết quả —
 * chỉ hiện lỗi để người học nói lại (tránh bị chấm trượt oan).
 */
export function useSpeakCapture() {
  const sr = useSpeechRecognition();
  const rec = useRecorder();
  const [result, setResult] = useState<string | null>(null);
  const [emptyError, setEmptyError] = useState<string | null>(null);
  // Đang bật micro / đang nghe → lần gọi start() thứ hai bị bỏ qua (tránh hai bộ nhận dạng, hai bản ghi)
  const busy = useRef(false);
  // Tăng mỗi lần huỷ / rời trang: lượt đang chờ quyền micro biết mình đã bị huỷ
  const gen = useRef(0);
  useEffect(
    () => () => {
      gen.current++;
    },
    [],
  );

  const start = useCallback(async () => {
    if (busy.current) return false;
    busy.current = true;
    const my = ++gen.current;
    setResult(null);
    setEmptyError(null);
    rec.reset();
    await rec.start();
    if (my !== gen.current) {
      if (!busy.current) rec.stop();
      return false;
    }
    const ok = sr.start((text, errorCode) => {
      busy.current = false;
      rec.stop();
      if (errorCode) return; // lỗi đã hiện qua sr.error
      if (!text.trim()) {
        setEmptyError(NOTHING_HEARD);
        return;
      }
      setResult(text);
    });
    if (!ok) {
      busy.current = false;
      rec.stop();
    }
    return ok;
  }, [rec, sr]);

  const stop = useCallback(() => sr.stop(), [sr]);

  /** Huỷ lượt đang nghe, không tạo kết quả (vd. người học bấm "Bỏ qua"). */
  const cancel = useCallback(() => {
    gen.current++;
    busy.current = false;
    sr.abort();
    rec.stop();
  }, [rec, sr]);

  const reset = useCallback(() => {
    setResult(null);
    setEmptyError(null);
    rec.reset();
  }, [rec]);

  return {
    supported: sr.supported,
    listening: sr.listening,
    live: `${sr.transcript} ${sr.interim}`.trim(),
    result,
    recordingUrl: rec.url,
    error: sr.error ?? emptyError ?? rec.error,
    start,
    stop,
    cancel,
    reset,
  };
}
