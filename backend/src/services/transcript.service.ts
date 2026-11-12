import { all, get, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { dedupe, fetchText } from '../lib/http.ts';
import { inflectionRegex } from '../lib/text.ts';
import { getYt, thumbFor, upsertVideoMeta } from './youtube.service.ts';

export interface TWord {
  w: string;
  s: number;
  e: number;
}

export interface Sentence {
  i: number;
  start: number;
  end: number;
  text: string;
  words: TWord[];
}

export interface CaptionTrack {
  id: string;
  lang: string;
  name: string;
  kind: 'manual' | 'asr';
}

export interface Transcript {
  videoId: string;
  kind: 'manual' | 'asr' | 'upload';
  trackId: string;
  trackName: string;
  wordTimed: boolean;
  sentences: Sentence[];
  tracks: CaptionTrack[];
}

class TranscriptError extends Error {
  status = 404;
}

// ---------- Lấy caption track ----------

interface RawTrack extends CaptionTrack {
  baseUrl: string;
}

/**
 * Client WEB trả URL phụ đề cần PO token (trả rỗng). Client ANDROID/IOS trả URL dùng được ngay,
 * nên thử lần lượt các client này.
 */
async function fetchTracks(videoId: string) {
  const yt = await getYt();
  let lastErr: unknown;
  for (const client of ['ANDROID', 'IOS'] as const) {
    try {
      const info = (await yt.getBasicInfo(videoId, { client })) as Record<string, any>;
      const tracks: RawTrack[] = (info.captions?.caption_tracks ?? []).map((t: Record<string, any>) => ({
        id: t.vss_id as string,
        lang: t.language_code as string,
        name: String(t.name?.toString?.() ?? t.language_code),
        kind: t.kind === 'asr' ? 'asr' : 'manual',
        baseUrl: t.base_url as string,
      }));
      const b = info.basic_info ?? {};
      if (b.title) {
        upsertVideoMeta({ id: videoId, title: b.title, channelId: b.channel_id, channelName: b.author, duration: b.duration });
      }
      if (tracks.length) return { tracks, client };
      if (info.playability_status?.status && info.playability_status.status !== 'OK') {
        lastErr = new TranscriptError(`Video không phát được: ${info.playability_status.reason ?? info.playability_status.status}`);
        continue;
      }
      return { tracks, client };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new TranscriptError('Không lấy được thông tin phụ đề');
}

function isEnglish(t: CaptionTrack) {
  return t.lang === 'en' || t.lang.startsWith('en-');
}

function pickTrack(tracks: RawTrack[]): RawTrack | undefined {
  const en = tracks.filter(isEnglish);
  return (
    en.find((t) => t.kind === 'manual' && t.lang === 'en') ??
    en.find((t) => t.kind === 'manual') ??
    en.find((t) => t.kind === 'asr')
  );
}

// ---------- Chuyển json3 → danh sách từ có mốc thời gian ----------

interface Json3 {
  events?: { tStartMs?: number; dDurationMs?: number; aAppend?: number; segs?: { utf8?: string; tOffsetMs?: number }[] }[];
}

const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)|♪+|♫+|^>>\s*|\s>>\s*/g;

function cleanCueText(text: string) {
  return text
    .replace(/\n/g, ' ')
    .replace(NON_SPEECH, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateWordDuration(w: string) {
  return Math.min(1.2, 0.12 + w.length * 0.065);
}

/** Phân bổ thời gian của một cue cho từng từ theo độ dài ký tự. */
function distribute(text: string, start: number, end: number): TWord[] {
  const tokens = text.split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const weights = tokens.map((t) => t.length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const dur = Math.max(0.2, end - start);
  let acc = 0;
  return tokens.map((w, k) => {
    const s = start + (dur * acc) / total;
    acc += weights[k];
    return { w, s: round(s), e: round(start + (dur * acc) / total) };
  });
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function wordsFromJson3(json: Json3): { words: TWord[]; wordTimed: boolean } {
  const events = (json.events ?? []).filter((e) => e.segs?.some((s) => (s.utf8 ?? '').trim()));
  const wordTimed = events.some((e) => (e.segs?.length ?? 0) > 1 && e.segs!.some((s) => s.tOffsetMs != null));

  if (!wordTimed) {
    const words = events.flatMap((e) => {
      const start = (e.tStartMs ?? 0) / 1000;
      const end = start + (e.dDurationMs ?? 2000) / 1000;
      return distribute(cleanCueText(e.segs!.map((s) => s.utf8 ?? '').join('')), start, end);
    });
    return { words: words.sort((a, b) => a.s - b.s), wordTimed: false };
  }

  // Phụ đề tự động: mỗi seg là một từ với tOffsetMs
  const raw: { w: string; s: number; eventEnd: number }[] = [];
  for (const e of events) {
    const t0 = e.tStartMs ?? 0;
    const eventEnd = (t0 + (e.dDurationMs ?? 0)) / 1000;
    for (const seg of e.segs!) {
      const text = cleanCueText(seg.utf8 ?? '');
      if (!text) continue;
      const pieces = text.split(' ');
      const s = (t0 + (seg.tOffsetMs ?? 0)) / 1000;
      pieces.forEach((w, k) => raw.push({ w, s: s + k * 0.05, eventEnd }));
    }
  }
  raw.sort((a, b) => a.s - b.s);
  const words = raw.map((r, k) => {
    const next = raw[k + 1];
    const natural = r.s + estimateWordDuration(r.w);
    const e = Math.min(next ? next.s : r.eventEnd, natural, r.eventEnd > r.s ? r.eventEnd : natural);
    return { w: r.w, s: round(r.s), e: round(Math.max(e, r.s + 0.1)) };
  });
  return { words, wordTimed: true };
}

// ---------- Tách câu ----------

const ABBREV = /^(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|No|Jr|Sr|Mt|approx)\.$/i;

function makeSentence(words: TWord[], i: number): Sentence {
  let text = words.map((w) => w.w).join(' ');
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return { i, start: words[0].s, end: words[words.length - 1].e, text, words };
}

export function segmentSentences(words: TWord[]): Sentence[] {
  if (!words.length) return [];
  const punctRatio = words.filter((w) => /[.!?,;:]["'”’)]*$/.test(w.w)).length / words.length;
  const punctuated = punctRatio > 0.03;
  const groups: TWord[][] = [];
  let cur: TWord[] = [];
  const flush = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };

  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const next = words[k + 1];
    cur.push(w);
    if (!next) break;
    const gap = next.s - w.e;
    const n = cur.length;
    const dur = w.e - cur[0].s;
    const endsSentence = /[.!?…]["'”’)]*$/.test(w.w) && !ABBREV.test(w.w);

    if (punctuated) {
      if (endsSentence) flush();
      else if (gap > 1.5 && n >= 3) flush();
      else if (n >= 24 && /[,;:—–]$/.test(w.w)) flush();
      else if (n >= 38 || dur > 15) flush();
    } else {
      // Phụ đề tự động không có dấu câu: tách theo khoảng lặng và độ dài
      if (gap > 0.8 && n >= 3) flush();
      else if (n >= 8 && gap > 0.4) flush();
      else if (n >= 16 || dur > 8) {
        // cắt tại khoảng lặng lớn nhất trong phần sau của câu
        let best = cur.length - 1;
        let bestGap = -1;
        for (let j = 6; j < cur.length - 1; j++) {
          const g = cur[j + 1].s - cur[j].e;
          if (g > bestGap) {
            bestGap = g;
            best = j;
          }
        }
        const rest = cur.slice(best + 1);
        cur = cur.slice(0, best + 1);
        flush();
        cur = rest;
      }
    }
  }
  flush();

  // Gộp câu quá ngắn ("Okay." "Yeah.") vào câu sau nếu liền mạch
  const merged: TWord[][] = [];
  for (let k = 0; k < groups.length; k++) {
    const g = groups[k];
    const next = groups[k + 1];
    if (next && g.length <= 2 && next[0].s - g[g.length - 1].e < 0.35 && g.length + next.length <= 30) {
      groups[k + 1] = [...g, ...next];
      continue;
    }
    merged.push(g);
  }
  return merged.map((g, i) => makeSentence(g, i));
}

// ---------- File phụ đề người dùng tải lên (SRT / VTT) ----------

function parseTimestamp(t: string): number {
  const m = t.trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

export function parseSubtitleFile(content: string): TWord[] {
  const blocks = content.replace(/\r/g, '').replace(/^WEBVTT.*\n/, '').split(/\n{2,}/);
  const words: TWord[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx < 0) continue;
    const [a, b] = lines[timeIdx].split('-->');
    const start = parseTimestamp(a);
    const end = parseTimestamp(b);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const text = cleanCueText(
      lines
        .slice(timeIdx + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\{\\[^}]+\}/g, ''),
    );
    words.push(...distribute(text, start, end));
  }
  return words.sort((x, y) => x.s - y.s);
}

// ---------- Lưu trữ ----------

function save(t: Transcript, slot: string) {
  tx(() => {
    run(
      `INSERT INTO transcripts (video_id, lang, kind, track_name, data, fetched_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(video_id, lang) DO UPDATE SET kind = excluded.kind, track_name = excluded.track_name,
         data = excluded.data, fetched_at = excluded.fetched_at`,
      t.videoId,
      slot,
      t.kind,
      t.trackName,
      JSON.stringify(t),
    );
    // Chỉ index bản transcript đang dùng để tìm kiếm ví dụ
    run('DELETE FROM transcript_sentences WHERE video_id = ?', t.videoId);
    for (const s of t.sentences) {
      run('INSERT INTO transcript_sentences (video_id, idx, start, end, text) VALUES (?, ?, ?, ?, ?)', t.videoId, s.i, s.start, s.end, s.text);
    }
  });
}

function load(videoId: string, slot: string): Transcript | undefined {
  const row = get<{ data: string }>('SELECT data FROM transcripts WHERE video_id = ? AND lang = ?', videoId, slot);
  return row ? (JSON.parse(row.data) as Transcript) : undefined;
}

/*
 * Phụ đề tải lên là của riêng từng tài khoản. Bảng transcripts không có cột user_id (khoá chính video_id + lang)
 * nên lưu ở ô `upload:<userId>`. Ô 'upload' dùng chung là dữ liệu của bản cũ — chỉ còn đọc để tương thích.
 */
const LEGACY_UPLOAD = 'upload';
const uploadSlot = (userId: number) => `upload:${userId}`;

/** Người dùng của request hiện tại, hoặc null khi chạy ngoài request (vd. hàng đợi phân tích độ khó). */
function userIdOrNull(): number | null {
  try {
    return currentUserId();
  } catch {
    return null;
  }
}

const once = dedupe<Transcript>();

export async function getTranscript(videoId: string, opts: { trackId?: string; refresh?: boolean } = {}): Promise<Transcript> {
  if (!opts.refresh) {
    if (!opts.trackId) {
      const uid = userIdOrNull();
      const uploaded = (uid !== null ? load(videoId, uploadSlot(uid)) : undefined) ?? load(videoId, LEGACY_UPLOAD);
      if (uploaded) return uploaded;
    }
    const cached = load(videoId, opts.trackId ?? 'default');
    if (cached) return cached;
  }

  return once(`${videoId}|${opts.trackId ?? ''}`, async () => {
    const { tracks } = await fetchTracks(videoId);
    const publicTracks: CaptionTrack[] = tracks.filter(isEnglish).map(({ baseUrl: _b, ...t }) => t);
    const track = opts.trackId ? tracks.find((t) => t.id === opts.trackId) : pickTrack(tracks);
    if (!track) {
      throw new TranscriptError(
        tracks.length
          ? 'Video không có phụ đề tiếng Anh. Bạn có thể tải lên file phụ đề (.srt/.vtt).'
          : 'Video không có phụ đề. Bạn có thể tải lên file phụ đề (.srt/.vtt).',
      );
    }
    const url = track.baseUrl.replace(/&fmt=[^&]*/g, '') + '&fmt=json3';
    const body = await fetchText(url, { timeoutMs: 20000 });
    if (!body.trim()) throw new TranscriptError('YouTube trả về phụ đề rỗng, hãy thử lại sau.');
    const { words, wordTimed } = wordsFromJson3(JSON.parse(body) as Json3);
    const sentences = segmentSentences(words);
    if (!sentences.length) throw new TranscriptError('Phụ đề không có nội dung lời nói.');
    const transcript: Transcript = {
      videoId,
      kind: track.kind,
      trackId: track.id,
      trackName: track.name,
      wordTimed,
      sentences,
      tracks: publicTracks,
    };
    save(transcript, opts.trackId ?? 'default');
    return transcript;
  });
}

export function saveUploadedTranscript(videoId: string, content: string): Transcript {
  const words = parseSubtitleFile(content);
  const sentences = segmentSentences(words);
  if (!sentences.length) throw new TranscriptError('Không đọc được file phụ đề (cần định dạng SRT hoặc VTT).');
  const previous = load(videoId, 'default');
  const transcript: Transcript = {
    videoId,
    kind: 'upload',
    trackId: 'upload',
    trackName: 'Phụ đề tải lên',
    wordTimed: false,
    sentences,
    tracks: previous?.tracks ?? [],
  };
  upsertVideoMeta({ id: videoId, thumbnail: thumbFor(videoId) });
  save(transcript, uploadSlot(currentUserId()));
  return transcript;
}

export function deleteUploadedTranscript(videoId: string) {
  const uid = currentUserId();
  tx(() => {
    run('DELETE FROM transcripts WHERE video_id = ? AND lang = ?', videoId, uploadSlot(uid));
    // File tải lên dùng chung của bản cũ: giao lại một bản cho từng tài khoản khác đã mở video này (họ vẫn thấy như trước),
    // rồi mới bỏ bản chung — để người này chuyển về phụ đề YouTube mà không xoá mất phụ đề của người khác
    const legacy = get<{ kind: string; track_name: string | null; data: string; fetched_at: string }>(
      'SELECT kind, track_name, data, fetched_at FROM transcripts WHERE video_id = ? AND lang = ?',
      videoId,
      LEGACY_UPLOAD,
    );
    if (!legacy) return;
    const others = all<{ user_id: number }>('SELECT user_id FROM user_videos WHERE video_id = ? AND user_id != ?', videoId, uid);
    for (const o of others) {
      run(
        `INSERT INTO transcripts (video_id, lang, kind, track_name, data, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(video_id, lang) DO NOTHING`,
        videoId,
        uploadSlot(o.user_id),
        legacy.kind,
        legacy.track_name,
        legacy.data,
        legacy.fetched_at,
      );
    }
    run('DELETE FROM transcripts WHERE video_id = ? AND lang = ?', videoId, LEGACY_UPLOAD);
  });
}

/** Tìm câu chứa từ trong các video đã học (giống YouGlish). */
export function findOccurrences(term: string, limit = 12) {
  const regex = inflectionRegex(term);
  // Lọc thô bằng LIKE theo phần gốc của từ đầu tiên, rồi lọc chính xác bằng regex
  const first = term.trim().split(/\s+/)[0] ?? '';
  const probe = first.length > 4 ? first.slice(0, -1) : first;
  if (!probe) return [];
  const rows = all<{ video_id: string; idx: number; start: number; end: number; text: string; title: string | null }>(
    `SELECT s.video_id, s.idx, s.start, s.end, s.text, v.title
       FROM transcript_sentences s
       JOIN user_videos uv ON uv.video_id = s.video_id AND uv.user_id = ?
       LEFT JOIN videos v ON v.id = s.video_id
      WHERE s.text LIKE ? LIMIT 500`,
    currentUserId(),
    `%${probe}%`,
  );
  return rows.filter((r) => regex.test(r.text)).slice(0, limit);
}
