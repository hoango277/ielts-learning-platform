import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');

// .env là tuỳ chọn — mọi giá trị đều có mặc định hợp lý
try {
  process.loadEnvFile(path.join(ROOT_DIR, '.env'));
} catch {
  /* không có .env */
}

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4000),
  host: env.HOST ?? '127.0.0.1',
  // Khi chạy test (node --test) dùng DB trong bộ nhớ để không đụng dữ liệu thật
  dbPath: env.DB_PATH
    ? path.resolve(ROOT_DIR, env.DB_PATH)
    : env.NODE_TEST_CONTEXT
      ? ':memory:'
      : path.resolve(ROOT_DIR, 'data/ielts-learn.db'),
  seedPath: path.join(ROOT_DIR, 'data', 'seed', 'topics.json'),
  crawlCacheDir: path.join(ROOT_DIR, 'data', 'crawl-cache'),
  frontendDist: path.resolve(ROOT_DIR, '..', 'frontend', 'dist'),
  corsOrigins: (env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map((s) => s.trim()),
  youtubeLocation: env.YT_LOCATION ?? 'US',
  // Giá trị mặc định cho Hy-MT; có thể ghi đè trong trang Cài đặt (lưu DB)
  hymt: {
    baseUrl: env.HYMT_BASE_URL ?? '',
    model: env.HYMT_MODEL ?? '',
    apiKey: env.HYMT_API_KEY ?? '',
    promptStyle: env.HYMT_PROMPT_STYLE === 'hymt15' ? 'hymt15' : 'hymt2',
  },
  translateProvider: env.TRANSLATE_PROVIDER ?? 'auto',
  // Cho phép tạo thêm tài khoản sau tài khoản đầu tiên (đặt ALLOW_REGISTRATION=false để khoá)
  allowRegistration: env.ALLOW_REGISTRATION !== 'false',
} as const;
