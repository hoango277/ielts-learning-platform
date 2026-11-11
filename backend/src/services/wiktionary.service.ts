import { get, run } from '../db/index.ts';
import { createLimiter, dedupe, fetchJson } from '../lib/http.ts';

/**
 * Nhãn văn phong của một từ trên Wiktionary (CC BY-SA): formal, informal, slang, dated…
 * Lấy từ các mẫu {{lb|en|…}} trong mục tiếng Anh; nhãn thuộc về từng nghĩa nên chỉ mang tính tham khảo.
 */
const limit = createLimiter(2, 200);
const once = dedupe<string[]>();
const TTL_MS = 60 * 86400_000;

const LABELS: Record<string, string> = {
  formal: 'trang trọng',
  informal: 'thân mật',
  colloquial: 'khẩu ngữ',
  slang: 'tiếng lóng',
  literary: 'văn chương',
  poetic: 'thơ ca',
  dated: 'hơi cũ',
  archaic: 'cổ',
  rare: 'hiếm',
  humorous: 'hài hước',
  derogatory: 'miệt thị',
  offensive: 'xúc phạm',
  vulgar: 'thô tục',
  euphemistic: 'nói giảm',
  technical: 'chuyên ngành',
  law: 'pháp lý',
  UK: 'Anh-Anh',
  British: 'Anh-Anh',
  US: 'Anh-Mỹ',
  American: 'Anh-Mỹ',
};

const TEMPORAL = new Set(['hơi cũ', 'cổ', 'hiếm']);

export async function registerLabels(word: string): Promise<string[]> {
  const key = `wikt:${word.toLowerCase()}`;
  const row = get<{ data: string; created_at: string }>('SELECT data, created_at FROM ext_cache WHERE key = ?', key);
  if (row && Date.now() - new Date(row.created_at).getTime() < TTL_MS) return JSON.parse(row.data) as string[];
  return once(key, async () => {
    const url = `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word.toLowerCase())}&prop=wikitext&format=json&formatversion=2`;
    let labels: string[] = [];
    try {
      const data = await limit(() =>
        fetchJson<{ parse?: { wikitext?: string } }>(url, { timeoutMs: 8000, retries: 1, headers: { 'User-Agent': 'ielts-learn/1.0 (personal study app)' } }),
      );
      const text = data.parse?.wikitext ?? '';
      const start = text.indexOf('==English==');
      if (start >= 0) {
        const rest = text.slice(start + 11);
        const end = rest.search(/\n==[^=]/);
        const english = end < 0 ? rest : rest.slice(0, end);
        // Chỉ xét dòng định nghĩa (bắt đầu bằng "# "). Nhãn văn phong lấy từ các nghĩa chính (6 dòng đầu);
        // nhãn thời gian (cổ, hiếm...) chỉ giữ khi đúng với phần lớn các nghĩa, tránh gắn "cổ" cho từ thông dụng.
        const defs = english.split('\n').filter((line) => /^#\s/.test(line));
        const counts = new Map<string, { main: number; all: number }>();
        defs.forEach((line, i) => {
          for (const m of line.matchAll(/\{\{(?:lb|lbl|label)\|en\|([^}]+)\}\}/g)) {
            for (const raw of new Set(m[1].split('|').map((x) => x.trim()))) {
              const vi = LABELS[raw];
              if (!vi) continue;
              const c = counts.get(vi) ?? { main: 0, all: 0 };
              c.all++;
              if (i < 6) c.main++;
              counts.set(vi, c);
            }
          }
        });
        labels = [...counts.entries()]
          .filter(([vi, c]) => (TEMPORAL.has(vi) ? c.all >= defs.length / 2 : c.main > 0))
          .sort((a, b) => b[1].main - a[1].main)
          .map(([k]) => k)
          .slice(0, 4);
      }
    } catch {
      return []; // lỗi mạng: không cache
    }
    run(
      `INSERT INTO ext_cache (key, data, created_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`,
      key,
      JSON.stringify(labels),
    );
    return labels;
  });
}
