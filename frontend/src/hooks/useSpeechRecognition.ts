import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecognitionCtor, type SpeechRecognitionLike } from '../lib/speech';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Bạn chưa cho phép dùng micro.',
  'no-speech': 'Không nghe thấy giọng nói, hãy thử lại.',
  'audio-capture': 'Không tìm thấy micro.',
  network: 'Nhận dạng giọng nói cần kết nối mạng.',
};

/** Nhận dạng giọng nói tiếng Anh để chấm điểm shadowing. */
export function useSpeechRecognition(lang = 'en-US') {
  const Ctor = getRecognitionCtor();
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');
  const onDoneRef = useRef<((text: string) => void) | null>(null);

  const stop = useCallback(() => recRef.current?.stop(), []);

  const start = useCallback(
    (onDone?: (text: string) => void) => {
      if (!Ctor) return false;
      recRef.current?.abort();
      const rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      finalRef.current = '';
      onDoneRef.current = onDone ?? null;
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
        if (e.error !== 'aborted') setError(ERRORS[e.error] ?? `Lỗi nhận dạng: ${e.error}`);
      };
      rec.onend = () => {
        setListening(false);
        setInterim('');
        recRef.current = null;
        onDoneRef.current?.(finalRef.current.trim());
      };
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
        return true;
      } catch {
        return false;
      }
    },
    [Ctor, lang],
  );

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported: Boolean(Ctor), listening, transcript, interim, error, start, stop };
}
