#!/usr/bin/env node
/**
 * npm run dev:hymt — chạy app ở chế độ dev kèm model dịch Hy-MT trên máy:
 * tải model (lần đầu) → bật llama-server → chạy "npm run dev" với cấu hình Hy-MT sẵn.
 * Dừng bằng Ctrl+C: cả app lẫn llama-server đều tắt.
 */
import { spawn } from 'node:child_process';
import { PORT, serve } from './hymt.mjs';

let hymt;
try {
  hymt = await serve();
} catch (err) {
  console.error(`[hymt] ${err.message}`);
  console.error('[hymt] App vẫn chạy được không cần Hy-MT: dùng "npm run dev".');
  process.exit(1);
}

const env = {
  ...process.env,
  HYMT_BASE_URL: `http://127.0.0.1:${PORT}/v1`,
  HYMT_MODEL: 'hy-mt',
  HYMT_PROMPT_STYLE: 'hymt15',
  TRANSLATE_PROVIDER: process.env.TRANSLATE_PROVIDER ?? 'auto',
};
// shell: true để chạy được npm(.cmd) trên Windows
const app = spawn('npm run dev', { stdio: 'inherit', env, shell: true });

const shutdown = (code = 0) => {
  hymt.stop();
  if (!app.killed) app.kill();
  process.exit(code);
};
app.on('exit', (code) => shutdown(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => shutdown(0));
