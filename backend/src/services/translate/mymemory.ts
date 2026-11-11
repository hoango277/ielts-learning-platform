import { createLimiter, fetchJson } from '../../lib/http.ts';

/**
 * MyMemory (api.mymemory.translated.net) — API dịch miễn phí, không cần key (~5.000 ký tự/ngày/IP).
 * Chỉ dùng làm phương án dự phòng khi Google tạm chặn (HTTP 429 / trang CAPTCHA).
 */
const limit = createLimiter(3, 120);
const MAX_BYTES = 480;

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  quotaFinished?: boolean;
  matches?: { translation?: string; quality?: string | number }[];
}

/** Chia đoạn dài thành các phần ≤ 480 byte theo ranh giới câu/từ. */
function splitText(text: string): string[] {
  if (Buffer.byteLength(text) <= MAX_BYTES) return [text];
  const parts: string[] = [];
  let current = '';
  for (const piece of text.split(/(?<=[.!?;,])\s+|\s+/)) {
    const next = current ? `${current} ${piece}` : piece;
    if (Buffer.byteLength(next) > MAX_BYTES && current) {
      parts.push(current);
      current = piece;
    } else current = next;
  }
  if (current) parts.push(current);
  return parts;
}

async function translateChunk(text: string, from: string, to: string) {
  const url = `https://api.mymemory.translated.net/get?${new URLSearchParams({ q: text, langpair: `${from}|${to}` })}`;
  const res = await limit(() => fetchJson<MyMemoryResponse>(url, { timeoutMs: 12000, retries: 1 }));
  if (res.quotaFinished || Number(res.responseStatus) !== 200 || !res.responseData?.translatedText) {
    throw new Error(`MyMemory lỗi (status ${res.responseStatus}${res.quotaFinished ? ', hết hạn mức hôm nay' : ''})`);
  }
  return res;
}

export async function mymemoryTranslate(text: string, from: string, to: string): Promise<string> {
  const chunks = splitText(text);
  const out: string[] = [];
  for (const c of chunks) out.push((await translateChunk(c, from, to)).responseData!.translatedText!.trim());
  return out.join(' ').normalize('NFC');
}

/** Bản dịch + các phương án thay thế (từ bộ nhớ dịch) cho từ/cụm từ ngắn. */
export async function mymemoryLookup(text: string, from: string, to: string) {
  const res = await translateChunk(text, from, to);
  const main = res.responseData!.translatedText!.trim().normalize('NFC');
  const alternatives = [
    ...new Set(
      (res.matches ?? [])
        .map((m) => m.translation?.trim().normalize('NFC') ?? '')
        .filter((t) => t && t.toLowerCase() !== main.toLowerCase() && t.length < 60),
    ),
  ].slice(0, 5);
  return { translation: main, alternatives };
}
