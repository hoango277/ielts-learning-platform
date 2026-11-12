import { z } from 'zod';
import { config } from '../config.ts';
import { all, run, tx } from '../db/index.ts';

/**
 * Cấu hình chung của máy chủ — chỉ quản trị viên (admin) xem và sửa, áp dụng cho mọi người dùng:
 * nhà cung cấp dịch, mô hình AI Hy-MT (địa chỉ, model, khoá API, mẫu prompt) và việc cho đăng ký tài khoản mới.
 * Giá trị mặc định lấy từ biến môi trường (.env / Docker Compose); admin đổi trong trang Quản trị thì lưu vào bảng app_kv.
 */
export const serverSettingsSchema = z.object({
  translateProvider: z.enum(['auto', 'google', 'hymt']),
  hymtBaseUrl: z.string().trim().max(300),
  hymtModel: z.string().trim().max(200),
  hymtApiKey: z.string().max(300),
  hymtPromptStyle: z.enum(['hymt2', 'hymt15']),
  allowRegistration: z.boolean(),
});

export type ServerSettings = z.infer<typeof serverSettingsSchema>;

const PREFIX = 'server.';
const MASK = '••••';

const defaults = (): ServerSettings => ({
  translateProvider: (['auto', 'google', 'hymt'].includes(config.translateProvider) ? config.translateProvider : 'auto') as ServerSettings['translateProvider'],
  hymtBaseUrl: config.hymt.baseUrl,
  hymtModel: config.hymt.model,
  hymtApiKey: config.hymt.apiKey,
  hymtPromptStyle: config.hymt.promptStyle,
  allowRegistration: config.allowRegistration,
});

let cache: ServerSettings | null = null;

export function getServerSettings(): ServerSettings {
  if (cache) return cache;
  const stored: Record<string, unknown> = {};
  for (const row of all<{ key: string; value: string }>(`SELECT key, value FROM app_kv WHERE key LIKE '${PREFIX}%'`)) {
    try {
      stored[row.key.slice(PREFIX.length)] = JSON.parse(row.value);
    } catch {
      /* bỏ qua giá trị hỏng */
    }
  }
  const merged = defaults();
  for (const key of Object.keys(merged) as (keyof ServerSettings)[]) {
    if (!(key in stored)) continue;
    const parsed = serverSettingsSchema.shape[key].safeParse(stored[key]);
    if (parsed.success) (merged as Record<string, unknown>)[key] = parsed.data;
  }
  // Khoá API trong biến môi trường chỉ đi kèm đúng địa chỉ Hy-MT trong biến môi trường:
  // đổi sang máy chủ model khác mà chưa nhập khoá riêng thì không gửi khoá cũ sang đó
  if (!('hymtApiKey' in stored) && merged.hymtBaseUrl !== config.hymt.baseUrl) merged.hymtApiKey = '';
  cache = merged;
  return merged;
}

/** Bản trả cho trang Quản trị: che khoá API (chỉ hiện 4 ký tự cuối). */
export function publicServerSettings() {
  const s = getServerSettings();
  return { ...s, hymtApiKey: s.hymtApiKey ? `${MASK}${s.hymtApiKey.slice(-4)}` : '', hymtConfigured: Boolean(s.hymtBaseUrl && s.hymtModel) };
}

export function updateServerSettings(patch: unknown) {
  const parsed = serverSettingsSchema.partial().parse(patch);
  // Trang Quản trị gửi lại khoá đã che → giữ khoá cũ
  if (parsed.hymtApiKey?.startsWith(MASK)) delete parsed.hymtApiKey;
  tx(() => {
    for (const [key, value] of Object.entries(parsed)) {
      run(
        'INSERT INTO app_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        PREFIX + key,
        JSON.stringify(value),
      );
    }
  });
  cache = null;
  return publicServerSettings();
}

/** Khoá dùng khi admin bấm "Kiểm tra kết nối": khoá vừa nhập, hoặc khoá đã lưu nếu cùng địa chỉ máy chủ model. */
export function hymtKeyFor(baseUrl: string, sentKey: string | undefined) {
  if (sentKey && !sentKey.startsWith(MASK)) return sentKey;
  const s = getServerSettings();
  return baseUrl === s.hymtBaseUrl ? s.hymtApiKey : '';
}

/** Xoá cache (dùng trong test hoặc khi dữ liệu đổi ngoài luồng thường). */
export function clearServerSettingsCache() {
  cache = null;
}
