import { all, get, parseJson, run } from '../db/index.ts';
import { computeCoverage, estimateLevel, tokenizeForCoverage, type NotebookStatus, type VideoWord } from '../lib/coverage.ts';
import { currentUserId } from '../lib/context.ts';
import { ngslRank } from '../lib/ngsl.ts';
import { shuffle } from '../lib/text.ts';
import { baseForms } from '../lib/wordnet.ts';
import { wordFrequencies } from './datamuse.service.ts';
import { getSettings } from './settings.service.ts';
import { getTranscript } from './transcript.service.ts';
import { CURATED_CHANNELS, getChannelVideos, upsertVideoMeta } from './youtube.service.ts';
import { STATUS_SQL } from './words.service.ts';

/**
 * Độ khó video theo vốn từ của từng người học. Phần nặng (đếm từ + tần suất qua Datamuse) làm một lần
 * cho mỗi video ở hàng đợi nền và lưu trong video_lexicon; phần theo người học tính nhanh khi hỏi.
 */
interface Job {
  status: 'queued' | 'running' | 'error';
  done: number;
  total: number;
  error?: string;
}

const jobs = new Map<string, Job>();
const queue: string[] = [];
let working = false;

interface LexRow {
  video_id: string;
  track_id: string;
  token_count: number;
  data: string;
}

async function analyze(videoId: string) {
  const job = jobs.get(videoId)!;
  job.status = 'running';
  let transcript;
  try {
    transcript = await getTranscript(videoId);
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 404) {
      // Không có phụ đề: ghi nhận để không thử lại mãi
      run(
        "INSERT INTO video_lexicon (video_id, track_id, token_count, data) VALUES (?, '', 0, '[]') ON CONFLICT(video_id) DO NOTHING",
        videoId,
      );
    }
    throw err;
  }
  const counts = new Map<string, { n: number; s: number }>();
  for (const s of transcript.sentences) {
    for (const w of tokenizeForCoverage(s.text)) {
      const c = counts.get(w);
      if (c) c.n++;
      else counts.set(w, { n: 1, s: s.i });
    }
  }
  // Từ thuộc NGSL đã có hạng sẵn; chỉ hỏi Datamuse tần suất cho từ ngoài danh sách (kèm dạng gốc theo
  // WordNet vì dạng chia thường hiếm hơn dạng gốc: procrastinators < procrastinator)
  const outside = [...counts.keys()].filter((w) => ngslRank(w) === null);
  const lemmas = new Map<string, string[]>();
  for (const w of outside) lemmas.set(w, [...new Set(baseForms(w).map((b) => b.lemma).filter((l) => l !== w && !l.includes(' ')))]);
  const all = [...outside, ...[...lemmas.values()].flat()];
  const freq = await wordFrequencies(all, {
    onProgress: (done, total) => {
      job.done = done;
      job.total = total;
    },
  });
  const missing = outside.filter((w) => !freq.has(w)).length;
  if (missing > Math.max(5, outside.length * 0.05)) throw new Error('Không lấy được dữ liệu tần suất từ (mất mạng?). Thử lại sau.');
  const words: VideoWord[] = [...counts.entries()].map(([w, c]) => {
    if (ngslRank(w) !== null) return { w, n: c.n, s: c.s, f: null };
    const fs = [freq.get(w) ?? null, ...(lemmas.get(w) ?? []).map((l) => freq.get(l) ?? null)].filter((x): x is number => x != null);
    return { w, n: c.n, s: c.s, f: fs.length ? Math.max(...fs) : null };
  });
  const tokens = words.reduce((a, w) => a + w.n, 0);
  run(
    `INSERT INTO video_lexicon (video_id, track_id, token_count, data, created_at) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(video_id) DO UPDATE SET track_id = excluded.track_id, token_count = excluded.token_count, data = excluded.data,
       created_at = excluded.created_at`,
    videoId,
    transcript.trackId,
    tokens,
    JSON.stringify(words),
  );
}

async function work() {
  if (working) return;
  working = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        await analyze(id);
        jobs.delete(id);
      } catch (err) {
        const job = jobs.get(id);
        if (job) {
          job.status = 'error';
          job.error = (err as Error).message;
          // Cho phép thử lại sau 10 phút
          setTimeout(() => jobs.get(id)?.status === 'error' && jobs.delete(id), 10 * 60_000).unref();
        }
      }
    }
  } finally {
    working = false;
  }
}

export function enqueue(videoId: string, priority = false) {
  if (jobs.has(videoId) || get('SELECT 1 FROM video_lexicon WHERE video_id = ?', videoId)) return;
  jobs.set(videoId, { status: 'queued', done: 0, total: 0 });
  if (priority) queue.unshift(videoId);
  else queue.push(videoId);
  void work();
}

function notebookMap() {
  const map = new Map<string, NotebookStatus>();
  for (const r of all<{ key: string; status: NotebookStatus }>(`SELECT w.term_key AS key, ${STATUS_SQL} AS status FROM words w WHERE w.user_id = ?`, currentUserId())) {
    map.set(r.key, r.status);
  }
  return map;
}

function coverageFor(row: LexRow, notebook: Map<string, NotebookStatus>, vocabLevel: string) {
  const words = parseJson<VideoWord[]>(row.data, []);
  return computeCoverage({ words, notebook, vocabLevel });
}

/** Độ khó của một video cho người học hiện tại; chưa phân tích thì đưa vào hàng đợi (ưu tiên). */
export function getDifficulty(videoId: string) {
  const row = get<LexRow>('SELECT * FROM video_lexicon WHERE video_id = ?', videoId);
  if (!row) {
    const job = jobs.get(videoId);
    if (job?.status === 'error') return { status: 'error' as const, error: job.error ?? 'Lỗi phân tích' };
    enqueue(videoId, true);
    const j = jobs.get(videoId);
    return { status: 'analyzing' as const, done: j?.done ?? 0, total: j?.total ?? 0 };
  }
  if (!row.token_count) return { status: 'unavailable' as const };
  const vocabLevel = getSettings().vocabLevel;
  const c = coverageFor(row, notebookMap(), vocabLevel);
  const idx = c.topNew.map((w) => w.s);
  const sentences = idx.length
    ? all<{ idx: number; start: number; text: string }>(
        `SELECT idx, start, text FROM transcript_sentences WHERE video_id = ? AND idx IN (${idx.map(() => '?').join(',')})`,
        videoId,
        ...idx,
      )
    : [];
  return {
    status: 'done' as const,
    vocabLevel,
    coverage: c.coverage,
    label: c.label,
    totalTokens: c.totalTokens,
    newWords: c.newWords,
    learningWords: c.learningWords,
    topNew: c.topNew.map((w) => {
      const s = sentences.find((x) => x.idx === w.s);
      return { word: w.w, count: w.n, level: estimateLevel(w.w, w.f), sentence: s?.text ?? null, time: s?.start ?? null };
    }),
  };
}

/** Độ khó (chỉ những video đã phân tích) cho danh sách thẻ video. */
export function batchDifficulty(ids: string[]) {
  if (!ids.length) return {};
  const rows = all<LexRow>(`SELECT * FROM video_lexicon WHERE token_count > 0 AND video_id IN (${ids.map(() => '?').join(',')})`, ...ids);
  if (!rows.length) return {};
  const notebook = notebookMap();
  const vocabLevel = getSettings().vocabLevel;
  const out: Record<string, { coverage: number; label: string; newWords: number }> = {};
  for (const r of rows) {
    const c = coverageFor(r, notebook, vocabLevel);
    out[r.video_id] = { coverage: c.coverage, label: c.label, newWords: c.newWords };
  }
  return out;
}

// ---------- Gợi ý video vừa sức ----------

let channelPool: { at: number; ids: string[] } = { at: 0, ids: [] };

async function refreshChannelPool() {
  if (Date.now() - channelPool.at < 6 * 3600_000 && channelPool.ids.length) return channelPool.ids;
  const ids: string[] = [];
  for (const ch of shuffle(CURATED_CHANNELS).slice(0, 4)) {
    try {
      const page = await getChannelVideos(ch.id);
      for (const v of page.items.slice(0, 8)) {
        if (v.durationSec && (v.durationSec < 90 || v.durationSec > 25 * 60)) continue;
        upsertVideoMeta({ id: v.id, title: v.title, channelId: v.channel?.id ?? ch.id, channelName: v.channel?.name ?? ch.name, duration: v.durationSec, thumbnail: v.thumbnail });
        ids.push(v.id);
      }
    } catch {
      /* kênh lỗi: bỏ qua */
    }
  }
  channelPool = { at: Date.now(), ids };
  return ids;
}

interface MetaRow {
  id: string;
  title: string;
  channel_name: string | null;
  duration: number;
  thumbnail: string | null;
}

export async function recommended() {
  const uid = currentUserId();
  const mine = all<{ video_id: string }>(
    'SELECT video_id FROM user_videos WHERE user_id = ? ORDER BY COALESCE(last_watched_at, created_at) DESC LIMIT 40',
    uid,
  ).map((r) => r.video_id);
  const pool = await refreshChannelPool().catch(() => [] as string[]);
  const candidates = [...new Set([...mine, ...pool])];
  // Phân tích nền dần dần (mỗi lần gọi tối đa 6 video mới)
  const analyzed = new Set(
    candidates.length
      ? all<{ video_id: string }>(`SELECT video_id FROM video_lexicon WHERE video_id IN (${candidates.map(() => '?').join(',')})`, ...candidates).map((r) => r.video_id)
      : [],
  );
  candidates.filter((id) => !analyzed.has(id)).slice(0, 6).forEach((id) => enqueue(id));

  const diff = batchDifficulty(candidates);
  const metas = candidates.length
    ? all<MetaRow>(`SELECT id, title, channel_name, duration, thumbnail FROM videos WHERE id IN (${candidates.map(() => '?').join(',')})`, ...candidates)
    : [];
  const watched = new Set(mine);
  const items = metas
    .filter((m) => diff[m.id])
    .map((m) => ({
      id: m.id,
      title: m.title,
      channelName: m.channel_name,
      durationSec: m.duration,
      thumbnail: m.thumbnail ?? `https://i.ytimg.com/vi/${m.id}/mqdefault.jpg`,
      watched: watched.has(m.id),
      ...diff[m.id],
    }));
  const target = 0.965;
  items.sort((a, b) => Math.abs(a.coverage - target) - Math.abs(b.coverage - target));
  return {
    vocabLevel: getSettings().vocabLevel,
    fit: items.filter((i) => i.label === 'fit'),
    easy: items.filter((i) => i.label === 'easy'),
    hard: items.filter((i) => i.label === 'hard'),
    analyzing: [...jobs.values()].filter((j) => j.status !== 'error').length,
  };
}

/** Video gợi ý cho kế hoạch hôm nay: video đang xem dở vừa sức, rồi video vừa sức chưa xem. */
export function pickTodayVideo(): string | null {
  const uid = currentUserId();
  const inProgress = all<{ video_id: string }>(
    `SELECT uv.video_id FROM user_videos uv JOIN videos v ON v.id = uv.video_id
      WHERE uv.user_id = ? AND uv.last_watched_at IS NOT NULL AND v.duration > 0 AND uv.last_position < v.duration * 0.9
      ORDER BY uv.last_watched_at DESC LIMIT 10`,
    uid,
  ).map((r) => r.video_id);
  const diff = batchDifficulty(inProgress);
  const fitInProgress = inProgress.find((id) => diff[id] && diff[id].label !== 'hard');
  if (fitInProgress) return fitInProgress;
  const rows = all<LexRow>('SELECT * FROM video_lexicon WHERE token_count > 0 ORDER BY created_at DESC LIMIT 80');
  const notebook = notebookMap();
  const vocabLevel = getSettings().vocabLevel;
  const watched = new Set(all<{ video_id: string }>('SELECT video_id FROM user_videos WHERE user_id = ?', uid).map((r) => r.video_id));
  const fits = rows
    .filter((r) => !watched.has(r.video_id))
    .map((r) => ({ id: r.video_id, c: coverageFor(r, notebook, vocabLevel).coverage }))
    .filter((x) => x.c >= 0.95 && x.c < 0.99)
    .sort((a, b) => Math.abs(a.c - 0.965) - Math.abs(b.c - 0.965));
  return fits[0]?.id ?? inProgress[0] ?? null;
}
