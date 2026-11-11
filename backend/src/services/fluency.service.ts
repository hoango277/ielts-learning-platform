import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.ts';
import { FLUENCY_TOPICS } from '../data/fluency-topics.ts';
import { all, get, parseJson, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { countFillers, countWords, roundMetrics } from '../lib/fluency.ts';
import { startOfLocalDay } from '../lib/time.ts';
import { addActivity, XP } from './activity.service.ts';

/** Bản ghi âm 4/3/2 lưu trên máy (không commit), mỗi người dùng một thư mục. */
export const RECORDINGS_DIR = path.join(path.dirname(config.dbPath === ':memory:' ? path.join(process.cwd(), 'data', 'x') : config.dbPath), 'recordings');

export function listTopics() {
  return FLUENCY_TOPICS;
}

export const PLANS = { standard: [240, 180, 120], short: [120, 90, 60] } as const;

export const createSchema = z.object({
  topicId: z.string().max(60).optional(),
  topic: z.string().trim().max(200).optional(),
  prompts: z.array(z.string().max(200)).max(8).optional(),
  notes: z.string().max(2000).optional(),
  plan: z.enum(['standard', 'short']).default('standard'),
});

interface SessionRow {
  id: number;
  topic: string;
  prompts: string;
  notes: string;
  rounds_plan: string;
  completed: number;
  created_at: string;
}

interface RoundRow {
  id: number;
  session_id: number;
  round: number;
  target_sec: number;
  duration_sec: number;
  speech_sec: number;
  word_count: number;
  wpm: number;
  pause_count: number;
  long_pauses: number;
  pause_sec: number;
  mean_run: number;
  filler_count: number;
  fillers: string;
  transcript: string;
  audio_file: string | null;
  created_at: string;
}

function roundDTO(r: RoundRow) {
  const minutes = Math.max(r.duration_sec, 1) / 60;
  return {
    id: r.id,
    round: r.round,
    targetSec: r.target_sec,
    durationSec: r.duration_sec,
    speechSec: r.speech_sec,
    wordCount: r.word_count,
    wpm: r.wpm,
    pauseCount: r.pause_count,
    longPauses: r.long_pauses,
    longPausesPerMin: Math.round((r.long_pauses / minutes) * 10) / 10,
    pauseSec: r.pause_sec,
    meanRun: r.mean_run,
    fillerCount: r.filler_count,
    fillersPerMin: Math.round((r.filler_count / minutes) * 10) / 10,
    fillers: parseJson<Record<string, number>>(r.fillers, {}),
    transcript: r.transcript,
    hasAudio: Boolean(r.audio_file),
    createdAt: r.created_at,
  };
}

function sessionDTO(s: SessionRow, rounds: RoundRow[]) {
  return {
    id: s.id,
    topic: s.topic,
    prompts: parseJson<string[]>(s.prompts, []),
    notes: s.notes,
    plan: parseJson<number[]>(s.rounds_plan, [...PLANS.standard]),
    completed: Boolean(s.completed),
    createdAt: s.created_at,
    rounds: rounds.map(roundDTO),
  };
}

function notFound(): never {
  throw Object.assign(new Error('Không tìm thấy buổi luyện'), { status: 404 });
}

export function createSession(input: z.infer<typeof createSchema>) {
  const preset = input.topicId ? FLUENCY_TOPICS.find((t) => t.id === input.topicId) : undefined;
  const topic = preset?.title ?? input.topic;
  if (!topic) throw Object.assign(new Error('Hãy chọn hoặc nhập một đề'), { status: 400 });
  const prompts = preset?.prompts ?? input.prompts ?? [];
  const res = run(
    'INSERT INTO fluency_sessions (user_id, topic, prompts, notes, rounds_plan) VALUES (?, ?, ?, ?, ?)',
    currentUserId(),
    topic,
    JSON.stringify(prompts),
    input.notes ?? '',
    JSON.stringify(PLANS[input.plan]),
  );
  return getSession(Number(res.lastInsertRowid));
}

export function getSession(id: number) {
  const s = get<SessionRow>('SELECT * FROM fluency_sessions WHERE id = ? AND user_id = ?', id, currentUserId());
  if (!s) notFound();
  const rounds = all<RoundRow>('SELECT * FROM fluency_rounds WHERE session_id = ? ORDER BY round', id);
  return sessionDTO(s, rounds);
}

export const notesSchema = z.object({ notes: z.string().max(2000) });

export function updateNotes(id: number, notes: string) {
  const res = run('UPDATE fluency_sessions SET notes = ? WHERE id = ? AND user_id = ?', notes, id, currentUserId());
  if (!res.changes) notFound();
  return getSession(id);
}

export const roundSchema = z.object({
  round: z.number().int().min(1).max(3),
  targetSec: z.number().int().min(10).max(600),
  durationSec: z.number().min(1).max(900),
  speechSec: z.number().min(0).max(900).default(0),
  pauseCount: z.number().int().min(0).max(2000).default(0),
  longPauses: z.number().int().min(0).max(2000).default(0),
  pauseSec: z.number().min(0).max(900).default(0),
  transcript: z.string().max(20000).default(''),
});

export function saveRound(sessionId: number, input: z.infer<typeof roundSchema>) {
  const s = get<SessionRow>('SELECT * FROM fluency_sessions WHERE id = ? AND user_id = ?', sessionId, currentUserId());
  if (!s) notFound();
  const transcript = input.transcript.trim();
  const wordCount = countWords(transcript);
  const fillers = countFillers(transcript);
  const m = roundMetrics({ ...input, wordCount });
  const planLen = parseJson<number[]>(s.rounds_plan, [...PLANS.standard]).length;
  tx(() => {
    run(
      `INSERT INTO fluency_rounds (session_id, user_id, round, target_sec, duration_sec, speech_sec, word_count, wpm, pause_count,
                                   long_pauses, pause_sec, mean_run, filler_count, fillers, transcript)
       VALUES (:sid, :uid, :round, :target, :duration, :speech, :words, :wpm, :pauses, :long, :pauseSec, :meanRun, :fillers, :fillerJson, :transcript)
       ON CONFLICT(session_id, round) DO UPDATE SET target_sec = excluded.target_sec, duration_sec = excluded.duration_sec,
         speech_sec = excluded.speech_sec, word_count = excluded.word_count, wpm = excluded.wpm, pause_count = excluded.pause_count,
         long_pauses = excluded.long_pauses, pause_sec = excluded.pause_sec, mean_run = excluded.mean_run,
         filler_count = excluded.filler_count, fillers = excluded.fillers, transcript = excluded.transcript,
         created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      {
        sid: sessionId,
        uid: currentUserId(),
        round: input.round,
        target: input.targetSec,
        duration: input.durationSec,
        speech: input.speechSec,
        words: wordCount,
        wpm: m.wpm,
        pauses: input.pauseCount,
        long: input.longPauses,
        pauseSec: input.pauseSec,
        meanRun: m.meanRun,
        fillers: fillers.total,
        fillerJson: JSON.stringify(fillers.byType),
        transcript,
      },
    );
    if (input.round >= planLen) run('UPDATE fluency_sessions SET completed = 1 WHERE id = ?', sessionId);
    addActivity({ fluency_rounds: 1, xp: XP.fluencyRound });
  });
  const round = get<RoundRow>('SELECT * FROM fluency_rounds WHERE session_id = ? AND round = ?', sessionId, input.round)!;
  return { round: roundDTO(round), xp: XP.fluencyRound };
}

function roundRow(roundId: number) {
  const r = get<RoundRow & { user_id: number }>('SELECT * FROM fluency_rounds WHERE id = ? AND user_id = ?', roundId, currentUserId());
  if (!r) throw Object.assign(new Error('Không tìm thấy lượt nói'), { status: 404 });
  return r;
}

const AUDIO_EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };

export function saveAudio(roundId: number, data: Buffer, mime: string) {
  const r = roundRow(roundId);
  const type = mime.split(';')[0].trim().toLowerCase();
  const ext = AUDIO_EXT[type];
  if (!ext) throw Object.assign(new Error('Định dạng ghi âm không hỗ trợ'), { status: 415 });
  if (!data.length) throw Object.assign(new Error('Bản ghi âm rỗng'), { status: 400 });
  const dir = path.join(RECORDINGS_DIR, String(currentUserId()));
  fs.mkdirSync(dir, { recursive: true });
  const file = `${r.session_id}-${r.round}.${ext}`;
  if (r.audio_file && r.audio_file !== file) fs.rmSync(path.join(dir, r.audio_file), { force: true });
  fs.writeFileSync(path.join(dir, file), data);
  run('UPDATE fluency_rounds SET audio_file = ? WHERE id = ?', file, roundId);
  return { ok: true, bytes: data.length };
}

export function audioPath(roundId: number) {
  const r = roundRow(roundId);
  if (!r.audio_file) throw Object.assign(new Error('Lượt nói này không có ghi âm'), { status: 404 });
  const file = path.join(RECORDINGS_DIR, String(currentUserId()), r.audio_file);
  if (!fs.existsSync(file)) throw Object.assign(new Error('Không tìm thấy file ghi âm'), { status: 404 });
  return file;
}

export function deleteSession(id: number) {
  const uid = currentUserId();
  const files = all<{ audio_file: string | null }>('SELECT audio_file FROM fluency_rounds WHERE session_id = ? AND user_id = ?', id, uid);
  const res = run('DELETE FROM fluency_sessions WHERE id = ? AND user_id = ?', id, uid);
  if (!res.changes) notFound();
  for (const f of files) if (f.audio_file) fs.rmSync(path.join(RECORDINGS_DIR, String(uid), f.audio_file), { force: true });
}

export function listSessions(limit = 30) {
  const uid = currentUserId();
  const sessions = all<SessionRow>('SELECT * FROM fluency_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', uid, limit);
  if (!sessions.length) return [];
  const rounds = all<RoundRow>(
    `SELECT * FROM fluency_rounds WHERE session_id IN (${sessions.map(() => '?').join(',')}) ORDER BY round`,
    ...sessions.map((s) => s.id),
  );
  return sessions.map((s) => sessionDTO(s, rounds.filter((r) => r.session_id === s.id)));
}

/** Xu hướng qua các buổi đã hoàn thành: lượt đầu và lượt cuối của mỗi buổi. */
export function trend(limit = 20) {
  const sessions = listSessions(60)
    .filter((s) => s.rounds.length >= 2)
    .slice(0, limit)
    .reverse();
  return sessions.map((s) => {
    const first = s.rounds[0];
    const last = s.rounds[s.rounds.length - 1];
    return {
      id: s.id,
      day: s.createdAt.slice(0, 10),
      topic: s.topic,
      firstWpm: first.wpm,
      lastWpm: last.wpm,
      firstPausesPerMin: first.longPausesPerMin,
      lastPausesPerMin: last.longPausesPerMin,
      fillersPerMin: Math.round((s.rounds.reduce((a, r) => a + r.fillersPerMin, 0) / s.rounds.length) * 10) / 10,
    };
  });
}

export function todayRounds() {
  return get<{ n: number }>('SELECT COUNT(*) AS n FROM fluency_rounds WHERE user_id = ? AND created_at >= ?', currentUserId(), startOfLocalDay().toISOString())!.n;
}

export function completedToday() {
  return get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM fluency_sessions WHERE user_id = ? AND completed = 1 AND created_at >= ?',
    currentUserId(),
    startOfLocalDay().toISOString(),
  )!.n;
}
