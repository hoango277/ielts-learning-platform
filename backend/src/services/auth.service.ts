import crypto from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.ts';
import { get, run, tx } from '../db/index.ts';
import { USER_TABLES } from '../db/schema.ts';
import { clearSettingsCache } from './settings.service.ts';

// ---------- Mật khẩu: scrypt (có sẵn trong Node), salt ngẫu nhiên, so sánh chống timing attack ----------

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password.normalize('NFKC'), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// ---------- Kiểm tra dữ liệu vào ----------

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email không hợp lệ');
const password = z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự').max(200, 'Mật khẩu quá dài');

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Hãy nhập tên hiển thị').max(60, 'Tên quá dài'),
  email,
  password,
  remember: z.boolean().optional(),
});
export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Hãy nhập mật khẩu').max(200),
  remember: z.boolean().optional(),
});
export const profileSchema = z.object({ name: z.string().trim().min(1, 'Hãy nhập tên hiển thị').max(60) });
export const passwordSchema = z.object({ currentPassword: z.string().min(1, 'Hãy nhập mật khẩu hiện tại'), newPassword: password });

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  createdAt: string;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

const toPublic = (u: Pick<UserRow, 'id' | 'email' | 'name' | 'created_at'>): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.created_at,
});

// ---------- Phiên đăng nhập ----------

export const SESSION_COOKIE = 'ielts_sid';
const REMEMBER_TTL = 30 * 86400; // "Ghi nhớ đăng nhập": 30 ngày, tự gia hạn khi còn dùng
const SESSION_TTL = 12 * 3600; // không ghi nhớ: cookie phiên, hết hạn sau 12 giờ không hoạt động

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const nowIso = () => new Date().toISOString();

export interface NewSession {
  token: string;
  ttl: number;
  persistent: boolean;
}

function createSession(userId: number, remember: boolean, userAgent?: string): NewSession {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttl = remember ? REMEMBER_TTL : SESSION_TTL;
  run(
    'INSERT INTO sessions (id, user_id, ttl_sec, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)',
    hashToken(token),
    userId,
    ttl,
    new Date(Date.now() + ttl * 1000).toISOString(),
    userAgent?.slice(0, 200) ?? null,
  );
  return { token, ttl, persistent: remember };
}

export interface ActiveSession {
  sessionId: string;
  user: PublicUser;
  ttl: number;
  persistent: boolean;
  renewed: boolean;
}

/** Tra phiên từ token cookie; gia hạn khi đã dùng quá nửa thời hạn. */
export function getSession(token: string): ActiveSession | null {
  const id = hashToken(token);
  const row = get<{ ttl_sec: number; expires_at: string; user_id: number; email: string; name: string; created_at: string }>(
    `SELECT s.ttl_sec, s.expires_at, u.id AS user_id, u.email, u.name, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    id,
  );
  if (!row) return null;
  const now = Date.now();
  const expires = Date.parse(row.expires_at);
  if (expires <= now) {
    run('DELETE FROM sessions WHERE id = ?', id);
    return null;
  }
  let renewed = false;
  if (expires - now < (row.ttl_sec * 1000) / 2) {
    run('UPDATE sessions SET expires_at = ? WHERE id = ?', new Date(now + row.ttl_sec * 1000).toISOString(), id);
    renewed = true;
  }
  return {
    sessionId: id,
    user: toPublic({ id: row.user_id, email: row.email, name: row.name, created_at: row.created_at }),
    ttl: row.ttl_sec,
    persistent: row.ttl_sec === REMEMBER_TTL,
    renewed,
  };
}

export function deleteSession(token: string) {
  run('DELETE FROM sessions WHERE id = ?', hashToken(token));
}

// ---------- Chống dò mật khẩu: khoá 15 phút sau 8 lần sai ----------

const failures = new Map<string, { count: number; first: number; lockedUntil: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;

function assertNotLocked(key: string) {
  const f = failures.get(key);
  if (f && f.lockedUntil > Date.now()) {
    const minutes = Math.ceil((f.lockedUntil - Date.now()) / 60_000);
    throw new AuthError(429, `Bạn đã nhập sai quá nhiều lần. Hãy thử lại sau ${minutes} phút.`);
  }
}

function recordFailure(key: string) {
  const now = Date.now();
  const f = failures.get(key);
  const cur = f && now - f.first < WINDOW_MS ? f : { count: 0, first: now, lockedUntil: 0 };
  cur.count++;
  if (cur.count >= MAX_FAILURES) cur.lockedUntil = now + WINDOW_MS;
  failures.set(key, cur);
  if (failures.size > 5000) failures.delete(failures.keys().next().value!);
}

// ---------- Nghiệp vụ ----------

export function authStatus() {
  const n = get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n;
  return { hasUsers: n > 0, registrationOpen: n === 0 || config.allowRegistration };
}

/** Dữ liệu học tạo trước khi có tài khoản (user_id = 0) thuộc về tài khoản đầu tiên. */
function claimLegacyData(userId: number) {
  let moved = 0;
  for (const table of USER_TABLES) moved += Number(run(`UPDATE ${table} SET user_id = ? WHERE user_id = 0`, userId).changes);
  clearSettingsCache();
  return moved;
}

export async function register(input: unknown, userAgent?: string) {
  const data = registerSchema.parse(input);
  if (!authStatus().registrationOpen) throw new AuthError(403, 'Đăng ký tài khoản mới đang bị tắt trên máy chủ này.');
  if (get('SELECT 1 FROM users WHERE email = ?', data.email)) throw new AuthError(409, 'Email này đã được đăng ký.');
  const hash = await hashPassword(data.password);
  const { userId, claimed } = tx(() => {
    if (get('SELECT 1 FROM users WHERE email = ?', data.email)) throw new AuthError(409, 'Email này đã được đăng ký.');
    const isFirst = get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n === 0;
    const res = run(
      'INSERT INTO users (email, name, password_hash, last_login_at) VALUES (?, ?, ?, ?)',
      data.email,
      data.name,
      hash,
      nowIso(),
    );
    const id = Number(res.lastInsertRowid);
    return { userId: id, claimed: isFirst ? claimLegacyData(id) : 0 };
  });
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', userId)!;
  return { user: toPublic(user), session: createSession(userId, data.remember ?? true, userAgent), claimedLegacyData: claimed > 0 };
}

export async function login(input: unknown, ip: string, userAgent?: string) {
  const data = loginSchema.parse(input);
  const key = `${ip}|${data.email}`;
  assertNotLocked(key);
  const user = get<UserRow>('SELECT * FROM users WHERE email = ?', data.email);
  // Vẫn chạy scrypt khi email không tồn tại để thời gian phản hồi như nhau (không lộ email nào đã đăng ký)
  const ok = user ? await verifyPassword(data.password, user.password_hash) : (await hashPassword(data.password), false);
  if (!user || !ok) {
    recordFailure(key);
    throw new AuthError(401, 'Email hoặc mật khẩu không đúng.');
  }
  failures.delete(key);
  run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), user.id);
  run('DELETE FROM sessions WHERE expires_at < ?', nowIso());
  return { user: toPublic(user), session: createSession(user.id, data.remember ?? true, userAgent) };
}

export function updateProfile(userId: number, input: unknown) {
  const { name } = profileSchema.parse(input);
  run('UPDATE users SET name = ? WHERE id = ?', name, userId);
  return toPublic(get<UserRow>('SELECT * FROM users WHERE id = ?', userId)!);
}

/** Đổi mật khẩu và đăng xuất mọi phiên khác (giữ phiên hiện tại). */
export async function changePassword(userId: number, currentSessionId: string, input: unknown) {
  const data = passwordSchema.parse(input);
  const user = get<UserRow>('SELECT * FROM users WHERE id = ?', userId);
  if (!user || !(await verifyPassword(data.currentPassword, user.password_hash))) {
    throw new AuthError(400, 'Mật khẩu hiện tại không đúng.');
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(data.newPassword), userId);
  const res = run('DELETE FROM sessions WHERE user_id = ? AND id != ?', userId, currentSessionId);
  return { ok: true, otherSessionsClosed: Number(res.changes) };
}
