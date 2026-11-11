import { useMutation, useQuery } from '@tanstack/react-query';
import { BookMarked, Eye, EyeOff, Languages, Layers, Mic, Shapes } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/primitives';
import { useMe, useSetSignedIn } from '../hooks/useAuth';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { KEY_AFTER_LOGIN } from '../store/ui';

const FEATURES = [
  { icon: Mic, text: 'Nói đuổi (shadowing) & chép chính tả với video YouTube' },
  { icon: Languages, text: 'Bấm vào từ để tra nghĩa đúng theo câu trong video' },
  { icon: Layers, text: 'Thẻ ghi nhớ tự hẹn ngày ôn đúng lúc bạn sắp quên' },
  { icon: Shapes, text: '26 bộ từ vựng IELTS theo chủ đề' },
  { icon: BookMarked, text: 'Sổ từ vựng riêng, đồng bộ trên mọi thiết bị dùng chung máy chủ' },
];

/** Chỉ cho phép quay về đường dẫn nội bộ sau khi đăng nhập (chống chuyển hướng ra trang lạ). */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') && !next.startsWith('/register') ? next : '/';
}

function PasswordInput({ id, value, onChange, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="h-11 pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:text-ink"
        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

const STRENGTH = [
  { label: 'Quá yếu', bar: 'bg-rose-500' },
  { label: 'Yếu', bar: 'bg-orange-500' },
  { label: 'Trung bình', bar: 'bg-amber-500' },
  { label: 'Khá mạnh', bar: 'bg-lime-500' },
  { label: 'Mạnh', bar: 'bg-emerald-500' },
];

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setSignedIn = useSetSignedIn();
  const me = useMe();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: api.authStatus, staleTime: 30_000 });
  const ids = { name: useId(), email: useId(), password: useId(), confirm: useId() };
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const next = safeNext(params.get('next'));
  const isRegister = mode === 'register';

  const submit = useMutation({
    mutationFn: async () => {
      if (isRegister) {
        if (password !== confirm) throw new Error('Mật khẩu nhập lại không khớp.');
        return api.register({ name, email, password, remember });
      }
      return api.login({ email, password, remember });
    },
    onSuccess: (res) => {
      setSignedIn(res.user);
      // Báo cho app mở hộp "khởi động" (thẻ sắp quên + kế hoạch hôm nay) ngay sau khi vào
      try {
        sessionStorage.setItem(KEY_AFTER_LOGIN, '1');
      } catch {
        /* bỏ qua */
      }
      if ('claimedLegacyData' in res && res.claimedLegacyData) {
        toast.success(`Chào ${res.user.name}! Dữ liệu học có sẵn trên máy đã được chuyển vào tài khoản của bạn.`);
      } else {
        toast.success(isRegister ? `Chào mừng ${res.user.name} 🎉` : `Chào mừng trở lại, ${res.user.name}!`);
      }
      navigate(next, { replace: true });
    },
    onError: (e) => setError((e as Error).message),
  });

  if (me.data) return <Navigate to={next} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    submit.mutate();
  };

  const closed = isRegister && status.data && !status.data.registrationOpen;
  const firstUser = isRegister && status.data && !status.data.hasUsers;
  const s = strength(password);

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Bảng giới thiệu (desktop) */}
      <aside className="relative hidden w-[46%] overflow-hidden bg-brand-animated p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 animate-float-slow rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 animate-float-slow rounded-full bg-amber-300/30 blur-3xl [animation-delay:-4s]" />
        <div className="relative flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-11 w-11 rounded-2xl bg-white/15 p-0.5" />
          <span className="font-display text-2xl font-black tracking-tight">IELTS Learn</span>
        </div>
        <div className="relative mt-auto">
          <h2 className="max-w-md text-4xl font-black leading-tight">Học tiếng Anh qua video bạn thích — mỗi ngày một chút.</h2>
          <ul className="stagger mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[15px] text-white/90">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] ring-1 ring-white/20">
                  <Icon className="h-5 w-5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-auto pt-10 text-sm text-white/70">Dữ liệu học của bạn được lưu trên máy chủ của chính bạn.</p>
      </aside>

      {/* Form */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl" />
            <span className="font-display text-xl font-black">
              IELTS <span className="text-gradient">Learn</span>
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">{isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
          <p className="mt-1.5 text-muted">
            {isRegister ? 'Bắt đầu lưu sổ từ, chuỗi ngày học và tiến độ của riêng bạn.' : 'Tiếp tục hành trình học tiếng Anh của bạn.'}
          </p>

          {firstUser && (
            <p className="mt-5 rounded-2xl bg-violet-50 p-4 text-sm leading-relaxed text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
              🎉 Bạn là người dùng đầu tiên. Tài khoản này sẽ nhận <b>toàn bộ dữ liệu học đã có trên máy</b> (sổ từ, lịch ôn, XP, video đã xem).
            </p>
          )}
          {closed && (
            <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              Máy chủ này đang tắt đăng ký tài khoản mới. Hãy đăng nhập bằng tài khoản có sẵn.
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {isRegister && (
              <div className="space-y-1.5">
                <label htmlFor={ids.name} className="text-sm font-semibold text-ink">
                  Tên hiển thị
                </label>
                <Input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="VD: Minh Anh" required className="h-11" autoFocus />
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor={ids.email} className="text-sm font-semibold text-ink">
                Email
              </label>
              <Input
                id={ids.email}
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={isRegister ? 'email' : 'username'}
                placeholder="ban@example.com"
                required
                className="h-11"
                autoFocus={!isRegister}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={ids.password} className="text-sm font-semibold text-ink">
                Mật khẩu
              </label>
              <PasswordInput
                id={ids.password}
                value={password}
                onChange={setPassword}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder={isRegister ? 'Ít nhất 8 ký tự' : undefined}
              />
              {isRegister && password && (
                <div className="flex items-center gap-2 pt-1" aria-live="polite">
                  <div className="flex flex-1 gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < s ? STRENGTH[s].bar : 'bg-surface-3')} />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-muted">{STRENGTH[s].label}</span>
                </div>
              )}
            </div>
            {isRegister && (
              <div className="space-y-1.5">
                <label htmlFor={ids.confirm} className="text-sm font-semibold text-ink">
                  Nhập lại mật khẩu
                </label>
                <PasswordInput id={ids.confirm} value={confirm} onChange={setConfirm} autoComplete="new-password" />
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-violet-600" />
              Ghi nhớ đăng nhập trên máy này (30 ngày)
            </label>

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={submit.isPending} disabled={Boolean(closed)}>
              {isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {isRegister ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
            <Link
              to={`${isRegister ? '/login' : '/register'}${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="font-semibold text-violet-600 hover:underline dark:text-violet-300"
            >
              {isRegister ? 'Đăng nhập' : 'Tạo tài khoản mới'}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

