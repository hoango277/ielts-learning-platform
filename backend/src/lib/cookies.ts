export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!key || key in out) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAge?: number; // giây; bỏ trống = cookie phiên (mất khi đóng trình duyệt)
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict';
  path?: string;
}

export function serializeCookie(name: string, value: string, opts: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? '/'}`];
  if (opts.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.floor(opts.maxAge)}`);
    parts.push(`Expires=${new Date(Date.now() + opts.maxAge * 1000).toUTCString()}`);
  }
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}
