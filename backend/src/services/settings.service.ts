import { z } from 'zod';
import { config } from '../config.ts';
import { all, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';

export const settingsSchema = z.object({
  translateProvider: z.enum(['auto', 'google', 'hymt']),
  targetLang: z.string().min(2).max(10),
  hymtBaseUrl: z.string().max(300),
  hymtModel: z.string().max(200),
  hymtApiKey: z.string().max(300),
  hymtPromptStyle: z.enum(['hymt2', 'hymt15']),
  dailyGoalXp: z.number().int().min(10).max(1000),
  newCardsPerDay: z.number().int().min(0).max(200),
  requestRetention: z.number().min(0.7).max(0.99),
  accent: z.enum(['us', 'uk']),
  autoPause: z.boolean(),
  showTranslation: z.boolean(),
  playbackRate: z.number().min(0.25).max(2),
  ttsRate: z.number().min(0.5).max(1.5),
  shadowRepeat: z.number().int().min(1).max(10),
  // Trình độ nền: từ có tần suất thuộc mức này trở xuống coi như đã biết (tính độ khó video)
  vocabLevel: z.enum(['A2', 'B1', 'B2', 'C1']),
  dailyPlanMode: z.enum(['short', 'standard']),
  speakDelaySec: z.number().int().min(0).max(6),
  // Hộp "khởi động" (ôn thẻ sắp quên + kế hoạch hôm nay) khi đăng nhập / mở lại app
  startScreen: z.enum(['auto', 'off']),
  // Buổi sáng ưu tiên nhớ lại từ học tối qua
  morningReview: z.boolean(),
  // Thông báo trình duyệt khi có thẻ sắp quên (cần người dùng cấp quyền)
  notifyReviews: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

const DEFAULTS: Settings = {
  translateProvider: (['auto', 'google', 'hymt'].includes(config.translateProvider)
    ? config.translateProvider
    : 'auto') as Settings['translateProvider'],
  targetLang: 'vi',
  hymtBaseUrl: config.hymt.baseUrl,
  hymtModel: config.hymt.model,
  hymtApiKey: config.hymt.apiKey,
  hymtPromptStyle: config.hymt.promptStyle,
  dailyGoalXp: 50,
  newCardsPerDay: 15,
  requestRetention: 0.9,
  accent: 'us',
  // Tắt mặc định: chế độ Xem phát liên tục như YouTube; bật khi muốn nhại lại từng câu
  autoPause: false,
  showTranslation: false,
  playbackRate: 1,
  ttsRate: 0.95,
  shadowRepeat: 1,
  vocabLevel: 'B1',
  dailyPlanMode: 'standard',
  speakDelaySec: 2,
  startScreen: 'auto',
  morningReview: true,
  notifyReviews: false,
};

// Cài đặt riêng của từng người dùng (cache theo userId)
const cache = new Map<number, Settings>();

export function getSettings(): Settings {
  const uid = currentUserId();
  const hit = cache.get(uid);
  if (hit) return hit;
  const stored: Record<string, unknown> = {};
  for (const row of all<{ key: string; value: string }>('SELECT key, value FROM user_settings WHERE user_id = ?', uid)) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      /* bỏ qua giá trị hỏng */
    }
  }
  const merged = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (!(key in stored)) continue;
    const parsed = settingsSchema.shape[key].safeParse(stored[key]);
    if (parsed.success) (merged as Record<string, unknown>)[key] = parsed.data;
  }
  cache.set(uid, merged);
  return merged;
}

const MASK = '••••';

export function maskKey(key: string) {
  return key ? `${MASK}${key.slice(-4)}` : '';
}

/** Cài đặt trả cho client: che API key. */
export function publicSettings() {
  const s = getSettings();
  return { ...s, hymtApiKey: maskKey(s.hymtApiKey), hymtConfigured: Boolean(s.hymtBaseUrl && s.hymtModel) };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const parsed = settingsSchema.partial().parse(patch);
  // Client gửi lại key đã che → giữ key cũ
  if (parsed.hymtApiKey?.startsWith(MASK)) delete parsed.hymtApiKey;
  const uid = currentUserId();
  tx(() => {
    for (const [key, value] of Object.entries(parsed)) {
      run(
        'INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value',
        uid,
        key,
        JSON.stringify(value),
      );
    }
  });
  cache.delete(uid);
  return getSettings();
}

/** Xoá cache khi dữ liệu cài đặt đổi chủ (nhận dữ liệu cũ khi tạo tài khoản đầu tiên). */
export function clearSettingsCache() {
  cache.clear();
}
