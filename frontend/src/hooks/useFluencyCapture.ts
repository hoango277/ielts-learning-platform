import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecognitionCtor, type SpeechRecognitionLike } from '../lib/speech';

/**
 * Ghi một lượt nói dài (4/3/2): ghi âm + đo quãng ngừng từ âm lượng micro + phụ đề trực tiếp.
 * - Quãng ngừng đo bằng Web Audio (không phụ thuộc nhận dạng giọng nói nên khá tin cậy).
 * - Nhận dạng giọng nói của Chrome tự ngắt sau một lúc → tự khởi động lại cho đến khi dừng.
 */
export const PAUSE_MIN = 0.3; // giây — ngắt giữa hai đoạn nói liền
export const LONG_PAUSE = 1.0; // giây — quãng ngừng dài (ngập ngừng)
const FRAME_MS = 50;

export interface CaptureResult {
  blob: Blob | null;
  durationSec: number;
  speechSec: number;
  pauses: number[];
  transcript: string;
}

export function useFluencyCapture() {
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [live, setLive] = useState('');
  const [error, setError] = useState<string | null>(null);
  const srSupported = Boolean(getRecognitionCtor());

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const finalText = useRef('');
  const stats = useRef({ startedAt: 0, speechMs: 0, silenceMs: 0, spoken: false, pauses: [] as number[], floor: 0.01, frames: 0 });

  const startRecognition = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || !activeRef.current) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText.current += `${r[0].transcript.trim()} `;
        else interim += r[0].transcript;
      }
      setLive(`${finalText.current}${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') setError('Bạn chưa cho phép dùng micro cho nhận dạng giọng nói.');
      else if (e.error === 'network') setError('Nhận dạng giọng nói cần kết nối mạng — vẫn ghi âm và đo quãng ngừng.');
    };
    // Chrome tự dừng sau một lúc im lặng / ~1 phút → khởi động lại
    rec.onend = () => {
      recRef.current = null;
      if (activeRef.current) setTimeout(startRecognition, 120);
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      /* đang chạy */
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setLive('');
    finalText.current = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      chunks.current = [];
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported?.(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      recorder.start(1000);
      recorderRef.current = recorder;

      // Đo âm lượng (RMS) mỗi 50 ms; ngưỡng thích nghi theo tiếng ồn nền
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      stats.current = { startedAt: performance.now(), speechMs: 0, silenceMs: 0, spoken: false, pauses: [], floor: 0.01, frames: 0 };
      let lastUi = 0;
      timerRef.current = window.setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const s = stats.current;
        s.frames++;
        const threshold = Math.max(0.012, s.floor * 2.8);
        const voiced = rms > threshold;
        // Mức nền: chỉ học từ khung im lặng — giảm nhanh, tăng chậm (tiếng nói không kéo mức nền lên)
        if (rms < s.floor) s.floor = s.floor * 0.7 + rms * 0.3;
        else if (!voiced) s.floor = s.floor * 0.98 + rms * 0.02;
        if (voiced) {
          if (s.spoken && s.silenceMs / 1000 >= PAUSE_MIN) s.pauses.push(s.silenceMs / 1000);
          s.spoken = true;
          s.silenceMs = 0;
          s.speechMs += FRAME_MS;
        } else if (s.spoken) {
          s.silenceMs += FRAME_MS;
        }
        const now = performance.now();
        if (now - lastUi > 100) {
          lastUi = now;
          setLevel(Math.min(1, rms / Math.max(threshold * 3, 0.05)));
          setSpeaking(voiced);
        }
      }, FRAME_MS);

      activeRef.current = true;
      setActive(true);
      startRecognition();
      return true;
    } catch {
      setError('Không truy cập được micro. Hãy cấp quyền micro cho trang.');
      cleanup();
      return false;
    }
  }, [cleanup, startRecognition]);

  const stop = useCallback(async (): Promise<CaptureResult> => {
    activeRef.current = false;
    setActive(false);
    setSpeaking(false);
    setLevel(0);
    const s = stats.current;
    const durationSec = (performance.now() - s.startedAt) / 1000;
    // Chờ nhận dạng trả nốt kết quả cuối
    const rec = recRef.current;
    if (rec) {
      await new Promise<void>((resolve) => {
        const prev = rec.onend;
        rec.onend = () => {
          prev?.call(rec);
          resolve();
        };
        rec.stop();
        setTimeout(resolve, 1500);
      });
    }
    const recorder = recorderRef.current;
    const blob = await new Promise<Blob | null>((resolve) => {
      if (!recorder || recorder.state === 'inactive') return resolve(chunks.current.length ? new Blob(chunks.current, { type: recorder?.mimeType || 'audio/webm' }) : null);
      recorder.onstop = () => resolve(chunks.current.length ? new Blob(chunks.current, { type: recorder.mimeType || 'audio/webm' }) : null);
      recorder.stop();
    });
    cleanup();
    return { blob, durationSec, speechSec: s.speechMs / 1000, pauses: s.pauses, transcript: finalText.current.trim() || live };
  }, [cleanup, live]);

  useEffect(
    () => () => {
      activeRef.current = false;
      recRef.current?.abort();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      cleanup();
    },
    [cleanup],
  );

  return { active, level, speaking, live, error, srSupported, start, stop };
}
