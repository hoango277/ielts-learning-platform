import { run } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { localDay } from '../lib/time.ts';

/** Điểm kinh nghiệm cho từng hành động học. */
export const XP = {
  review: 2,
  reviewAgain: 1,
  newWord: 3,
  practiceCorrect: 3,
  sessionBonus: 5,
  perfectBonus: 5,
  shadowSentence: 3,
  dictationCorrect: 4,
  dictationPartial: 2,
  watchMinute: 1,
  speakPassed: 4,
  speakTried: 1,
  ownSentence: 5,
  fluencyRound: 8,
  tenseRecognize: 1,
  tenseUse: 3,
  tenseRetry: 1,
  tenseWriting: 6,
} as const;

const FIELDS = new Set([
  'xp',
  'reviews',
  'new_words',
  'practice_total',
  'practice_correct',
  'watch_seconds',
  'shadow_sentences',
  'dictation_sentences',
  'speaking_items',
  'fluency_rounds',
  'tense_items',
]);

export type ActivityDelta = Partial<
  Record<
    | 'xp'
    | 'reviews'
    | 'new_words'
    | 'practice_total'
    | 'practice_correct'
    | 'watch_seconds'
    | 'shadow_sentences'
    | 'dictation_sentences'
    | 'speaking_items'
    | 'fluency_rounds'
    | 'tense_items',
    number
  >
>;

export function addActivity(delta: ActivityDelta, day = localDay()) {
  const entries = Object.entries(delta).filter(([k, v]) => FIELDS.has(k) && v);
  if (!entries.length) return;
  const uid = currentUserId();
  run('INSERT INTO activity (user_id, day) VALUES (?, ?) ON CONFLICT(user_id, day) DO NOTHING', uid, day);
  const sets = entries.map(([k]) => `${k} = MAX(0, ${k} + :${k})`).join(', ');
  run(`UPDATE activity SET ${sets} WHERE user_id = :uid AND day = :day`, { ...Object.fromEntries(entries), uid, day });
}

/** Cấp độ: lên cấp n+1 cần tổng 50·n·(n+1) XP (100, 300, 600, 1000, ...). */
export function levelInfo(totalXp: number) {
  let level = 1;
  while (50 * level * (level + 1) <= totalXp) level++;
  const floor = 50 * (level - 1) * level;
  const ceil = 50 * level * (level + 1);
  return { level, totalXp, current: totalXp - floor, needed: ceil - floor };
}
