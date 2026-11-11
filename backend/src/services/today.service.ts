import { z } from 'zod';
import { get, parseJson, run } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { localDay } from '../lib/time.ts';
import { batchDifficulty, pickTodayVideo } from './difficulty.service.ts';
import { completedToday } from './fluency.service.ts';
import { phraseSummary } from './phrases.service.ts';
import { reviewSummary } from './review.service.ts';
import { getSettings } from './settings.service.ts';
import { todayCounts } from './speaking.service.ts';

/**
 * "Hôm nay học gì": một buổi học có hướng dẫn, đủ bốn mảng (Nation): ôn thẻ → nghe video vừa sức →
 * nói đuổi → nói lại câu đã lưu → nói trôi chảy 4/3/2. Tiến độ tính từ hoạt động thật trong ngày.
 */
export const STEP_KEYS = ['review', 'watch', 'shadow', 'speak', 'fluency'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

const TARGETS = {
  standard: { review: 20, watchMin: 5, shadow: 10, speak: 5, fluency: 1 },
  short: { review: 10, watchMin: 3, shadow: 5, speak: 3, fluency: 0 },
} as const;

interface PlanRow {
  video_id: string | null;
  skipped: string;
}

function planRow(day: string) {
  const uid = currentUserId();
  run('INSERT INTO daily_plans (user_id, day) VALUES (?, ?) ON CONFLICT(user_id, day) DO NOTHING', uid, day);
  return get<PlanRow>('SELECT video_id, skipped FROM daily_plans WHERE user_id = ? AND day = ?', uid, day)!;
}

export function todayPlan() {
  const uid = currentUserId();
  const day = localDay();
  const mode = getSettings().dailyPlanMode;
  const t = TARGETS[mode];
  const row = planRow(day);
  let videoId = row.video_id;
  if (!videoId) {
    videoId = pickTodayVideo();
    if (videoId) run('UPDATE daily_plans SET video_id = ? WHERE user_id = ? AND day = ?', videoId, uid, day);
  }
  const skipped = new Set(parseJson<StepKey[]>(row.skipped, []));
  const act = get<{ reviews: number; watch_seconds: number; shadow_sentences: number; speaking_items: number }>(
    'SELECT reviews, watch_seconds, shadow_sentences, speaking_items FROM activity WHERE user_id = ? AND day = ?',
    uid,
    day,
  ) ?? { reviews: 0, watch_seconds: 0, shadow_sentences: 0, speaking_items: 0 };

  const words = reviewSummary();
  const phrases = phraseSummary();
  const remaining = words.dueNow + words.newAvailable + phrases.dueNow + phrases.newAvailable;
  const reviewed = act.reviews;
  const reviewTarget = Math.min(t.review, reviewed + remaining);

  const video = videoId
    ? get<{ id: string; title: string; channel_name: string | null; duration: number; thumbnail: string | null }>(
        'SELECT id, title, channel_name, duration, thumbnail FROM videos WHERE id = ?',
        videoId,
      )
    : undefined;
  const difficulty = videoId ? (batchDifficulty([videoId])[videoId] ?? null) : null;

  const speakCounts = todayCounts();
  const spoken = (speakCounts.cloze ?? 0) + (speakCounts.delayed ?? 0) + (speakCounts.vi ?? 0);
  const phraseTotal = phrases.total;

  const steps = [
    {
      key: 'review' as const,
      title: 'Ôn thẻ đến hạn',
      desc: reviewTarget ? `Ôn ${reviewTarget} thẻ từ vựng và mẫu câu theo lịch FSRS` : 'Không có thẻ nào đến hạn — tuyệt!',
      value: Math.min(reviewed, reviewTarget),
      target: reviewTarget,
      unit: 'thẻ',
      link: '/review',
    },
    {
      key: 'watch' as const,
      title: 'Nghe một video vừa sức',
      desc: video
        ? `“${video.title}”${difficulty?.label === 'hard' ? ' — hơi khó với bạn: xem tab “Độ khó” để học trước từ mới, hoặc đổi video dễ hơn' : ''}`
        : 'Chưa có video gợi ý — mở Khám phá để chọn một video có phụ đề',
      value: Math.min(Math.floor(act.watch_seconds / 60), t.watchMin),
      target: t.watchMin,
      unit: 'phút',
      link: video ? `/watch/${video.id}` : '/explore',
    },
    {
      key: 'shadow' as const,
      title: 'Nói đuổi (shadowing)',
      desc: `Nhại theo ${t.shadow} câu trong video${video ? ' vừa xem' : ''}`,
      value: Math.min(act.shadow_sentences, t.shadow),
      target: t.shadow,
      unit: 'câu',
      link: video ? `/watch/${video.id}?mode=shadow` : '/explore',
    },
    {
      key: 'speak' as const,
      title: 'Nói lại câu đã lưu',
      desc: phraseTotal ? `Nói lại ${t.speak} mẫu câu bạn đã lưu (câu có chỗ trống / nghe – chờ – nói)` : 'Lưu vài câu hay từ video trước (nút dấu trang trong phụ đề)',
      value: Math.min(spoken, t.speak),
      target: t.speak,
      unit: 'câu',
      link: `/speaking?mode=cloze&count=${t.speak}`,
      blocked: phraseTotal === 0,
    },
    ...(t.fluency
      ? [
          {
            key: 'fluency' as const,
            title: 'Một lượt nói 4/3/2',
            desc: 'Nói cùng một đề 3 lần: 4 → 3 → 2 phút để tăng độ trôi chảy',
            value: Math.min(completedToday(), t.fluency),
            target: t.fluency,
            unit: 'lượt',
            link: '/fluency',
          },
        ]
      : []),
  ].map((s) => ({ ...s, blocked: 'blocked' in s ? Boolean(s.blocked) : false, skipped: skipped.has(s.key), done: s.value >= s.target }));

  const finished = steps.filter((s) => s.done || s.skipped).length;
  return {
    day,
    mode,
    steps,
    finished,
    total: steps.length,
    allDone: finished === steps.length,
    video: video
      ? {
          id: video.id,
          title: video.title,
          channelName: video.channel_name,
          durationSec: video.duration,
          thumbnail: video.thumbnail ?? `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`,
          difficulty,
        }
      : null,
    estimatedMinutes: mode === 'standard' ? 40 : 20,
  };
}

export const skipSchema = z.object({ step: z.enum(STEP_KEYS), skipped: z.boolean() });

export function setSkipped(step: StepKey, value: boolean) {
  const day = localDay();
  const row = planRow(day);
  const set = new Set(parseJson<StepKey[]>(row.skipped, []));
  if (value) set.add(step);
  else set.delete(step);
  run('UPDATE daily_plans SET skipped = ? WHERE user_id = ? AND day = ?', JSON.stringify([...set]), currentUserId(), day);
  return todayPlan();
}

export const videoSchema = z.object({ videoId: z.string().regex(/^[\w-]{11}$/).nullable() });

export function setTodayVideo(videoId: string | null) {
  const day = localDay();
  planRow(day);
  run('UPDATE daily_plans SET video_id = ? WHERE user_id = ? AND day = ?', videoId, currentUserId(), day);
  return todayPlan();
}
