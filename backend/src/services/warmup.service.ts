import { all } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { addDays, endOfLocalDay, startOfLocalDay } from '../lib/time.ts';
import { selectWarmup, WARMUP_BUDGET_SEC, type WarmupCandidate, type WarmupReason } from '../lib/warmup.ts';
import { toPhraseDTO, type PhraseRow } from './phrases.service.ts';
import { previewIntervals, scheduler, toCard, type FsrsRow } from './review.service.ts';
import { getSettings } from './settings.service.ts';
import { toWordDTO, WORD_SELECT, type WordRow } from './words.service.ts';

/**
 * Lượt "khởi động" khi đăng nhập / mở lại app: vài thẻ sắp quên (theo khả năng nhớ FSRS),
 * buổi sáng thì ưu tiên từ học tối qua để nhớ lại sau giấc ngủ.
 */
const PHRASE_SELECT = 'SELECT p.*, v.title AS video_title FROM phrases p LEFT JOIN videos v ON v.id = p.video_id';

/** Buổi sáng: 4h–12h giờ địa phương. */
export const isMorning = (d = new Date()) => d.getHours() >= 4 && d.getHours() < 12;

export function warmup() {
  const uid = currentUserId();
  const now = new Date();
  const endOfDay = endOfLocalDay(now).toISOString();
  const morning = getSettings().morningReview && isMorning(now);
  const todayStart = startOfLocalDay(now).toISOString();
  const yStart = startOfLocalDay(addDays(now, -1)).toISOString();
  const f = scheduler();

  const words = all<WordRow>(
    `${WORD_SELECT} WHERE w.user_id = ? AND w.known = 0 AND w.state != 0 AND w.due <= ? ORDER BY w.due LIMIT 400`,
    uid,
    endOfDay,
  );
  const phrases = all<PhraseRow>(`${PHRASE_SELECT} WHERE p.user_id = ? AND p.state != 0 AND p.due <= ? ORDER BY p.due LIMIT 200`, uid, endOfDay);

  // Từ/mẫu câu học lần đầu hôm qua (kể cả chưa đến hạn) — nhớ lại sau một đêm ngủ
  if (morning) {
    // Bỏ thẻ đã ôn lại hôm nay — nếu không, buổi sáng mở lại app sẽ gặp lại đúng các thẻ đó và thẻ quá hạn thật bị đẩy ra ngoài
    const sleptWords = all<WordRow>(
      `${WORD_SELECT} WHERE w.user_id = ? AND w.known = 0 AND w.state != 0 AND (w.last_review IS NULL OR w.last_review < ?) AND w.id IN
         (SELECT word_id FROM review_logs WHERE user_id = ? AND state = 0 AND reviewed_at >= ? AND reviewed_at < ?)`,
      uid,
      todayStart,
      uid,
      yStart,
      todayStart,
    );
    const sleptPhrases = all<PhraseRow>(
      `${PHRASE_SELECT} WHERE p.user_id = ? AND p.state != 0 AND (p.last_review IS NULL OR p.last_review < ?) AND p.id IN
         (SELECT phrase_id FROM phrase_logs WHERE user_id = ? AND state = 0 AND reviewed_at >= ? AND reviewed_at < ?)`,
      uid,
      todayStart,
      uid,
      yStart,
      todayStart,
    );
    words.push(...sleptWords.map((r) => Object.assign(r, { slept: true })));
    phrases.push(...sleptPhrases.map((r) => Object.assign(r, { slept: true })));
  }

  const nowMs = now.getTime();
  const candidate = (kind: 'word' | 'phrase', r: FsrsRow & { id: number; slept?: boolean }): WarmupCandidate & { row: typeof r } => {
    const dueMs = new Date(r.due).getTime();
    const reason: WarmupReason = r.slept ? 'slept' : dueMs <= nowMs ? 'overdue' : 'due_today';
    return { key: `${kind}:${r.id}`, kind, reason, retrievability: f.get_retrievability(toCard(r), now, false), dueMs, row: r };
  };
  const pool = [...words.map((r) => candidate('word', r)), ...phrases.map((r) => candidate('phrase', r))];
  const picked = selectWarmup(pool);

  const meta = (c: (typeof pool)[number]) => ({
    reason: c.reason,
    retrievability: Math.round(c.retrievability * 100) / 100,
    overdueDays: c.dueMs < nowMs ? Math.floor((nowMs - c.dueMs) / 86400_000) : 0,
  });
  const items = picked.map((c) =>
    c.kind === 'word'
      ? { kind: 'word' as const, ...meta(c), card: { ...toWordDTO(c.row as WordRow), preview: previewIntervals(c.row, now) } }
      : { kind: 'phrase' as const, ...meta(c), card: { ...toPhraseDTO(c.row as PhraseRow), preview: previewIntervals(c.row, now) } },
  );
  const keys = new Set(pool.map((c) => c.key));
  return {
    items,
    /** Tổng số thẻ đang quá hạn (cho thông báo / huy hiệu) */
    overdue: pool.filter((c) => c.reason === 'overdue').length,
    /** Số thẻ có thể ôn trong hôm nay (không trùng) */
    available: keys.size,
    slept: pool.filter((c) => c.reason === 'slept').length,
    morning,
    budgetSec: WARMUP_BUDGET_SEC,
  };
}
