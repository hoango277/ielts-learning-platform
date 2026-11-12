import { z } from 'zod';
import { all, run, tx } from '../db/index.ts';
import { currentUserId } from '../lib/context.ts';
import { getServerSettings, type ServerSettings } from './server-settings.service.ts';

/**
 * Cài đặt RIÊNG của từng người dùng — chỉ là tuỳ chọn học tập (mục tiêu, thẻ mới, giọng đọc, video…).
 * Cấu hình dịch & mô hình AI là cấu hình chung của máy chủ, chỉ admin sửa (xem server-settings.service.ts).
 */
export const settingsSchema = z.object({
  targetLang: z.string().min(2).max(10),
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

export type UserSettings = z.infer<typeof settingsSchema>;
/** Cài đặt dùng nội bộ: tuỳ chọn của người dùng + cấu hình dịch chung của máy chủ */
export type Settings = UserSettings & Pick<ServerSettings, 'translateProvider' | 'hymtBaseUrl' | 'hymtModel' | 'hymtApiKey' | 'hymtPromptStyle'>;

const DEFAULTS: UserSettings = {
  targetLang: 'vi',
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
const cache = new Map<number, UserSettings>();

function userSettings(): UserSettings {
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
  for (const key of Object.keys(DEFAULTS) as (keyof UserSettings)[]) {
    if (!(key in stored)) continue;
    const parsed = settingsSchema.shape[key].safeParse(stored[key]);
    if (parsed.success) (merged as Record<string, unknown>)[key] = parsed.data;
  }
  cache.set(uid, merged);
  return merged;
}

export function getSettings(): Settings {
  const s = getServerSettings();
  return {
    ...userSettings(),
    translateProvider: s.translateProvider,
    hymtBaseUrl: s.hymtBaseUrl,
    hymtModel: s.hymtModel,
    hymtApiKey: s.hymtApiKey,
    hymtPromptStyle: s.hymtPromptStyle,
  };
}

/** Cài đặt trả cho client: chỉ tuỳ chọn học tập (không lộ cấu hình máy chủ, địa chỉ hay khoá của mô hình AI). */
export function publicSettings() {
  return { ...userSettings() };
}

export function updateSettings(patch: Partial<UserSettings>) {
  // Chỉ nhận khoá tuỳ chọn học tập; khoá lạ (vd. cấu hình mô hình AI) bị bỏ qua — cấu hình đó chỉ admin sửa ở trang Quản trị
  const parsed = settingsSchema.partial().parse(patch);
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
  return publicSettings();
}

/** Xoá cache khi dữ liệu cài đặt đổi chủ (nhận dữ liệu cũ khi tạo tài khoản đầu tiên). */
export function clearSettingsCache() {
  cache.clear();
}
