import { fsrs, generatorParameters, Rating, type Card, type FSRS, type Grade } from 'ts-fsrs';
import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { formatInterval, localDay, startOfLocalDay } from '../lib/time.ts';
import { addActivity, XP } from './activity.service.ts';
import { getSettings } from './settings.service.ts';
import { getWordRow, toWordDTO, WORD_SELECT, type WordRow } from './words.service.ts';

/**
 * Lặp lại ngắt quãng bằng FSRS (thuật toán hiện đại của Anki): mỗi lần ôn, người học chọn
 * Quên / Khó / Nhớ / Dễ → tính độ ổn định trí nhớ và hẹn ngày ôn tiếp theo.
 */

// Mỗi người dùng có thể chọn tỉ lệ nhớ khác nhau → cache bộ lập lịch theo tỉ lệ
const schedulers = new Map<number, FSRS>();

export function scheduler(): FSRS {
  const retention = getSettings().requestRetention;
  let f = schedulers.get(retention);
  if (!f) {
    f = fsrs(generatorParameters({ request_retention: retention, maximum_interval: 36500, enable_fuzz: true, enable_short_term: true }));
    schedulers.set(retention, f);
  }
  return f;
}

/** Các cột FSRS dùng chung cho thẻ từ và thẻ mẫu câu. */
export type FsrsRow = Pick<
  WordRow,
  'due' | 'stability' | 'difficulty' | 'elapsed_days' | 'scheduled_days' | 'learning_steps' | 'reps' | 'lapses' | 'state' | 'last_review'
>;

export function toCard(r: FsrsRow): Card {
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  };
}

const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;

export function previewIntervals(r: FsrsRow, now = new Date()) {
  const preview = scheduler().repeat(toCard(r), now);
  const out: Record<number, string> = {};
  for (const g of GRADES) out[g] = formatInterval(preview[g].card.due.getTime() - now.getTime());
  return out;
}

export const LEARN_AHEAD_MS = 20 * 60_000;

function introducedToday(): number {
  return get<{ n: number }>(
    'SELECT COUNT(DISTINCT word_id) AS n FROM review_logs WHERE user_id = ? AND state = 0 AND reviewed_at >= ?',
    currentUserId(),
    startOfLocalDay().toISOString(),
  )!.n;
}

export function reviewSummary() {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const counts = get<{ due_now: number; due_today: number; learning: number; new_total: number }>(
    `SELECT
       SUM(CASE WHEN state != 0 AND due <= :ahead THEN 1 ELSE 0 END) AS due_now,
       SUM(CASE WHEN state != 0 AND due <= :eod THEN 1 ELSE 0 END) AS due_today,
       SUM(CASE WHEN state IN (1,3) THEN 1 ELSE 0 END) AS learning,
       SUM(CASE WHEN state = 0 THEN 1 ELSE 0 END) AS new_total
     FROM words WHERE user_id = :uid AND known = 0`,
    { uid: currentUserId(), ahead: new Date(now.getTime() + LEARN_AHEAD_MS).toISOString(), eod: endOfDay.toISOString() },
  )!;
  const newLimit = Math.max(0, getSettings().newCardsPerDay - introducedToday());
  const reviewedToday = get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM review_logs WHERE user_id = ? AND reviewed_at >= ?',
    currentUserId(),
    startOfLocalDay().toISOString(),
  )!.n;
  return {
    dueNow: counts.due_now ?? 0,
    dueToday: counts.due_today ?? 0,
    learning: counts.learning ?? 0,
    newAvailable: Math.min(newLimit, counts.new_total ?? 0),
    newTotal: counts.new_total ?? 0,
    newLimit,
    reviewedToday,
  };
}

/** Hàng đợi ôn tập: thẻ đang học trước, sau đó xen kẽ thẻ ôn và thẻ mới (1 mới / 3 ôn). */
export function getQueue(opts: { limit?: number; topicId?: number; includeNew?: boolean } = {}) {
  const limit = opts.limit ?? 100;
  const now = new Date();
  const topicFilter = opts.topicId ? 'AND w.topic_id = :topicId' : '';
  const params = { uid: currentUserId(), ahead: new Date(now.getTime() + LEARN_AHEAD_MS).toISOString(), limit, topicId: opts.topicId ?? null };
  const due = all<WordRow>(
    `${WORD_SELECT} WHERE w.user_id = :uid AND w.known = 0 AND w.state != 0 AND w.due <= :ahead ${topicFilter} ORDER BY w.due LIMIT :limit`,
    params,
  );
  const newLimit = opts.includeNew === false ? 0 : Math.max(0, getSettings().newCardsPerDay - introducedToday());
  const fresh = newLimit
    ? all<WordRow>(`${WORD_SELECT} WHERE w.user_id = :uid AND w.known = 0 AND w.state = 0 ${topicFilter} ORDER BY w.created_at, w.id LIMIT :n`, {
        ...params,
        n: Math.min(newLimit, limit),
      })
    : [];

  const learning = due.filter((r) => r.state === 1 || r.state === 3);
  const reviews = due.filter((r) => r.state === 2);
  const queue: WordRow[] = [...learning];
  let ni = 0;
  reviews.forEach((r, i) => {
    queue.push(r);
    if ((i + 1) % 3 === 0 && ni < fresh.length) queue.push(fresh[ni++]);
  });
  while (ni < fresh.length) queue.push(fresh[ni++]);

  return {
    cards: queue.slice(0, limit).map((r) => ({ ...toWordDTO(r), preview: previewIntervals(r, now) })),
    summary: reviewSummary(),
  };
}

function snapshot(r: WordRow) {
  return {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: r.last_review,
    correct_count: r.correct_count,
    wrong_count: r.wrong_count,
  };
}

export function applyRating(wordId: number, rating: Grade, mode = 'flashcard', xpOverride?: number) {
  const row = getWordRow(wordId);
  if (!row) {
    const err = new Error('Không tìm thấy từ') as Error & { status: number };
    err.status = 404;
    throw err;
  }
  const now = new Date();
  const { card } = scheduler().next(toCard(row), now, rating);
  const xp = xpOverride ?? (rating === Rating.Again ? XP.reviewAgain : XP.review);
  tx(() => {
    run(
      `UPDATE words SET due = :due, stability = :stability, difficulty = :difficulty, elapsed_days = :elapsed,
         scheduled_days = :scheduled, learning_steps = :steps, reps = :reps, lapses = :lapses, state = :state,
         last_review = :last, updated_at = :now WHERE id = :id AND user_id = :uid`,
      {
        id: wordId,
        uid: currentUserId(),
        due: card.due.toISOString(),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed: card.elapsed_days,
        scheduled: card.scheduled_days,
        steps: card.learning_steps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        last: now.toISOString(),
        now: now.toISOString(),
      },
    );
    run(
      `INSERT INTO review_logs (user_id, word_id, rating, mode, state, due, stability, difficulty, scheduled_days, prev, xp, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      currentUserId(),
      wordId,
      rating,
      mode,
      row.state,
      card.due.toISOString(),
      card.stability,
      card.difficulty,
      card.scheduled_days,
      JSON.stringify(snapshot(row)),
      xp,
      now.toISOString(),
    );
    addActivity({ reviews: 1, xp });
  });
  const updated = getWordRow(wordId)!;
  return {
    word: toWordDTO(updated),
    card: { ...toWordDTO(updated), preview: previewIntervals(updated) },
    nextReview: card.due.toISOString(),
    interval: formatInterval(card.due.getTime() - now.getTime()),
    xp,
  };
}

/** Thời điểm lượt ôn thẻ từ gần nhất trong ngày (để hoàn tác chung với thẻ mẫu câu). */
export function lastWordReviewAt(): string | null {
  return (
    get<{ reviewed_at: string }>(
      'SELECT reviewed_at FROM review_logs WHERE user_id = ? AND reviewed_at >= ? ORDER BY id DESC LIMIT 1',
      currentUserId(),
      startOfLocalDay().toISOString(),
    )?.reviewed_at ?? null
  );
}

/** Hoàn tác lần ôn gần nhất (trong ngày). */
export function undoLastReview() {
  const log = get<{ id: number; word_id: number; prev: string; xp: number; reviewed_at: string }>(
    'SELECT id, word_id, prev, xp, reviewed_at FROM review_logs WHERE user_id = ? AND reviewed_at >= ? ORDER BY id DESC LIMIT 1',
    currentUserId(),
    startOfLocalDay().toISOString(),
  );
  if (!log) return null;
  const prev = parseJson<ReturnType<typeof snapshot> | null>(log.prev, null);
  tx(() => {
    if (prev) {
      run(
        `UPDATE words SET due = :due, stability = :stability, difficulty = :difficulty, elapsed_days = :elapsed_days,
           scheduled_days = :scheduled_days, learning_steps = :learning_steps, reps = :reps, lapses = :lapses,
           state = :state, last_review = :last_review, correct_count = :correct_count, wrong_count = :wrong_count
         WHERE id = :id AND user_id = :uid`,
        { ...prev, id: log.word_id, uid: currentUserId() },
      );
    }
    run('DELETE FROM review_logs WHERE id = ?', log.id);
    addActivity({ reviews: -1, xp: -log.xp }, localDay(new Date(log.reviewed_at)));
  });
  const row = getWordRow(log.word_id);
  return row ? { ...toWordDTO(row), preview: previewIntervals(row) } : null;
}

/** Dự báo số thẻ đến hạn trong 14 ngày tới. */
export function forecast(days = 14) {
  const rows = all<{ due: string }>('SELECT due FROM words WHERE user_id = ? AND known = 0 AND state != 0', currentUserId());
  const buckets = new Array(days).fill(0);
  const start = startOfLocalDay();
  for (const r of rows) {
    const diff = Math.floor((new Date(r.due).getTime() - start.getTime()) / 86400_000);
    buckets[Math.max(0, Math.min(days - 1, diff))] += diff < days ? 1 : 0;
  }
  return buckets.map((count, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { day: localDay(d), count };
  });
}
