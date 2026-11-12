import { useCallback, useEffect, useRef, useState } from 'react';

/** Ghi âm giọng người học bằng MediaRecorder để nghe lại và so với bản gốc. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const urlRef = useRef<string | null>(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const start = useCallback(async () => {
    if (!supported) return false;
    try {
      setError(null);
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        // Hai lần gọi chồng nhau: giữ luồng đã có, tắt luồng thừa để micro không bị bật mãi
        if (streamRef.current) stream.getTracks().forEach((t) => t.stop());
        else streamRef.current = stream;
      }
      // Đang ghi dở mà lại bắt đầu → bỏ bản cũ (gỡ handler để nó không ghi đè dữ liệu của bản mới)
      const old = recorderRef.current;
      if (old && old.state !== 'inactive') {
        old.ondataavailable = null;
        old.onstop = null;
        old.stop();
      }
      const rec = new MediaRecorder(streamRef.current);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setUrl(urlRef.current);
        setRecording(false);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      return true;
    } catch {
      setError('Không truy cập được micro. Hãy cấp quyền micro cho trang.');
      return false;
    }
  }, [supported]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setUrl(null);
  }, []);

  useEffect(
    () => () => {
      recorderRef.current?.state === 'recording' && recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  return { supported, recording, url, error, start, stop, reset };
}
