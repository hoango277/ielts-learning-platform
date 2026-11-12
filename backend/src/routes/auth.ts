import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { config } from '../config.ts';
import { runWithUser } from '../lib/context.ts';
import { parseCookies, serializeCookie } from '../lib/cookies.ts';
import {
  authStatus,
  changePassword,
  deleteSession,
  getSession,
  login,
  register,
  SESSION_COOKIE,
  updateProfile,
  type ActiveSession,
  type NewSession,
} from '../services/auth.service.ts';

const isHttps = (req: Request) => req.secure || req.headers['x-forwarded-proto'] === 'https';

function setSessionCookie(req: Request, res: Response, token: string, ttl: number, persistent: boolean) {
  res.append(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, token, { maxAge: persistent ? ttl : undefined, secure: isHttps(req), sameSite: 'Lax' }),
  );
}

function clearSessionCookie(req: Request, res: Response) {
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: isHttps(req), sameSite: 'Lax' }));
}

const tokenOf = (req: Request) => parseCookies(req.headers.cookie)[SESSION_COOKIE];

/** Đọc phiên từ cookie; nếu phiên được gia hạn thì gửi lại cookie với hạn mới. */
function readSession(req: Request, res: Response): ActiveSession | null {
  const token = tokenOf(req);
  if (!token) return null;
  const session = getSession(token);
  if (!session) {
    clearSessionCookie(req, res);
    return null;
  }
  if (session.renewed && session.persistent) setSessionCookie(req, res, token, session.ttl, true);
  return session;
}

/** Bắt buộc đăng nhập; chạy phần còn lại của request trong ngữ cảnh người dùng (currentUserId). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = readSession(req, res);
  if (!session) {
    res.status(401).json({ error: 'Bạn cần đăng nhập', code: 'UNAUTHENTICATED' });
    return;
  }
  res.locals.session = session;
  runWithUser(session.user.id, () => next());
}

/** Chỉ quản trị viên (dùng sau requireAuth): cấu hình dịch & mô hình AI, đăng ký tài khoản, người dùng. */
export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if ((res.locals.session as { user?: { role?: string } } | undefined)?.user?.role !== 'admin') {
    res.status(403).json({ error: 'Chỉ quản trị viên mới dùng được chức năng này.', code: 'FORBIDDEN' });
    return;
  }
  next();
}

/**
 * Chặn yêu cầu thay đổi dữ liệu đến từ trang khác (CSRF). Cookie đã SameSite=Lax;
 * kiểm tra thêm header Origin cho chắc.
 */
export function sameOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin || config.corsOrigins.includes(origin)) return next();
  try {
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
    if (new URL(origin).host === host) return next();
  } catch {
    /* Origin không hợp lệ */
  }
  res.status(403).json({ error: 'Yêu cầu bị chặn vì đến từ trang khác.' });
}

/** Lỗi dữ liệu vào → chỉ trả câu thông báo đầu tiên (dễ hiển thị trên form). */
function handle(fn: (req: Request, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: err.issues[0]?.message ?? 'Dữ liệu không hợp lệ' });
        return;
      }
      next(err);
    }
  };
}

function sendSession(req: Request, res: Response, session: NewSession) {
  setSessionCookie(req, res, session.token, session.ttl, session.persistent);
}

export const authRouter = Router();

authRouter.get('/status', (_req, res) => {
  res.json(authStatus());
});

/** Người dùng hiện tại (user = null nếu chưa đăng nhập — không trả 401 để tránh lỗi đỏ trên console). */
authRouter.get('/me', (req, res) => {
  const session = readSession(req, res);
  res.json({ user: session?.user ?? null });
});

authRouter.post(
  '/register',
  handle(async (req, res) => {
    const result = await register(req.body, req.headers['user-agent']);
    sendSession(req, res, result.session);
    res.status(201).json({ user: result.user, claimedLegacyData: result.claimedLegacyData });
  }),
);

authRouter.post(
  '/login',
  handle(async (req, res) => {
    const result = await login(req.body, req.ip ?? 'unknown', req.headers['user-agent']);
    sendSession(req, res, result.session);
    res.json({ user: result.user });
  }),
);

authRouter.post('/logout', (req, res) => {
  const token = tokenOf(req);
  if (token) deleteSession(token);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

authRouter.patch(
  '/me',
  requireAuth,
  handle((req, res) => {
    res.json({ user: updateProfile((res.locals.session as ActiveSession).user.id, req.body) });
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  handle(async (req, res) => {
    const session = res.locals.session as ActiveSession;
    res.json(await changePassword(session.user.id, session.sessionId, req.body));
  }),
);
