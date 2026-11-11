import { z } from 'zod';
import { all, get, run } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { addActivity, XP } from './activity.service.ts';
import { thumbFor, upsertVideoMeta } from './youtube.service.ts';

// `videos` = metadata dùng chung (tiêu đề, kênh...); `user_videos` = tiến độ riêng của từng người học

interface VideoRow {
  id: string;
  title: string;
  channel_id: string | null;
  channel_name: string | null;
  duration: number;
  thumbnail: string | null;
  saved: number;
  last_position: number;
  watch_seconds: number;
  shadow_count: number;
  dictation_count: number;
  last_watched_at: string | null;
  word_count?: number;
}

function toDTO(r: VideoRow) {
  return {
    id: r.id,
    title: r.title,
    channel: { id: r.channel_id, name: r.channel_name },
    durationSec: r.duration,
    thumbnail: r.thumbnail ?? thumbFor(r.id),
    saved: Boolean(r.saved),
    lastPosition: r.last_position,
    watchSeconds: r.watch_seconds,
    shadowCount: r.shadow_count,
    dictationCount: r.dictation_count,
    lastWatchedAt: r.last_watched_at,
    wordCount: r.word_count ?? 0,
    progress: r.duration ? Math.min(1, r.last_position / r.duration) : 0,
  };
}

const SELECT = `SELECT v.id, v.title, v.channel_id, v.channel_name, v.duration, v.thumbnail,
    uv.saved, uv.last_position, uv.watch_seconds, uv.shadow_count, uv.dictation_count, uv.last_watched_at,
    (SELECT COUNT(*) FROM words w WHERE w.video_id = v.id AND w.user_id = uv.user_id) AS word_count
  FROM user_videos uv JOIN videos v ON v.id = uv.video_id`;

/** Tạo dòng tiến độ của người dùng cho video (nếu chưa có). */
function ensureUserVideo(id: string) {
  run('INSERT INTO user_videos (user_id, video_id) VALUES (?, ?) ON CONFLICT(user_id, video_id) DO NOTHING', currentUserId(), id);
}

export function listVideos(filter: 'history' | 'saved', limit = 60) {
  const uid = currentUserId();
  const rows =
    filter === 'saved'
      ? all<VideoRow>(`${SELECT} WHERE uv.user_id = ? AND uv.saved = 1 ORDER BY COALESCE(uv.last_watched_at, uv.created_at) DESC LIMIT ?`, uid, limit)
      : all<VideoRow>(`${SELECT} WHERE uv.user_id = ? AND uv.last_watched_at IS NOT NULL ORDER BY uv.last_watched_at DESC LIMIT ?`, uid, limit);
  return rows.map(toDTO);
}

export function getVideoState(id: string) {
  const row = get<VideoRow>(`${SELECT} WHERE uv.user_id = ? AND uv.video_id = ?`, currentUserId(), id);
  return row ? toDTO(row) : null;
}

export const progressSchema = z.object({
  title: z.string().max(300).optional(),
  channelId: z.string().max(60).optional(),
  channelName: z.string().max(200).optional(),
  durationSec: z.number().min(0).optional(),
  position: z.number().min(0).optional(),
  watchedSeconds: z.number().min(0).max(3600).optional(),
});

/** Ghi tiến độ xem; cứ mỗi phút xem thật được +1 XP. */
export function recordProgress(id: string, input: z.infer<typeof progressSchema>) {
  upsertVideoMeta({ id, title: input.title, channelId: input.channelId, channelName: input.channelName, duration: input.durationSec });
  ensureUserVideo(id);
  const uid = currentUserId();
  const before =
    get<{ watch_seconds: number }>('SELECT watch_seconds FROM user_videos WHERE user_id = ? AND video_id = ?', uid, id)?.watch_seconds ?? 0;
  const watched = Math.round(input.watchedSeconds ?? 0);
  run(
    `UPDATE user_videos SET last_position = COALESCE(?, last_position), watch_seconds = watch_seconds + ?,
       last_watched_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND video_id = ?`,
    input.position ?? null,
    watched,
    uid,
    id,
  );
  const minutesGained = Math.floor((before + watched) / 60) - Math.floor(before / 60);
  addActivity({ watch_seconds: watched, xp: minutesGained * XP.watchMinute });
  return { ok: true };
}

export function setSaved(id: string, saved: boolean, meta?: { title?: string; channelName?: string; durationSec?: number }) {
  upsertVideoMeta({ id, title: meta?.title, channelName: meta?.channelName, duration: meta?.durationSec });
  ensureUserVideo(id);
  run('UPDATE user_videos SET saved = ? WHERE user_id = ? AND video_id = ?', saved ? 1 : 0, currentUserId(), id);
  return getVideoState(id);
}

export function removeFromHistory(id: string) {
  run('UPDATE user_videos SET last_watched_at = NULL, last_position = 0 WHERE user_id = ? AND video_id = ?', currentUserId(), id);
}

export const practiceSchema = z.object({
  kind: z.enum(['shadow', 'dictation']),
  score: z.number().min(0).max(1).optional(),
});

/** Một câu shadowing / chép chính tả hoàn thành. */
export function recordSentencePractice(id: string, input: z.infer<typeof practiceSchema>) {
  upsertVideoMeta({ id });
  ensureUserVideo(id);
  const uid = currentUserId();
  if (input.kind === 'shadow') {
    run('UPDATE user_videos SET shadow_count = shadow_count + 1 WHERE user_id = ? AND video_id = ?', uid, id);
    addActivity({ shadow_sentences: 1, xp: XP.shadowSentence });
    return { xp: XP.shadowSentence };
  }
  const xp = (input.score ?? 0) >= 0.999 ? XP.dictationCorrect : (input.score ?? 0) >= 0.6 ? XP.dictationPartial : 0;
  run('UPDATE user_videos SET dictation_count = dictation_count + 1 WHERE user_id = ? AND video_id = ?', uid, id);
  addActivity({ dictation_sentences: 1, xp });
  return { xp };
}

// ---------- Ghi chú theo mốc thời gian ----------

export const noteSchema = z.object({
  content: z.string().trim().min(1).max(3000),
  time: z.number().min(0).nullable().optional(),
});

export function listNotes(videoId: string) {
  return all<{ id: number; time: number | null; content: string; created_at: string }>(
    'SELECT id, time, content, created_at FROM video_notes WHERE user_id = ? AND video_id = ? ORDER BY COALESCE(time, 1e9), id',
    currentUserId(),
    videoId,
  ).map((n) => ({ id: n.id, time: n.time, content: n.content, createdAt: n.created_at }));
}

export function addNote(videoId: string, input: z.infer<typeof noteSchema>) {
  upsertVideoMeta({ id: videoId });
  const res = run(
    'INSERT INTO video_notes (user_id, video_id, time, content) VALUES (?, ?, ?, ?)',
    currentUserId(),
    videoId,
    input.time ?? null,
    input.content,
  );
  return { id: Number(res.lastInsertRowid), time: input.time ?? null, content: input.content, createdAt: new Date().toISOString() };
}

export function deleteNote(videoId: string, noteId: number) {
  run('DELETE FROM video_notes WHERE id = ? AND video_id = ? AND user_id = ?', noteId, videoId, currentUserId());
}
