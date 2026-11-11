import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import type { Sentence } from '../../lib/types';

const CHUNK = 30;

/** Dịch phụ đề theo từng khối 30 câu, ưu tiên khối quanh câu đang phát (tải lười). */
export function useSentenceTranslations(key: string, sentences: Sentence[], enabled: boolean, around: number) {
  const [map, setMap] = useState<Record<number, string>>({});
  const requested = useRef(new Set<number>());
  const center = Math.max(0, Math.floor(Math.max(0, around) / CHUNK));

  useEffect(() => {
    setMap({});
    requested.current = new Set();
  }, [key]);

  useEffect(() => {
    if (!enabled || !sentences.length) return;
    const total = Math.ceil(sentences.length / CHUNK);
    const order = [center, center + 1, center - 1, ...Array.from({ length: total }, (_, i) => i)].filter(
      (c, i, arr) => c >= 0 && c < total && arr.indexOf(c) === i,
    );
    let stopped = false;
    (async () => {
      for (const c of order) {
        if (stopped) return;
        if (requested.current.has(c)) continue;
        requested.current.add(c);
        const slice = sentences.slice(c * CHUNK, (c + 1) * CHUNK);
        try {
          const { translations } = await api.translateBatch(slice.map((s) => s.text));
          setMap((m) => {
            const next = { ...m };
            slice.forEach((s, k) => {
              if (translations[k]) next[s.i] = translations[k];
            });
            return next;
          });
        } catch {
          requested.current.delete(c);
          return;
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [enabled, key, sentences, center]);

  return map;
}
