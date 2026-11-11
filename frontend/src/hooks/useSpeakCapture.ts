import { useCallback, useState } from 'react';
import { useRecorder } from './useRecorder';
import { useSpeechRecognition } from './useSpeechRecognition';

/**
 * Một lượt nói: vừa nhận dạng giọng nói (để chấm) vừa ghi âm (để người học nghe lại giọng mình
 * cạnh giọng gốc). Kết thúc khi người học bấm dừng hoặc trình duyệt tự dừng vì im lặng.
 */
export function useSpeakCapture() {
  const sr = useSpeechRecognition();
  const rec = useRecorder();
  const [result, setResult] = useState<string | null>(null);

  const start = useCallback(async () => {
    setResult(null);
    rec.reset();
    await rec.start();
    const ok = sr.start((text) => {
      rec.stop();
      setResult(text);
    });
    if (!ok) rec.stop();
    return ok;
  }, [rec, sr]);

  const stop = useCallback(() => sr.stop(), [sr]);

  const reset = useCallback(() => {
    setResult(null);
    rec.reset();
  }, [rec]);

  return {
    supported: sr.supported,
    listening: sr.listening,
    live: `${sr.transcript} ${sr.interim}`.trim(),
    result,
    recordingUrl: rec.url,
    error: sr.error ?? rec.error,
    start,
    stop,
    reset,
  };
}
