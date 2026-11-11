import { useQuery } from '@tanstack/react-query';
import {
  BookA,
  BookMarked,
  CalendarCheck,
  CircleHelp,
  Compass,
  Flame,
  Layers,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquareQuote,
  Mic,
  Monitor,
  Moon,
  Search,
  Settings as SettingsIcon,
  Shapes,
  Sun,
  Target,
  Timer,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router';
import { useLogout, useMe } from '../../hooks/useAuth';
import { useHotkeys } from '../../hooks/useHotkeys';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { applyTheme, useUi, type Theme } from '../../store/ui';
import { Kbd, Progress, Spinner } from '../ui/primitives';
import { StartScreen, WarmupButton } from '../warmup/StartScreen';
import { QuickLookup } from '../word/QuickLookup';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Compass;
  /** Màu biểu tượng — nền ô vuông phía sau dùng cùng tông, nhạt hơn */
  color: string;
  badge?: number;
  /** Giải thích con số trên huy hiệu (tooltip + trình đọc màn hình) */
  badgeHint?: string;
  /** Nhóm hiển thị trên thanh bên */
  group?: string;
}

function useNav(): NavItem[] {
  const { data } = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  const today = useQuery({ queryKey: ['today'], queryFn: api.today, staleTime: 60_000 });
  const due =
    (data?.review.dueNow ?? 0) + (data?.review.newAvailable ?? 0) + (data?.phraseReview?.dueNow ?? 0) + (data?.phraseReview?.newAvailable ?? 0);
  const left = today.data ? today.data.total - today.data.finished : 0;
  return [
    { to: '/', label: 'Trang chủ', icon: LayoutDashboard, color: 'text-violet-500' },
    { to: '/today', label: 'Hôm nay học gì', icon: CalendarCheck, color: 'text-pink-500', badge: left, badgeHint: `Còn ${left} bước trong buổi học hôm nay` },
    { to: '/explore', label: 'Khám phá video', icon: Compass, color: 'text-rose-500', group: 'Nghe' },
    { to: '/library', label: 'Thư viện của tôi', icon: Library, color: 'text-orange-500', group: 'Nghe' },
    { to: '/notebook', label: 'Sổ từ vựng', icon: BookMarked, color: 'text-sky-500', group: 'Từ vựng & mẫu câu' },
    { to: '/phrases', label: 'Sổ mẫu câu', icon: MessageSquareQuote, color: 'text-fuchsia-500', group: 'Từ vựng & mẫu câu' },
    { to: '/review', label: 'Ôn tập', icon: Layers, color: 'text-purple-500', badge: due, badgeHint: `${due} thẻ đang chờ ôn`, group: 'Từ vựng & mẫu câu' },
    { to: '/practice', label: 'Luyện tập', icon: Target, color: 'text-amber-500', group: 'Từ vựng & mẫu câu' },
    { to: '/topics', label: 'Bộ từ chủ đề', icon: Shapes, color: 'text-emerald-500', group: 'Từ vựng & mẫu câu' },
    { to: '/speaking', label: 'Luyện nói lại', icon: Mic, color: 'text-violet-500', group: 'Nói' },
    { to: '/fluency', label: 'Nói trôi chảy 4/3/2', icon: Timer, color: 'text-indigo-500', group: 'Nói' },
    { to: '/glossary', label: 'Giải thích thuật ngữ', icon: BookA, color: 'text-teal-500', group: 'Khác' },
    { to: '/settings', label: 'Cài đặt', icon: SettingsIcon, color: 'text-slate-500', group: 'Khác' },
  ];
}

// Mỗi ngày một mẹo (xoay vòng theo ngày trong năm)
const TIPS = [
  'Nói đuổi (shadowing) 10 câu mỗi ngày: nghe → dừng → nhại lại đúng nhịp và ngữ điệu.',
  'Bấm vào bất kỳ từ nào trong phụ đề để tra nghĩa và lưu vào sổ từ.',
  'Ôn thẻ mỗi ngày một ít hiệu quả hơn ôn dồn — app sẽ nhắc đúng lúc bạn sắp quên.',
  'Học từ mới buổi tối, ôn lại sáng hôm sau: giấc ngủ giúp bạn nhớ lâu hơn.',
  'Gặp chữ có gạch chân chấm? Rê chuột hoặc chạm vào để xem giải thích.',
  'Lưu cả cụm từ (make a decision) thay vì từ lẻ — nói sẽ tự nhiên hơn.',
  'Bài 4/3/2: nói cùng một đề 3 lần, mỗi lần nhanh hơn — luyện trôi chảy rất hiệu quả.',
];

function tipOfTheDay() {
  const now = new Date();
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400_000);
  return TIPS[dayOfYear % TIPS.length];
}

const ICON_BUTTON = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink active:scale-95';

function Logo({ compact }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="group flex items-center gap-2.5" aria-label="IELTS Learn — Trang chủ">
      <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl shadow-md shadow-violet-500/30 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
      {!compact && (
        <span className="font-display text-xl font-black tracking-tight">
          IELTS <span className="text-gradient">Learn</span>
        </span>
      )}
    </NavLink>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useUi();
  const next: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = { light: 'Sáng', dark: 'Tối', system: 'Theo hệ thống' }[theme];
  return (
    <button type="button" onClick={() => setTheme(next[theme])} className={ICON_BUTTON} aria-label={`Giao diện: ${label}. Bấm để đổi`} title={`Giao diện: ${label}`}>
      <Icon className="h-5 w-5" />
    </button>
  );
}

function StreakChip() {
  const { data } = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  if (!data) return null;
  const pct = data.today.goal ? data.today.xp / data.today.goal : 0;
  const done = data.streak.todayDone;
  return (
    <NavLink
      to="/"
      className="hidden items-center gap-3 rounded-xl px-2.5 py-1.5 transition hover:bg-surface-2 min-[380px]:flex"
      title={`Chuỗi ${data.streak.current} ngày học liên tiếp${done ? '' : ' — hôm nay chưa học'} · Hôm nay ${data.today.xp}/${data.today.goal} XP (điểm kinh nghiệm) · Cấp ${data.level.level}`}
    >
      <span className={cn('flex items-center gap-1 font-display text-sm font-extrabold', done ? 'text-orange-500' : 'text-muted')}>
        <Flame className={cn('h-5 w-5 origin-bottom', done && 'animate-flicker fill-orange-400')} />
        {data.streak.current}
      </span>
      <span className="hidden w-24 lg:block">
        <span className="mb-1 flex justify-between text-[11px] font-semibold text-muted">
          <span>Cấp {data.level.level}</span>
          <span>
            {data.today.xp}/{data.today.goal} XP
          </span>
        </span>
        <Progress value={pct} className="h-1.5" />
      </span>
    </NavLink>
  );
}

function SidebarLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-xl px-2 py-1 text-[15px] font-semibold transition-colors',
          isActive ? 'bg-violet-500/10 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Ô biểu tượng: mục đang mở nổi khối với màu thương hiệu, mục khác là nền nhạt cùng tông */}
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition-transform duration-200 group-hover:scale-110',
              isActive ? 'icon-tile bg-brand text-white' : cn('bg-current/10', item.color),
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <span className={cn('flex-1 truncate', isActive && 'font-bold')}>{item.label}</span>
          {!!item.badge && (
            <span
              title={item.badgeHint}
              aria-label={item.badgeHint}
              className="rounded-full bg-fuchsia-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-[0_2px_6px_-1px_rgb(217_70_239/0.6)]"
            >
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  const nav = useNav();
  const { openLookup } = useUi();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
      <div className="px-2">
        <Logo />
      </div>
      <button
        type="button"
        onClick={() => openLookup()}
        className="mx-1 mt-5 flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 text-sm text-muted shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] transition hover:border-violet-300 hover:text-ink"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Tra từ nhanh…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <nav className="scrollbar-thin -mx-1 mt-3 flex-1 space-y-0.5 overflow-y-auto px-1" aria-label="Điều hướng chính">
        {nav.map((item, i) => (
          <div key={item.to}>
            {item.group && item.group !== nav[i - 1]?.group && (
              <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-widest text-muted/80">{item.group}</p>
            )}
            <SidebarLink item={item} />
          </div>
        ))}
      </nav>
      {/* Chỉ hiện trên màn hình đủ cao để không đẩy các mục điều hướng phải cuộn */}
      <div className="relative mt-3 hidden overflow-hidden rounded-2xl bg-brand-animated p-4 text-white shadow-glow [@media(min-height:1000px)]:block">
        <div aria-hidden="true" className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 animate-float-slow rounded-full bg-white/20 blur-xl" />
        <p className="relative font-display text-sm font-extrabold">Mẹo hôm nay 💡</p>
        <p className="relative mt-1 text-xs leading-relaxed text-white/90">{tipOfTheDay()}</p>
      </div>
    </aside>
  );
}

const MOBILE_MAIN = ['/', '/today', '/explore', '/review'];

function MobileNav() {
  const nav = useNav();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);
  const main = nav.filter((n) => MOBILE_MAIN.includes(n.to));
  const rest = nav.filter((n) => !MOBILE_MAIN.includes(n.to));
  const labels: Record<string, string> = { '/': 'Trang chủ', '/today': 'Hôm nay', '/explore': 'Video', '/review': 'Ôn tập' };
  const restActive = rest.some((n) => location.pathname === n.to || location.pathname.startsWith(`${n.to}/`));
  return (
    <>
      <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Điều hướng chính">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {main.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => cn('relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold', isActive ? 'text-ink' : 'text-muted')}
              >
                {({ isActive }) => (
                  <>
                    <span className={cn('flex h-7 w-14 items-center justify-center rounded-full transition-colors', isActive && 'bg-violet-500/15')}>
                      <Icon className={cn('h-[22px] w-[22px] transition-transform', isActive && cn(item.color, 'scale-110'))} />
                    </span>
                    {labels[item.to]}
                    {!!item.badge && <span className="absolute right-[24%] top-1.5 h-2 w-2 rounded-full bg-fuchsia-500 ring-2 ring-surface" />}
                  </>
                )}
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className={cn('flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold', more || restActive ? 'text-ink' : 'text-muted')}
          >
            <span className={cn('flex h-7 w-14 items-center justify-center rounded-full transition-colors', (more || restActive) && 'bg-violet-500/15')}>
              {more ? <X className="h-[22px] w-[22px]" /> : <Menu className="h-[22px] w-[22px]" />}
            </span>
            Thêm
          </button>
        </div>
      </nav>
      {more && (
        <div className="scrollbar-thin fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 max-h-[70dvh] animate-slide-up space-y-0.5 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-lift lg:hidden">
          {rest.map((item) => (
            <SidebarLink key={item.to} item={item} onClick={() => setMore(false)} />
          ))}
        </div>
      )}
    </>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2)) ?? '?').toUpperCase();
}

function UserMenu() {
  const { data: user } = useMe();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!user) return null;
  const menuItem = 'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản: ${user.name}`}
        className="icon-tile flex h-10 w-10 items-center justify-center rounded-full bg-brand font-display text-sm font-extrabold text-white transition hover:brightness-110 active:scale-95"
      >
        {initials(user.name)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-30 w-64 origin-top-right animate-pop rounded-2xl border border-line bg-surface p-2 shadow-lift">
          <div className="border-b border-line px-3 pb-3 pt-2">
            <p className="truncate font-bold text-ink">{user.name}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
          <NavLink to="/settings" role="menuitem" className={cn(menuItem, 'mt-1')}>
            <SettingsIcon className="h-4 w-4 text-muted" /> Tài khoản & cài đặt
          </NavLink>
          <NavLink to="/glossary" role="menuitem" className={menuItem}>
            <BookA className="h-4 w-4 text-muted" /> Giải thích thuật ngữ
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const { openLookup } = useUi();
  return (
    <header className="glass sticky top-0 z-20 border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-4 sm:gap-1.5 sm:px-6">
        <div className="lg:hidden">
          <Logo compact />
        </div>
        <div className="flex-1" />
        <StreakChip />
        <WarmupButton />
        <button type="button" onClick={() => openLookup()} className={cn(ICON_BUTTON, 'lg:hidden')} aria-label="Tra từ nhanh">
          <Search className="h-5 w-5" />
        </button>
        <NavLink to="/glossary" className={cn(ICON_BUTTON, 'hidden sm:inline-flex')} aria-label="Giải thích thuật ngữ" title="Giải thích thuật ngữ khó hiểu">
          <CircleHelp className="h-5 w-5" />
        </NavLink>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

export function PageFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-violet-500">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { openLookup, theme } = useUi();
  const location = useLocation();
  const navigationType = useNavigationType();
  const navType = useRef(navigationType);
  navType.current = navigationType;
  useHotkeys({ 'mod+k': () => openLookup() });

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [theme]);

  // Sang trang khác → về đầu trang; Back/Forward (POP) thì để trình duyệt giữ vị trí cũ
  useEffect(() => {
    if (navType.current !== 'POP') window.scrollTo(0, 0);
  }, [location.pathname]);

  // Hiệu ứng chuyển trang chạy lại khi đổi mục chính (/review → /practice), không chạy khi đổi trang con cùng mục
  const section = location.pathname.split('/')[1] ?? '';

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow"
      >
        Bỏ qua tới nội dung chính
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
          <Suspense fallback={<PageFallback />}>
            <div key={section} className="animate-page">
              {children ?? <Outlet />}
            </div>
          </Suspense>
        </main>
      </div>
      <MobileNav />
      <QuickLookup />
      <StartScreen />
    </div>
  );
}
