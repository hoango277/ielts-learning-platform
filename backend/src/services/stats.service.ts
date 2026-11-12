import { all, get } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { addDays, localDay } from '../lib/time.ts';
import { levelInfo } from './activity.service.ts';
import { phraseSummary } from './phrases.service.ts';
import { forecast, reviewSummary } from './review.service.ts';
import { getSettings } from './settings.service.ts';
import { toLexiconDTO, type LexiconRow } from './topics.service.ts';
import { listVideos } from './videos.service.ts';
import { STATUS_SQL, toWordDTO, WORD_SELECT, type WordRow } from './words.service.ts';

interface ActivityRow {
  day: string;
  xp: number;
  reviews: number;
  new_words: number;
  practice_total: number;
  practice_correct: number;
  watch_seconds: number;
  shadow_sentences: number;
  dictation_sentences: number;
}

const EMPTY = (day: string): ActivityRow => ({
  day,
  xp: 0,
  reviews: 0,
  new_words: 0,
  practice_total: 0,
  practice_correct: 0,
  watch_seconds: 0,
  shadow_sentences: 0,
  dictation_sentences: 0,
});

function streakInfo() {
  const days = new Set(all<{ day: string }>('SELECT day FROM activity WHERE user_id = ? AND xp > 0', currentUserId()).map((r) => r.day));
  const today = localDay();
  let cursor = new Date();
  if (!days.has(today)) cursor = addDays(cursor, -1);
  let current = 0;
  while (days.has(localDay(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }
  // Chuỗi dài nhất
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && localDay(addDays(new Date(`${prev}T12:00:00`), 1)) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current), todayDone: days.has(today) };
}

// Từ của ngày: lấy trong các cụm từ cốt lõi (tuyển chọn) có ví dụ, cấp B2 trở lên
const WOTD_POOL = `FROM lexicon l WHERE l.meaning_vi != '' AND l.level IN ('B2','C1','C2') AND l.examples != '[]'
  AND l.id IN (SELECT lexicon_id FROM topic_words WHERE group_name = 'core')`;

function wordOfTheDay() {
  const pool = get<{ n: number }>(`SELECT COUNT(*) AS n ${WOTD_POOL}`)!.n;
  if (!pool) return null;
  const day = localDay();
  let hash = 0;
  for (const ch of day) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const row = get<LexiconRow>(`SELECT l.* ${WOTD_POOL} ORDER BY l.id LIMIT 1 OFFSET ?`, hash % pool);
  return row ? toLexiconDTO(row) : null;
}

export function overview() {
  const today = localDay();
  const settings = getSettings();
  const uid = currentUserId();
  const todayRow = get<ActivityRow>('SELECT * FROM activity WHERE user_id = ? AND day = ?', uid, today) ?? EMPTY(today);
  const totals = get<{ xp: number; reviews: number; shadow: number; dictation: number; watch: number; ptotal: number; pcorrect: number }>(
    `SELECT COALESCE(SUM(xp),0) AS xp, COALESCE(SUM(reviews),0) AS reviews, COALESCE(SUM(shadow_sentences),0) AS shadow,
            COALESCE(SUM(dictation_sentences),0) AS dictation, COALESCE(SUM(watch_seconds),0) AS watch,
            COALESCE(SUM(practice_total),0) AS ptotal, COALESCE(SUM(practice_correct),0) AS pcorrect
       FROM activity WHERE user_id = ?`,
    uid,
  )!;

  const statusCounts: Record<string, number> = { new: 0, learning: 0, reviewing: 0, mastered: 0, known: 0 };
  for (const r of all<{ status: string; n: number }>(`SELECT ${STATUS_SQL} AS status, COUNT(*) AS n FROM words w WHERE w.user_id = ? GROUP BY status`, uid)) {
    statusCounts[r.status] = r.n;
  }
  const totalWords = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const since = localDay(addDays(new Date(), -364));
  const heatmap = all<{ day: string; xp: number }>('SELECT day, xp FROM activity WHERE user_id = ? AND day >= ? AND xp > 0 ORDER BY day', uid, since);

  const weekRows = new Map(
    all<ActivityRow>('SELECT * FROM activity WHERE user_id = ? AND day >= ?', uid, localDay(addDays(new Date(), -6))).map((r) => [r.day, r]),
  );
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = localDay(addDays(new Date(), i - 6));
    const r = weekRows.get(day) ?? EMPTY(day);
    return { day, xp: r.xp, reviews: r.reviews, newWords: r.new_words, minutes: Math.round(r.watch_seconds / 60) };
  });

  const streak = streakInfo();
  const level = levelInfo(totals.xp);

  const achievements = [
    { key: 'first-word', icon: '🌱', title: 'Hạt giống', desc: 'Lưu từ đầu tiên', progress: totalWords, target: 1 },
    { key: 'words-100', icon: '📚', title: 'Mọt sách', desc: 'Có 100 từ trong sổ', progress: totalWords, target: 100 },
    { key: 'words-500', icon: '🏛️', title: 'Thư viện sống', desc: 'Có 500 từ trong sổ', progress: totalWords, target: 500 },
    { key: 'mastered-50', icon: '🧠', title: 'Trí nhớ thép', desc: 'Thành thạo 50 từ', progress: statusCounts.mastered, target: 50 }, // chỉ từ ôn tới thành thạo, không tính từ đánh dấu "đã biết"
    { key: 'streak-7', icon: '🔥', title: 'Bền bỉ', desc: 'Chuỗi học 7 ngày', progress: streak.best, target: 7 },
    { key: 'streak-30', icon: '🌋', title: 'Không thể cản', desc: 'Chuỗi học 30 ngày', progress: streak.best, target: 30 },
    { key: 'shadow-100', icon: '🎙️', title: 'Cái bóng', desc: 'Shadowing 100 câu', progress: totals.shadow, target: 100 },
    { key: 'dictation-100', icon: '✍️', title: 'Tai thính', desc: 'Chép chính tả 100 câu', progress: totals.dictation, target: 100 },
    { key: 'reviews-1000', icon: '🃏', title: 'Thẻ bài', desc: 'Ôn 1.000 lượt', progress: totals.reviews, target: 1000 },
    { key: 'xp-5000', icon: '⭐', title: 'Ngôi sao', desc: 'Đạt 5.000 XP', progress: totals.xp, target: 5000 },
  ].map((a) => ({ ...a, achieved: a.progress >= a.target, progress: Math.min(a.progress, a.target) }));

  const recentWords = all<WordRow>(`${WORD_SELECT} WHERE w.user_id = ? ORDER BY w.created_at DESC LIMIT 6`, uid).map(toWordDTO);

  return {
    today: {
      day: today,
      xp: todayRow.xp,
      goal: settings.dailyGoalXp,
      reviews: todayRow.reviews,
      newWords: todayRow.new_words,
      practiceTotal: todayRow.practice_total,
      practiceCorrect: todayRow.practice_correct,
      watchMinutes: Math.round(todayRow.watch_seconds / 60),
      shadowSentences: todayRow.shadow_sentences,
      dictationSentences: todayRow.dictation_sentences,
    },
    streak,
    level,
    totals: {
      words: totalWords,
      reviews: totals.reviews,
      shadowSentences: totals.shadow,
      dictationSentences: totals.dictation,
      watchMinutes: Math.round(totals.watch / 60),
      practiceAccuracy: totals.ptotal ? totals.pcorrect / totals.ptotal : null,
    },
    statusCounts,
    review: reviewSummary(),
    phraseReview: phraseSummary(),
    forecast: forecast(7),
    heatmap,
    week,
    achievements,
    continueWatching: listVideos('history', 8),
    recentWords,
    wordOfTheDay: wordOfTheDay(),
  };
}
