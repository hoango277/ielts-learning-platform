import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { config } from './config.ts';
import { get } from './db/index.ts';
import { seedTopics } from './db/seed.ts';
import { authRouter, requireAuth, sameOriginGuard } from './routes/auth.ts';
import { api } from './routes/index.ts';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});
app.use('/api', sameOriginGuard);
app.use('/api/auth', authRouter);
// Mọi API còn lại cần đăng nhập
app.use('/api', requireAuth, api);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Không tìm thấy API' });
});

// Bản build frontend (npm run build) được phục vụ cùng cổng
if (fs.existsSync(config.frontendDist)) {
  app.use(express.static(config.frontendDist, { maxAge: '7d', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(config.frontendDist, 'index.html'));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') });
    return;
  }
  const e = err as Error & { status?: number; statusCode?: number };
  const status = e.status ?? e.statusCode ?? 500;
  if (status >= 500) console.error('[api]', e);
  res.status(status).json({ error: e.message || 'Lỗi máy chủ' });
});

// Lần chạy đầu: nạp bộ từ theo chủ đề đã crawl sẵn
const topicCount = get<{ n: number }>('SELECT COUNT(*) AS n FROM topics')!.n;
if (!topicCount && fs.existsSync(config.seedPath)) {
  const r = seedTopics();
  console.log(`[seed] đã nạp ${r.topics} chủ đề, ${r.lexicon} từ`);
}

app.listen(config.port, config.host, () => {
  console.log(`🚀 API sẵn sàng tại http://${config.host}:${config.port}/api`);
  if (fs.existsSync(config.frontendDist)) console.log(`🌐 Giao diện: http://${config.host}:${config.port}`);
});
