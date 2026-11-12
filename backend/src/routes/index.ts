import express, { Router, type Request, type Response } from 'express';
import { Rating } from 'ts-fsrs';
import { z } from 'zod';
import * as difficulty from '../services/difficulty.service.ts';
import * as fluency from '../services/fluency.service.ts';
import { lookupTerm } from '../services/lookup.service.ts';
import * as phrases from '../services/phrases.service.ts';
import * as placement from '../services/placement.service.ts';
import * as practice from '../services/practice.service.ts';
import * as push from '../services/push.service.ts';
import * as review from '../services/review.service.ts';
import { listUsers, setUserRole } from '../services/auth.service.ts';
import { getServerSettings, hymtKeyFor, publicServerSettings, updateServerSettings } from '../services/server-settings.service.ts';
import { getSettings, publicSettings, updateSettings } from '../services/settings.service.ts';
import { requireAdmin } from './auth.ts';
import { upgradeBasics, wordProfile } from '../services/profile.service.ts';
import * as speaking from '../services/speaking.service.ts';
import { overview } from '../services/stats.service.ts';
import * as today from '../services/today.service.ts';
import * as topics from '../services/topics.service.ts';
import { providerStatus, resolveProvider, translateBatch, translateText } from '../services/translate/index.ts';
import { hymtHealth } from '../services/translate/hymt.ts';
import * as transcripts from '../services/transcript.service.ts';
import * as videos from '../services/videos.service.ts';
import { warmup } from '../services/warmup.service.ts';
import * as words from '../services/words.service.ts';
import * as yt from '../services/youtube.service.ts';

export const api = Router();

const videoId = z.string().regex(/^[\w-]{11}$/, 'ID video không hợp lệ');
const idParam = (req: Request) => z.coerce.number().int().positive().parse(req.params.id);
/** Người gọi là quản trị viên? (phiên đăng nhập do middleware xác thực gắn vào res.locals) */
const isAdmin = (res: Response) => (res.locals.session as { user?: { role?: string } } | undefined)?.user?.role === 'admin';

// ---------- YouTube ----------

api.get('/youtube/chips', (_req, res) => {
  res.json(yt.FEED_CHIPS.map(({ key, label }) => ({ key, label })));
});

api.get('/youtube/feed', async (req, res) => {
  const q = z.object({ chip: z.string().default('all'), cursor: z.string().optional() }).parse(req.query);
  res.json(await yt.getFeed(q.chip, q.cursor));
});

api.get('/youtube/search', async (req, res) => {
  const q = z
    .object({
      q: z.string().trim().min(1).max(200),
      cursor: z.string().optional(),
      duration: z.enum(['short', 'medium', 'long']).optional(),
      uploadDate: z.enum(['today', 'week', 'month', 'year']).optional(),
      sortBy: z.enum(['relevance', 'upload_date', 'view_count', 'rating']).optional(),
      captions: z.enum(['0', '1']).optional(),
    })
    .parse(req.query);
  res.json(
    await yt.searchVideos(q.q, { duration: q.duration, uploadDate: q.uploadDate, sortBy: q.sortBy, captionsOnly: q.captions !== '0' }, q.cursor),
  );
});

api.get('/youtube/suggest', async (req, res) => {
  res.json(await yt.searchSuggestions(String(req.query.q ?? '')));
});

api.get('/youtube/channels', async (_req, res) => {
  res.json(await yt.getCuratedChannels());
});

api.get('/youtube/channels/:id/videos', async (req, res) => {
  const id = z.string().regex(/^UC[\w-]{22}$/).parse(req.params.id);
  res.json(await yt.getChannelVideos(id, req.query.cursor ? String(req.query.cursor) : undefined));
});

api.get('/youtube/videos/:id', async (req, res) => {
  res.json(await yt.getVideoDetails(videoId.parse(req.params.id)));
});

api.get('/youtube/related', async (req, res) => {
  res.json(await yt.getRelated(z.string().min(1).parse(req.query.cursor)));
});

api.get('/youtube/videos/:id/transcript', async (req, res) => {
  const q = z.object({ track: z.string().max(40).optional(), refresh: z.enum(['0', '1']).optional() }).parse(req.query);
  res.json(await transcripts.getTranscript(videoId.parse(req.params.id), { trackId: q.track, refresh: q.refresh === '1' }));
});

api.post('/youtube/videos/:id/transcript', async (req, res) => {
  const body = z.object({ content: z.string().min(10).max(2_000_000) }).parse(req.body);
  res.json(transcripts.saveUploadedTranscript(videoId.parse(req.params.id), body.content));
});

api.delete('/youtube/videos/:id/transcript', async (req, res) => {
  transcripts.deleteUploadedTranscript(videoId.parse(req.params.id));
  res.json({ ok: true });
});

// ---------- Video của tôi (lịch sử, đã lưu, ghi chú, tiến độ) ----------

api.get('/videos', (req, res) => {
  const filter = req.query.filter === 'saved' ? 'saved' : 'history';
  res.json(videos.listVideos(filter));
});

api.get('/videos/recommended', async (_req, res) => {
  res.json(await difficulty.recommended());
});

api.get('/videos/:id/difficulty', (req, res) => {
  res.json(difficulty.getDifficulty(videoId.parse(req.params.id)));
});

api.get('/videos/:id', (req, res) => {
  res.json(videos.getVideoState(videoId.parse(req.params.id)));
});

api.post('/videos/:id/progress', (req, res) => {
  res.json(videos.recordProgress(videoId.parse(req.params.id), videos.progressSchema.parse(req.body)));
});

api.put('/videos/:id/saved', (req, res) => {
  const body = z
    .object({ saved: z.boolean(), title: z.string().optional(), channelName: z.string().optional(), durationSec: z.number().optional() })
    .parse(req.body);
  res.json(videos.setSaved(videoId.parse(req.params.id), body.saved, body));
});

api.delete('/videos/:id/history', (req, res) => {
  videos.removeFromHistory(videoId.parse(req.params.id));
  res.json({ ok: true });
});

api.post('/videos/:id/practice', (req, res) => {
  res.json(videos.recordSentencePractice(videoId.parse(req.params.id), videos.practiceSchema.parse(req.body)));
});

api.get('/videos/:id/notes', (req, res) => {
  res.json(videos.listNotes(videoId.parse(req.params.id)));
});

api.post('/videos/:id/notes', (req, res) => {
  res.json(videos.addNote(videoId.parse(req.params.id), videos.noteSchema.parse(req.body)));
});

api.delete('/videos/:id/notes/:noteId', (req, res) => {
  videos.deleteNote(videoId.parse(req.params.id), z.coerce.number().int().parse(req.params.noteId));
  res.json({ ok: true });
});

// ---------- Dịch & tra từ ----------

api.get('/lookup', async (req, res) => {
  const q = z.object({ term: z.string().trim().min(1).max(200), context: z.string().max(1000).optional() }).parse(req.query);
  res.json(await lookupTerm(q.term, q.context));
});

api.post('/translate', async (req, res) => {
  const body = z
    .object({
      text: z.string().trim().min(1).max(5000),
      from: z.string().max(10).optional(),
      to: z.string().max(10).optional(),
      context: z.string().max(2000).optional(),
      provider: z.enum(['auto', 'google', 'hymt']).optional(),
    })
    .parse(req.body);
  res.json(await translateText(body.text, body));
});

api.post('/translate/batch', async (req, res) => {
  const body = z
    .object({
      texts: z.array(z.string().max(2000)).min(1).max(200),
      from: z.string().max(10).optional(),
      to: z.string().max(10).optional(),
      provider: z.enum(['auto', 'google', 'hymt']).optional(),
    })
    .parse(req.body);
  res.json(await translateBatch(body.texts, body));
});

api.get('/translate/providers', (_req, res) => {
  const s = getSettings();
  res.json({
    active: resolveProvider(),
    setting: s.translateProvider,
    hymtConfigured: Boolean(s.hymtBaseUrl && s.hymtModel),
    ...providerStatus(),
  });
});

// Kiểm tra kết nối mô hình AI: chỉ admin (máy chủ sẽ gọi tới địa chỉ được nhập)
api.post('/translate/hymt/test', requireAdmin, async (req, res) => {
  const body = z
    .object({
      hymtBaseUrl: z.string().optional(),
      hymtModel: z.string().optional(),
      hymtApiKey: z.string().optional(),
      hymtPromptStyle: z.enum(['hymt2', 'hymt15']).optional(),
    })
    .parse(req.body ?? {});
  const s = getServerSettings();
  const baseUrl = (body.hymtBaseUrl ?? s.hymtBaseUrl).trim();
  res.json(
    await hymtHealth({
      hymtBaseUrl: baseUrl,
      hymtModel: body.hymtModel ?? s.hymtModel,
      hymtApiKey: hymtKeyFor(baseUrl, body.hymtApiKey),
      hymtPromptStyle: body.hymtPromptStyle ?? s.hymtPromptStyle,
    }),
  );
});

// ---------- Sổ từ vựng ----------

api.get('/words', (req, res) => {
  res.json(words.listWords(words.listSchema.parse(req.query)));
});

api.get('/words/keys', (_req, res) => {
  res.json(words.wordKeys());
});

api.get('/words/tags', (_req, res) => {
  res.json(words.allTags());
});

api.get('/words/export', (req, res) => {
  const format = req.query.format === 'anki' ? 'anki' : 'csv';
  const content = words.exportWords(format);
  res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'text/tab-separated-values; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ielts-vocab.${format === 'csv' ? 'csv' : 'txt'}"`);
  res.send(content);
});

api.post('/words', async (req, res) => {
  const result = await words.createWord(words.createSchema.parse(req.body));
  res.status(result.existed ? 200 : 201).json(result);
});

api.post('/words/bulk', (req, res) => {
  res.json(words.bulkAction(words.bulkSchema.parse(req.body)));
});

api.get('/words/:id', (req, res) => {
  res.json(words.getWord(idParam(req)));
});

api.patch('/words/:id', (req, res) => {
  res.json(words.updateWord(idParam(req), words.updateSchema.parse(req.body)));
});

api.delete('/words/:id', (req, res) => {
  words.deleteWord(idParam(req));
  res.json({ ok: true });
});

api.post('/words/:id/reset', (req, res) => {
  res.json(words.resetWord(idParam(req)));
});

api.get('/words/:id/occurrences', (req, res) => {
  res.json(words.wordOccurrences(idParam(req)));
});

// ---------- Ôn tập (FSRS) ----------

api.get('/review/queue', (req, res) => {
  const q = z
    .object({ limit: z.coerce.number().int().min(1).max(500).optional(), topicId: z.coerce.number().int().optional(), includeNew: z.enum(['0', '1']).optional() })
    .parse(req.query);
  const words = review.getQueue({ limit: q.limit, topicId: q.topicId, includeNew: q.includeNew !== '0' });
  // Thẻ mẫu câu ôn chung hàng đợi (trừ khi đang lọc theo chủ đề)
  res.json({ ...words, phrases: q.topicId ? [] : phrases.phraseQueue(q.limit ?? 100), phraseSummary: phrases.phraseSummary() });
});

api.get('/review/summary', (_req, res) => {
  res.json(review.reviewSummary());
});

// Lượt "khởi động" khi mở app: vài thẻ sắp quên + từ học tối qua (buổi sáng)
api.get('/review/warmup', (_req, res) => {
  res.json(warmup());
});

api.post('/review/undo', (_req, res) => {
  // Hoàn tác lượt mới nhất, dù là thẻ từ hay thẻ mẫu câu
  const p = phrases.lastPhraseLog();
  const w = review.lastWordReviewAt();
  if (p && (!w || p.reviewed_at > w)) {
    res.json({ card: null, phrase: phrases.undoPhraseLog(p) });
    return;
  }
  res.json({ card: review.undoLastReview(), phrase: null });
});

api.post('/review/:id', (req, res) => {
  const body = z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), mode: z.string().max(30).optional() }).parse(req.body);
  const grades = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
  res.json(review.applyRating(idParam(req), grades[body.rating - 1], body.mode ?? 'flashcard'));
});

api.get('/words/profile/:term', async (req, res) => {
  res.json(await wordProfile(z.string().trim().min(1).max(80).parse(req.params.term)));
});

// ---------- Mẫu câu & cụm từ ----------

api.get('/phrases', (req, res) => {
  res.json(phrases.listPhrases(phrases.listSchema.parse(req.query)));
});

api.get('/phrases/suggest', (req, res) => {
  res.json(phrases.suggestChunks(z.string().trim().min(1).max(600).parse(req.query.sentence)));
});

api.get('/phrases/video/:videoId', (req, res) => {
  res.json(phrases.videoPhraseKeys(videoId.parse(req.params.videoId)));
});

api.post('/phrases', async (req, res) => {
  const result = await phrases.createPhrase(phrases.createSchema.parse(req.body));
  res.status(result.existed ? 200 : 201).json(result);
});

api.patch('/phrases/:id', async (req, res) => {
  res.json(await phrases.updatePhrase(idParam(req), phrases.updateSchema.parse(req.body)));
});

api.delete('/phrases/:id', (req, res) => {
  phrases.deletePhrase(idParam(req));
  res.json({ ok: true });
});

api.post('/phrases/:id/review', (req, res) => {
  const body = z.object({ rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), mode: z.string().max(30).optional() }).parse(req.body);
  const grades = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
  res.json(phrases.ratePhrase(idParam(req), grades[body.rating - 1], body.mode ?? 'flashcard'));
});

// ---------- Luyện nói lại ----------

api.get('/speaking/session', (req, res) => {
  res.json(speaking.createSession(speaking.sessionSchema.parse(req.query)));
});

api.get('/speaking/stats', (_req, res) => {
  res.json(speaking.stats());
});

api.post('/speaking/attempts', (req, res) => {
  res.json(speaking.recordAttempt(speaking.attemptSchema.parse(req.body)));
});

api.post('/speaking/own-example', async (req, res) => {
  res.json(await speaking.saveOwnExample(speaking.ownExampleSchema.parse(req.body)));
});

// ---------- Nói trôi chảy 4/3/2 ----------

api.get('/fluency/topics', (_req, res) => {
  res.json(fluency.listTopics());
});

api.get('/fluency/sessions', (_req, res) => {
  res.json({ sessions: fluency.listSessions(), trend: fluency.trend() });
});

api.post('/fluency/sessions', (req, res) => {
  res.status(201).json(fluency.createSession(fluency.createSchema.parse(req.body)));
});

api.get('/fluency/sessions/:id', (req, res) => {
  res.json(fluency.getSession(idParam(req)));
});

api.patch('/fluency/sessions/:id', (req, res) => {
  res.json(fluency.updateNotes(idParam(req), fluency.notesSchema.parse(req.body).notes));
});

api.delete('/fluency/sessions/:id', (req, res) => {
  fluency.deleteSession(idParam(req));
  res.json({ ok: true });
});

api.post('/fluency/sessions/:id/rounds', (req, res) => {
  res.json(fluency.saveRound(idParam(req), fluency.roundSchema.parse(req.body)));
});

// Ghi âm gửi dạng nhị phân (audio/webm…), tối đa 40 MB (~ 40 phút)
api.put('/fluency/rounds/:id/audio', express.raw({ type: 'audio/*', limit: '40mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw Object.assign(new Error('Thiếu dữ liệu ghi âm'), { status: 400 });
  res.json(fluency.saveAudio(idParam(req), req.body, String(req.headers['content-type'] ?? '')));
});

api.get('/fluency/rounds/:id/audio', (req, res) => {
  res.sendFile(fluency.audioPath(idParam(req)));
});

// ---------- Độ khó video & gợi ý ----------

api.post('/videos/difficulty', (req, res) => {
  const body = z.object({ ids: z.array(videoId).max(100) }).parse(req.body);
  res.json(difficulty.batchDifficulty(body.ids));
});

// ---------- Hôm nay học gì ----------

api.get('/today', (_req, res) => {
  res.json(today.todayPlan());
});

api.post('/today/skip', (req, res) => {
  const body = today.skipSchema.parse(req.body);
  res.json(today.setSkipped(body.step, body.skipped));
});

api.put('/today/video', (req, res) => {
  res.json(today.setTodayVideo(today.videoSchema.parse(req.body).videoId));
});

// ---------- Thông báo đẩy (Web Push) ----------

api.get('/push/public-key', (_req, res) => {
  res.json({ publicKey: push.getVapid().publicKey, ...push.status() });
});

api.post('/push/subscribe', (req, res) => {
  res.json(push.subscribe(push.subscriptionSchema.parse(req.body), String(req.headers['user-agent'] ?? '')));
});

api.post('/push/unsubscribe', (req, res) => {
  res.json(push.unsubscribe(z.object({ endpoint: z.string().max(2000) }).parse(req.body).endpoint));
});

api.post('/push/test', async (_req, res) => {
  res.json(await push.sendTest());
});

// ---------- Bài test ước lượng vốn từ ----------

api.get('/placement/test', (_req, res) => {
  res.json(placement.createTest());
});

api.get('/placement/last', (_req, res) => {
  res.json(placement.lastResult());
});

api.post('/placement/result', (req, res) => {
  res.json(placement.submitResult(placement.resultSchema.parse(req.body)));
});

// ---------- Luyện tập ----------

api.get('/practice/upgrades', (_req, res) => {
  res.json(upgradeBasics());
});

api.get('/practice/session', async (req, res) => {
  res.json(await practice.createSession(practice.sessionSchema.parse(req.query)));
});

api.post('/practice/answer', (req, res) => {
  res.json(practice.recordAnswer(practice.answerSchema.parse(req.body)));
});

api.post('/practice/complete', (req, res) => {
  res.json(practice.completeSession(practice.completeSchema.parse(req.body)));
});

// ---------- Bộ từ theo chủ đề ----------

api.get('/topics', (_req, res) => {
  res.json(topics.listTopics(isAdmin(res)));
});

const topicInput = z.object({
  name: z.string().trim().min(1, 'Hãy đặt tên cho bộ từ').max(60),
  nameVi: z.string().trim().max(60).optional(),
  description: z.string().trim().max(200).optional(),
  icon: z.string().trim().max(16).optional(),
  color: z.string().trim().max(20).optional(),
});

// "Bộ từ của tôi" (mặc định) hoặc bộ chung cho mọi người (shared — chỉ admin)
api.post('/topics', (req, res) => {
  const body = topicInput.extend({ shared: z.boolean().optional() }).parse(req.body ?? {});
  res.status(201).json(topics.createTopic(body, isAdmin(res)));
});

api.get('/topics/:slug', (req, res) => {
  res.json(topics.getTopic(String(req.params.slug), isAdmin(res)));
});

api.patch('/topics/:slug', (req, res) => {
  res.json(topics.updateTopic(String(req.params.slug), topicInput.partial().parse(req.body ?? {}), isAdmin(res)));
});

api.delete('/topics/:slug', (req, res) => {
  res.json(topics.deleteTopic(String(req.params.slug), isAdmin(res)));
});

// Thêm một từ/cụm từ vào bộ (tự tra nghĩa, phiên âm, ví dụ nếu kho từ chưa có)
api.post('/topics/:slug/entries', async (req, res) => {
  const body = z
    .object({ term: z.string().trim().min(1).max(80), group: z.enum(['core', 'related', 'advanced']).optional() })
    .parse(req.body ?? {});
  res.json(await topics.addTopicEntry(String(req.params.slug), body.term, { group: body.group }, isAdmin(res)));
});

api.delete('/topics/:slug/entries/:id', (req, res) => {
  res.json(topics.removeTopicEntry(String(req.params.slug), idParam(req), isAdmin(res)));
});

api.post('/topics/:slug/words', (req, res) => {
  const body = z.object({ lexiconIds: z.array(z.number().int()).max(1000).optional(), known: z.boolean().optional() }).parse(req.body ?? {});
  res.json(topics.addTopicWords(String(req.params.slug), body));
});

api.get('/lexicon/:id', (req, res) => {
  res.json(topics.getLexiconEntry(idParam(req)));
});

// ---------- Thống kê & cài đặt ----------

api.get('/stats/overview', (_req, res) => {
  res.json(overview());
});

// ---------- Quản trị (chỉ admin) ----------

api.get('/admin/settings', requireAdmin, (_req, res) => {
  res.json(publicServerSettings());
});

api.put('/admin/settings', requireAdmin, (req, res) => {
  res.json(updateServerSettings(req.body ?? {}));
});

api.get('/admin/users', requireAdmin, (_req, res) => {
  res.json(listUsers());
});

api.patch('/admin/users/:id', requireAdmin, (req, res) => {
  res.json(setUserRole(Number(req.params.id), req.body ?? {}));
});

api.get('/settings', (_req, res) => {
  res.json(publicSettings());
});

api.put('/settings', (req, res) => {
  updateSettings(req.body ?? {});
  res.json(publicSettings());
});
