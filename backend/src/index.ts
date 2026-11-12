import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { config } from './config.ts';
import { db, get } from './db/index.ts';
import { syncSeed } from './db/seed.ts';
import { authRouter, requireAuth, sameOriginGuard } from './routes/auth.ts';
import { api } from './routes/index.ts';
import { startPushScheduler } from './services/push.service.ts';

const app = express();
app.disable('x-powered-by');
// Chạy sau reverse proxy / Docker: tin X-Forwarded-For từ proxy trong mạng riêng để req.ip là IP thật của người dùng
// (nếu không, mọi người dùng chung một IP → gõ sai mật khẩu 8 lần là khoá luôn chủ tài khoản thật).
app.set('trust proxy', 'loopback, linklocal, uniquelocal');
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '3mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: process.env.APP_VERSION ?? 'dev', time: new Date().toISOString() });
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
  app.use(
    express.static(config.frontendDist, {
      index: false,
      setHeaders(res, file) {
        const name = path.basename(file);
        // File có mã băm trong tên (assets/*) không bao giờ đổi → cache lâu; service worker, manifest, HTML luôn kiểm tra bản mới
        if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (name === 'sw.js' || name.endsWith('.webmanifest') || name.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=86400');
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
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

// Nạp bộ từ theo chủ đề đã crawl sẵn: lần chạy đầu, hoặc khi file dữ liệu có bản mới
const seeded = syncSeed();
if (seeded) console.log(`[seed] ${seeded.first ? 'đã nạp' : 'đã cập nhật'} ${seeded.topics} chủ đề, ${seeded.lexicon} từ`);

const server = app.listen(config.port, config.host, () => {
  console.log(`🚀 API sẵn sàng tại http://${config.host}:${config.port}/api`);
  if (fs.existsSync(config.frontendDist)) console.log(`🌐 Giao diện: http://${config.host}:${config.port}`);
  startPushScheduler();
});

// Docker / Kubernetes gửi SIGTERM khi dừng container: ngừng nhận request, đóng DB sạch sẽ (ghi hết WAL)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`[server] nhận ${signal}, đang dừng…`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
