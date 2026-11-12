import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecognitionCtor, type SpeechRecognitionLike } from '../lib/speech';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Bạn chưa cho phép dùng micro.',
  'no-speech': 'Không nghe thấy giọng nói, hãy thử lại.',
  'audio-capture': 'Không tìm thấy micro.',
  network: 'Nhận dạng giọng nói cần kết nối mạng.',
};

/** Gỡ hết handler rồi huỷ: bộ nhận dạng cũ không còn gọi onDone / đè trạng thái của lượt mới. */
function detachAndAbort(rec: SpeechRecognitionLike) {
  rec.onresult = null;
  rec.onerror = null;
  rec.onend = null;
  rec.abort();
}

/** Nhận dạng giọng nói tiếng Anh để chấm điểm shadowing. */
export function useSpeechRecognition(lang = 'en-US') {
  const Ctor = getRecognitionCtor();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');

  const stop = useCallback(() => recRef.current?.stop(), []);

  /** Huỷ lượt đang nghe mà không trả kết quả (onDone không được gọi). */
  const abort = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    detachAndAbort(rec);
    setListening(false);
    setInterim('');
  }, []);

  /**
   * Bắt đầu nghe. `onDone(text, errorCode)` được gọi đúng một lần khi lượt này kết thúc;
   * `errorCode` khác null nếu có lỗi (mất mạng, không nghe thấy, chưa cấp quyền micro…).
   */
  const start = useCallback(
    (onDone?: (text: string, errorCode: string | null) => void) => {
      if (!Ctor) return false;
      if (recRef.current) detachAndAbort(recRef.current);
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      finalRef.current = '';
      let errorCode: string | null = null;
      setTranscript('');
      setInterim('');
      setError(null);
      rec.onresult = (e) => {
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalRef.current += `${r[0].transcript} `;
          else interimText += r[0].transcript;
        }
        setTranscript(finalRef.current.trim());
        setInterim(interimText);
      };
      rec.onerror = (e) => {
        if (e.error === 'aborted') return;
        errorCode = e.error;
        setError(ERRORS[e.error] ?? `Lỗi nhận dạng: ${e.error}`);
      };
      rec.onend = () => {
        if (recRef.current === rec) recRef.current = null;
        setListening(false);
        setInterim('');
        onDone?.(finalRef.current.trim(), errorCode);
      };
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
        return true;
      } catch {
        recRef.current = null;
        setListening(false);
        return false;
      }
    },
    [Ctor, lang],
  );

  useEffect(
    () => () => {
      if (recRef.current) detachAndAbort(recRef.current);
    },
    [],
  );

  return { supported: Boolean(Ctor), listening, transcript, interim, error, start, stop, abort };
}
