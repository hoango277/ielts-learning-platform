import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#100f0f' : '#f6f4eb');
}

interface LookupState {
  open: boolean;
  term: string;
}

/** Cờ (sessionStorage) do trang đăng nhập đặt để mở hộp khởi động ngay khi vào app */
export const KEY_AFTER_LOGIN = 'warmup-after-login';

/** Vì sao hộp khởi động được mở — để chọn lời chào phù hợp */
export type WarmupTrigger = 'login' | 'open' | 'return' | 'manual' | 'notification';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem('sidebar-collapsed') === '1';
  } catch {
    return false;
  }
}

interface UiState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Thanh điều hướng trái thu gọn thành cột biểu tượng (máy tính) — nhớ cho mọi trang và lần mở sau */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  /** Đang toàn màn hình (Fullscreen API, bật từ trang xem video): ẩn thanh bên / thanh trên cùng / thanh dưới */
  immersive: boolean;
  setImmersive: (v: boolean) => void;
  lookup: LookupState;
  openLookup: (term?: string) => void;
  closeLookup: () => void;
  warmup: { open: boolean; trigger: WarmupTrigger };
  openWarmup: (trigger: WarmupTrigger) => void;
  closeWarmup: () => void;
}

export const useUi = create<UiState>((set) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* bỏ qua */
    }
    applyTheme(theme);
    set({ theme });
  },
  sidebarCollapsed: readSidebarCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed;
      try {
        localStorage.setItem('sidebar-collapsed', sidebarCollapsed ? '1' : '0');
      } catch {
        /* chế độ ẩn danh: chỉ nhớ trong phiên */
      }
      return { sidebarCollapsed };
    }),
  immersive: false,
  setImmersive: (immersive) => set({ immersive }),
  lookup: { open: false, term: '' },
  openLookup: (term = '') => set({ lookup: { open: true, term } }),
  closeLookup: () => set((s) => ({ lookup: { ...s.lookup, open: false } })),
  warmup: { open: false, trigger: 'open' },
  openWarmup: (trigger) => set({ warmup: { open: true, trigger } }),
  closeWarmup: () => set((s) => ({ warmup: { ...s.warmup, open: false } })),
}));
