/**
 * Chọn thẻ cho lượt "khởi động" khi mở app: ôn những thẻ sắp quên trong khoảng 90 giây.
 * - Ngân sách thời gian thay vì số cố định: người dùng Anki thường mất ~5–10 giây/thẻ từ;
 *   thẻ mẫu câu (nghe đoạn video + nhớ cụm) lâu hơn → ước 15 giây.
 * - Buổi sáng ưu tiên từ học tối qua (nhớ lại sau giấc ngủ — Mazza et al., 2016).
 * - Sau đó đến thẻ quá hạn có khả năng nhớ thấp nhất, rồi thẻ đến hạn trong hôm nay.
 */
export type WarmupReason = 'slept' | 'overdue' | 'due_today';

export interface WarmupCandidate {
  key: string;
  kind: 'word' | 'phrase';
  reason: WarmupReason;
  /** Khả năng còn nhớ hiện tại (0–1) theo FSRS */
  retrievability: number;
  dueMs: number;
}

export const WARMUP_BUDGET_SEC = 90;
export const WARMUP_MAX = 10;
export const SECONDS_PER_CARD = { word: 8, phrase: 15 } as const;

const RANK: Record<WarmupReason, number> = { slept: 0, overdue: 1, due_today: 2 };

export function selectWarmup<T extends WarmupCandidate>(candidates: T[], budgetSec = WARMUP_BUDGET_SEC, max = WARMUP_MAX): T[] {
  const sorted = [...candidates].sort(
    (a, b) =>
      RANK[a.reason] - RANK[b.reason] ||
      (a.reason === 'due_today' ? a.dueMs - b.dueMs : a.retrievability - b.retrievability),
  );
  const out: T[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const c of sorted) {
    if (out.length >= max || seen.has(c.key)) continue;
    const cost = SECONDS_PER_CARD[c.kind];
    // Luôn lấy ít nhất 1 thẻ; sau đó dừng khi vượt ngân sách
    if (out.length && used + cost > budgetSec) continue;
    out.push(c);
    seen.add(c.key);
    used += cost;
  }
  return out;
}
