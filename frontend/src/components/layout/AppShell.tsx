import { useQuery } from '@tanstack/react-query';
import {
  BookA,
  BookMarked,
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
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Shapes,
  Sun,
  Target,
  Timer,
  TrendingUp,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useRef, useState, ViewTransition, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router';
import { useLogout, useMe } from '../../hooks/useAuth';
import { useHotkeys } from '../../hooks/useHotkeys';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { applyTheme, useUi, type Theme } from '../../store/ui';
import { Kbd, Progress, Spinner } from '../ui/primitives';
import { StartScreen, WarmupButton } from '../warmup/StartScreen';
import { QuickLookup } from '../word/QuickLookup';
import { MilestoneWatcher } from './MilestoneWatcher';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Compass;
  badge?: number;
  /** Giải thích con số trên huy hiệu (tooltip + trình đọc màn hình) */
  badgeHint?: string;
  /** Nhóm hiển thị trên thanh bên */
  group?: string;
  /** Đường dẫn con cũng tính là đang ở mục này (vd. /today thuộc Trang chủ) */
  also?: string[];
}

/*
 * Điều hướng gom theo việc người học muốn làm (định luật Hick: gom nhóm thay vì liệt kê dàn trải):
 * hai việc hằng ngày ở trên cùng (Trang chủ = buổi học hôm nay, Ôn tập) → Nghe & xem → Từ vựng → Nói → Tiến độ.
 * Thuật ngữ và Cài đặt là mục phụ, nằm dưới cùng thanh bên. Biểu tượng một màu; chỉ mục đang mở có màu thương hiệu.
 */
function useNav(): NavItem[] {
  const { data } = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000 });
  const today = useQuery({ queryKey: ['today'], queryFn: api.today, staleTime: 60_000 });
  const due =
    (data?.review.dueNow ?? 0) + (data?.review.newAvailable ?? 0) + (data?.phraseReview?.dueNow ?? 0) + (data?.phraseReview?.newAvailable ?? 0);
  const left = today.data ? today.data.total - today.data.finished : 0;
  return [
    { to: '/', label: 'Trang chủ', icon: LayoutDashboard, badge: left, badgeHint: `Còn ${left} bước trong buổi học hôm nay`, also: ['/today'] },
    { to: '/review', label: 'Ôn tập', icon: Layers, badge: due, badgeHint: `${due} thẻ đang chờ ôn` },
    { to: '/explore', label: 'Khám phá video', icon: Compass, group: 'Nghe & xem', also: ['/watch', '/channel'] },
    { to: '/library', label: 'Thư viện của tôi', icon: Library, group: 'Nghe & xem' },
    { to: '/notebook', label: 'Sổ từ vựng', icon: BookMarked, group: 'Từ vựng', also: ['/profile'] },
    { to: '/topics', label: 'Bộ từ chủ đề', icon: Shapes, group: 'Từ vựng' },
    { to: '/phrases', label: 'Sổ mẫu câu', icon: MessageSquareQuote, group: 'Từ vựng' },
    { to: '/practice', label: 'Luyện tập', icon: Target, group: 'Từ vựng' },
    { to: '/speaking', label: 'Luyện nói lại', icon: Mic, group: 'Nói' },
    { to: '/fluency', label: 'Nói trôi chảy 4/3/2', icon: Timer, group: 'Nói' },
    { to: '/progress', label: 'Tiến độ', icon: TrendingUp, group: 'Của bạn' },
  ];
}

/** Mục phụ: dưới cùng thanh bên / cuối menu "Thêm" trên điện thoại. "Quản trị" chỉ hiện với quản trị viên. */
function useSecondaryNav(): NavItem[] {
  const { data: user } = useMe();
  return [
    { to: '/glossary', label: 'Giải thích thuật ngữ', icon: BookA },
    { to: '/settings', label: 'Cài đặt', icon: SettingsIcon },
    ...(user?.role === 'admin' ? [{ to: '/admin', label: 'Quản trị', icon: ShieldCheck }] : []),
  ];
}

function isActive(item: NavItem, pathname: string) {
  if (item.to === '/') return pathname === '/' || (item.also ?? []).some((p) => pathname.startsWith(p));
  return pathname === item.to || pathname.startsWith(`${item.to}/`) || (item.also ?? []).some((p) => pathname.startsWith(p));
}

const ICON_BUTTON = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink active:scale-95';

function Logo({ compact }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="group flex items-center gap-2.5" aria-label="IELTS Learn — Trang chủ">
      <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl shadow-md shadow-brand-500/30 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
      {!compact && (
        <span className="font-display text-xl font-black tracking-tight">
          IELTS <span className="text-brand-600 dark:text-brand-300">Learn</span>
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

function SidebarLink({ item, onClick, compact, collapsed }: { item: NavItem; onClick?: () => void; compact?: boolean; collapsed?: boolean }) {
  const Icon = item.icon;
  const { pathname } = useLocation();
  const active = isActive(item, pathname);
  if (collapsed) {
    // Thanh bên thu gọn: chỉ biểu tượng; tên mục hiện khi rê chuột (title) và vẫn đọc được bằng trình đọc màn hình
    return (
      <Link
        to={item.to}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        title={item.badge ? `${item.label} — ${item.badgeHint}` : item.label}
        className={cn(
          'group relative flex justify-center rounded-xl py-1 transition-colors',
          active ? 'bg-brand-500/10' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )}
      >
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-transform duration-200',
            active ? 'icon-tile bg-brand text-white' : 'group-hover:scale-110',
          )}
        >
          <Icon className={compact ? 'h-4 w-4' : 'h-4.5 w-4.5'} />
        </span>
        <span className="sr-only">
          {item.label}
          {item.badge ? ` — ${item.badgeHint}` : ''}
        </span>
        {!!item.badge && (
          <span aria-hidden className="absolute right-2.5 top-1 h-2.5 w-2.5 rounded-full bg-orange-600 ring-2 ring-surface" />
        )}
      </Link>
    );
  }
  return (
    <Link
      to={item.to}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-2 font-semibold transition-colors',
        compact ? 'py-1.5 text-sm' : 'py-1 text-[15px]',
        active ? 'bg-brand-500/10 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
      )}
    >
      {/* Mục đang mở: ô nổi khối màu thương hiệu; mục khác: biểu tượng một màu, không nền (đỡ rối mắt) */}
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-[10px] transition-transform duration-200',
          compact ? 'h-7 w-7' : 'h-8 w-8',
          active ? 'icon-tile bg-brand text-white' : 'group-hover:scale-110',
        )}
      >
        <Icon className={compact ? 'h-4 w-4' : 'h-4.5 w-4.5'} />
      </span>
      <span className={cn('flex-1 truncate', active && 'font-bold')}>{item.label}</span>
      {!!item.badge && (
        <span
          title={item.badgeHint}
          aria-label={item.badgeHint}
          className="rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-[0_2px_6px_-1px_color-mix(in_oklab,var(--color-orange-600)_60%,transparent)]"
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </Link>
  );
}

/**
 * Thanh bên trái (máy tính). Thu gọn được thành cột biểu tượng (nút đầu thanh trên cùng hoặc Ctrl+B) để nhường chỗ cho
 * nội dung; trạng thái nhớ cho mọi trang. Đổi độ rộng tức thì, không làm hiệu ứng: animate width bắt cả trang tính lại
 * bố cục mỗi khung hình (giật trên trang video).
 */
function Sidebar() {
  const nav = useNav();
  const secondary = useSecondaryNav();
  const { openLookup, sidebarCollapsed: collapsed } = useUi();
  return (
    <aside
      id="sidebar"
      className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface py-5 lg:flex', collapsed ? 'w-19 px-2' : 'w-64 px-3')}
    >
      <div className={collapsed ? 'flex justify-center' : 'px-2'}>
        <Logo compact={collapsed} />
      </div>
      {collapsed ? (
        <button
          type="button"
          onClick={() => openLookup()}
          className={cn(ICON_BUTTON, 'mx-auto mt-5 border border-line bg-surface-2/60')}
          aria-label="Tra từ nhanh (Ctrl K)"
          title="Tra từ nhanh (Ctrl K)"
        >
          <Search className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openLookup()}
          className="mx-1 mt-5 flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 text-sm text-muted shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] transition hover:border-brand-300 hover:text-ink"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Tra từ nhanh…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      )}
      <nav className="scrollbar-thin -mx-1 mt-3 flex-1 space-y-0.5 overflow-y-auto px-1" aria-label="Điều hướng chính">
        {nav.map((item, i) => (
          <div key={item.to}>
            {item.group &&
              item.group !== nav[i - 1]?.group &&
              (collapsed ? (
                // Thu gọn: tên nhóm thành vạch ngăn mảnh — vẫn thấy các mục được gom nhóm
                <div aria-hidden className="mx-3 my-2.5 border-t border-line" />
              ) : (
                <p className="px-2 pb-1 pt-4 text-[11px] font-bold uppercase tracking-widest text-muted/80">{item.group}</p>
              ))}
            <SidebarLink item={item} collapsed={collapsed} />
          </div>
        ))}
      </nav>
      <div className="-mx-1 mt-2 space-y-0.5 border-t border-line px-1 pt-2">
        {secondary.map((item) => (
          <SidebarLink key={item.to} item={item} compact collapsed={collapsed} />
        ))}
      </div>
    </aside>
  );
}

// Thanh dưới trên điện thoại: 4 việc dùng nhiều nhất + "Thêm"
const MOBILE_MAIN: Record<string, string> = { '/': 'Trang chủ', '/explore': 'Video', '/review': 'Ôn tập', '/notebook': 'Sổ từ' };

function MobileNav() {
  const nav = useNav();
  const [more, setMore] = useState(false);
  const location = useLocation();
  useEffect(() => setMore(false), [location.pathname]);
  const main = nav.filter((n) => n.to in MOBILE_MAIN);
  const secondary = useSecondaryNav();
  const rest = [...nav.filter((n) => !(n.to in MOBILE_MAIN)), ...secondary];
  const restActive = rest.some((n) => isActive(n, location.pathname));
  return (
    <>
      <nav className="glass fixed inset-x-0 bottom-0 z-30 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Điều hướng chính">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {main.map((item) => {
            const Icon = item.icon;
            const active = isActive(item, location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={cn('relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold', active ? 'text-ink' : 'text-muted')}
              >
                <span className={cn('flex h-7 w-14 items-center justify-center rounded-full transition-colors', active && 'bg-brand-500/15')}>
                  <Icon className={cn('h-5.5 w-5.5 transition-transform', active && 'scale-110 text-brand-600 dark:text-brand-300')} />
                </span>
                {MOBILE_MAIN[item.to]}
                {!!item.badge && <span className="absolute right-[24%] top-1.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-surface" />}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className={cn('flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold', more || restActive ? 'text-ink' : 'text-muted')}
          >
            <span className={cn('flex h-7 w-14 items-center justify-center rounded-full transition-colors', (more || restActive) && 'bg-brand-500/15')}>
              {more ? <X className="h-5.5 w-5.5" /> : <Menu className="h-5.5 w-5.5" />}
            </span>
            Thêm
          </button>
        </div>
      </nav>
      {more && (
        <div className="scrollbar-thin fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 max-h-[70dvh] animate-slide-up space-y-0.5 overflow-y-auto rounded-2xl border border-line bg-surface p-2 shadow-lift lg:hidden">
          {rest.map((item, i) => (
            <div key={item.to}>
              {item.group && item.group !== rest[i - 1]?.group && <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-muted/80">{item.group}</p>}
              {!item.group && rest[i - 1]?.group && <div className="my-1.5 border-t border-line" />}
              <SidebarLink item={item} onClick={() => setMore(false)} />
            </div>
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
          {user.role === 'admin' && (
            <NavLink to="/admin" role="menuitem" className={menuItem}>
              <ShieldCheck className="h-4 w-4 text-muted" /> Quản trị
            </NavLink>
          )}
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
  const { openLookup, sidebarCollapsed, toggleSidebar } = useUi();
  const sidebarLabel = sidebarCollapsed ? 'Mở rộng thanh bên (Ctrl B)' : 'Thu gọn thanh bên (Ctrl B)';
  return (
    <header className="glass sticky top-0 z-20 border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-1 px-4 sm:gap-1.5 sm:px-6">
        {/* Nút thu gọn thanh bên (máy tính): đặt ở thanh trên cùng như YouTube để không làm thanh bên dài thêm
            (thêm một hàng ở cuối thanh sẽ đẩy mục cuối xuống dưới mép màn hình laptop) */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-controls="sidebar"
          aria-label={sidebarLabel}
          title={sidebarLabel}
          className={cn(ICON_BUTTON, 'hidden lg:-ml-2 lg:inline-flex')}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        <div className="lg:hidden">
          <Logo compact />
        </div>
        <div className="flex-1" />
        <StreakChip />
        <WarmupButton />
        <button type="button" onClick={() => openLookup()} className={cn(ICON_BUTTON, 'lg:hidden')} aria-label="Tra từ nhanh">
          <Search className="h-5 w-5" />
        </button>
        <NavLink to="/glossary" className={cn(ICON_BUTTON, 'hidden sm:inline-flex lg:hidden')} aria-label="Giải thích thuật ngữ" title="Giải thích thuật ngữ khó hiểu">
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
    <div className="flex h-[60vh] items-center justify-center text-brand-500">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { openLookup, theme, toggleSidebar } = useUi();
  const location = useLocation();
  const navigationType = useNavigationType();
  const navType = useRef(navigationType);
  navType.current = navigationType;
  useHotkeys({ 'mod+k': () => openLookup(), 'mod+b': toggleSidebar });

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
            {/* Chuyển trang mượt (View Transitions API): trang cũ mờ đi, trang mới trượt nhẹ lên. Trình duyệt chưa hỗ trợ thì chuyển ngay như thường. */}
            <ViewTransition key={section} enter="page-in" exit="page-out" update="none" default="none">
              <div>{children ?? <Outlet />}</div>
            </ViewTransition>
          </Suspense>
        </main>
      </div>
      <MobileNav />
      <QuickLookup />
      <StartScreen />
      <MilestoneWatcher />
    </div>
  );
}
