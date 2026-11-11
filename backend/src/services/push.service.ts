import webpush from 'web-push';
import { z } from 'zod';
import { all, get, run } from '../db/index.ts';
import { currentUserId, runWithUser } from '../lib/context.ts';
import { localDay } from '../lib/time.ts';
import { getSettings } from './settings.service.ts';
import { warmup } from './warmup.service.ts';

/**
 * Thông báo đẩy (Web Push, chuẩn VAPID): máy chủ tự kiểm tra định kỳ và gửi nhắc ôn thẻ sắp quên,
 * kể cả khi người học đã đóng tab (trình duyệt vẫn chạy). Khoá VAPID lấy từ biến môi trường,
 * nếu không có thì tự sinh một lần và lưu trong bảng app_kv.
 */
interface Vapid {
  publicKey: string;
  privateKey: string;
}

let vapid: Vapid | null = null;

export function getVapid(): Vapid {
  if (vapid) return vapid;
  const env = process.env;
  let keys: Vapid;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  } else {
    const row = get<{ value: string }>("SELECT value FROM app_kv WHERE key = 'vapid'");
    if (row) keys = JSON.parse(row.value) as Vapid;
    else {
      keys = webpush.generateVAPIDKeys();
      run("INSERT INTO app_kv (key, value) VALUES ('vapid', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(keys));
      console.log('[push] đã tạo cặp khoá VAPID mới (lưu trong DB)');
    }
  }
  // Apple từ chối "subject" dạng localhost → mặc định một địa chỉ mailto hợp lệ, nên đặt VAPID_SUBJECT khi deploy.
  // Cấu hình sai (subject/khoá không đúng định dạng) thì ném lỗi ở đây và không ghi nhớ — lần gọi sau báo lại đúng lỗi đó.
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:ielts-learn@example.com', keys.publicKey, keys.privateKey);
  vapid = keys;
  return vapid;
}

/**
 * Máy chủ sẽ gửi request tới `endpoint` do trình duyệt cung cấp, nên chỉ nhận địa chỉ HTTPS của dịch vụ push
 * công khai (FCM, Mozilla, WNS, Apple…) — không để người dùng lợi dụng để gọi tới địa chỉ nội bộ (SSRF).
 */
export function isPublicPushEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  // Địa chỉ IP (v4/v6), tên một nhãn (localhost) hay tên miền nội bộ đều không phải dịch vụ push của trình duyệt
  if (host.startsWith('[') || /^[\d.]+$/.test(host) || !host.includes('.')) return false;
  return !/\.(local|localhost|internal|lan|home|corp)$/.test(host);
}

export const subscriptionSchema = z.object({
  endpoint: z.string().max(2000).refine(isPublicPushEndpoint, 'Địa chỉ đăng ký thông báo không hợp lệ'),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

export function subscribe(sub: z.infer<typeof subscriptionSchema>, userAgent?: string) {
  run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent`,
    currentUserId(),
    sub.endpoint,
    sub.keys.p256dh,
    sub.keys.auth,
    userAgent?.slice(0, 300) ?? null,
  );
  return status();
}

export function unsubscribe(endpoint: string) {
  run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', endpoint, currentUserId());
  return status();
}

export function status() {
  const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', currentUserId())!.n;
  return { subscriptions: n };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET']);

/** Gửi tới mọi thiết bị đã đăng ký của một người dùng; xoá đăng ký đã hết hạn (404/410). */
export async function sendToUser(userId: number, payload: PushPayload) {
  getVapid();
  const subs = all<SubRow>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', userId);
  let sent = 0;
  let failed = 0;
  const send = (s: SubRow) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
  await Promise.all(
    subs.map(async (s) => {
      try {
        try {
          await send(s);
        } catch (err) {
          // Lỗi mạng tạm thời (kết nối bị ngắt, hết thời gian chờ) → thử lại một lần
          if (!TRANSIENT.has((err as { code?: string }).code ?? '')) throw err;
          await new Promise((r) => setTimeout(r, 1500));
          await send(s);
        }
        run("UPDATE push_subscriptions SET last_ok_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?", s.id);
        sent++;
      } catch (err) {
        failed++;
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) run('DELETE FROM push_subscriptions WHERE id = ?', s.id);
        else console.warn('[push] gửi lỗi', code ?? '', (err as Error).message);
      }
    }),
  );
  return { sent, failed };
}

export function sendTest() {
  return sendToUser(currentUserId(), {
    title: '🔔 Đã bật nhắc nhở',
    body: 'IELTS Learn sẽ báo khi có từ sắp quên (tối đa 2 lần/ngày, 8h–22h), kể cả khi bạn đã đóng tab.',
    url: '/',
    tag: 'ielts-learn-test',
  });
}

// ---------- Bộ hẹn giờ nhắc ôn ----------

export const NOTIFY_RULES = { fromHour: 8, toHour: 22, maxPerDay: 2, gapMs: 3 * 3600_000 };

/** Nội dung nhắc cho người dùng hiện tại, hoặc null nếu không cần nhắc (hàm chạy trong ngữ cảnh người dùng). */
export function reminderFor(now = new Date()): PushPayload | null {
  const w = warmup();
  if (w.overdue >= 3 || (w.overdue > 0 && w.items.some((i) => i.retrievability < 0.8))) {
    return { title: `🧠 ${w.overdue} thẻ sắp quên`, body: 'Ôn nhanh khoảng 1 phút để giữ chúng trong trí nhớ.', url: '/?warmup=1', tag: 'ielts-learn-review' };
  }
  if (w.morning && w.slept > 0) {
    return { title: '☀️ Nhớ lại từ học tối qua', body: `${w.slept} từ bạn học hôm qua — ôn lại sau một đêm ngủ sẽ nhớ lâu hơn.`, url: '/?warmup=1', tag: 'ielts-learn-review' };
  }
  if (now.getHours() >= 20) {
    const a = get<{ new_words: number }>('SELECT new_words FROM activity WHERE user_id = ? AND day = ?', currentUserId(), localDay(now));
    if (!a?.new_words) return { title: '🌙 Học vài từ mới trước khi ngủ', body: 'Học buổi tối, sáng mai ôn lại — giấc ngủ giúp bạn nhớ lâu hơn.', url: '/today', tag: 'ielts-learn-evening' };
  }
  return null;
}

async function checkAll() {
  const now = new Date();
  if (now.getHours() < NOTIFY_RULES.fromHour || now.getHours() >= NOTIFY_RULES.toHour) return;
  const day = localDay(now);
  const users = all<{ user_id: number }>('SELECT DISTINCT user_id FROM push_subscriptions').map((r) => r.user_id);
  for (const uid of users) {
    try {
      const payload = runWithUser(uid, () => {
        if (!getSettings().notifyReviews) return null;
        const log = get<{ count: number; last_at: string | null }>('SELECT count, last_at FROM push_log WHERE user_id = ? AND day = ?', uid, day);
        if (log && log.count >= NOTIFY_RULES.maxPerDay) return null;
        if (log?.last_at && now.getTime() - new Date(log.last_at).getTime() < NOTIFY_RULES.gapMs) return null;
        return reminderFor(now);
      });
      if (!payload) continue;
      const r = await sendToUser(uid, payload);
      if (r.sent) {
        run(
          `INSERT INTO push_log (user_id, day, count, last_at) VALUES (?, ?, 1, ?)
           ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1, last_at = excluded.last_at`,
          uid,
          day,
          now.toISOString(),
        );
      }
    } catch (err) {
      console.warn('[push] lỗi kiểm tra người dùng', uid, (err as Error).message);
    }
  }
}

let timer: NodeJS.Timeout | null = null;

/** Bật bộ hẹn giờ (mặc định 15 phút/lần; PUSH_CHECK_MINUTES=0 để tắt). */
export function startPushScheduler() {
  const minutes = Number(process.env.PUSH_CHECK_MINUTES ?? 15);
  if (!(minutes > 0) || timer) return;
  try {
    getVapid();
  } catch (err) {
    // Khoá/subject VAPID sai định dạng không được làm sập cả app — chỉ tắt phần nhắc ôn
    console.warn('[push] tắt nhắc ôn — cấu hình VAPID không hợp lệ:', (err as Error).message);
    return;
  }
  const tick = () => void checkAll().catch((err) => console.warn('[push] lỗi kiểm tra nhắc ôn:', (err as Error).message));
  timer = setInterval(tick, minutes * 60_000);
  timer.unref();
  setTimeout(tick, 60_000).unref();
  console.log(`[push] kiểm tra nhắc ôn mỗi ${minutes} phút (giờ máy chủ, ${NOTIFY_RULES.fromHour}h–${NOTIFY_RULES.toHour}h)`);
}
