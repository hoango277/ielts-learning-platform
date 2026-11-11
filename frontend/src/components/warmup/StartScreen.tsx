import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Brain, CheckCircle2, ChevronRight, Moon, Sun, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useMe } from '../../hooks/useAuth';
import { useHotkeys } from '../../hooks/useHotkeys';
import { api } from '../../lib/api';
import type { Settings, WarmupItem } from '../../lib/types';
import { cn, localDayKey } from '../../lib/utils';
import { KEY_AFTER_LOGIN, useUi, type WarmupTrigger } from '../../store/ui';
import { ChunkSentence } from '../../pages/Review';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Progress } from '../ui/primitives';
import { ClipPlayer } from '../video/ClipPlayer';
import { AudioButton, Highlight, useSettings } from '../word/bits';

/**
 * Hộp "khởi động" khi đăng nhập / mở lại app / quay lại tab:
 *  - ôn nhanh vài thẻ sắp quên (~90 giây, theo khả năng nhớ FSRS; buổi sáng ưu tiên từ học tối qua)
 *  - tiến độ "Hôm nay học gì" và bước tiếp theo
 * Quy tắc để không làm phiền: chỉ hiện khi có việc cần làm, không bật giữa lúc đang xem video / làm bài
 * (khi đó chỉ hiện nút nhỏ), giới hạn tần suất, có "Để sau" và "Hôm nay không hiện nữa".
 */

const KEY_LAST = 'warmup-last-shown';
const KEY_SNOOZE = 'warmup-snooze-until';
const KEY_HIDE_DAY = 'warmup-hide-day';
const REOPEN_GAP_MS = 60 * 60_000; // mở lại trang: tối đa 1 lần / giờ
const RETURN_AFTER_MS = 30 * 60_000; // quay lại tab sau ≥ 30 phút
const SNOOZE_MS = 2 * 3600_000;

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* chế độ riêng tư */
    }
  },
};

/** Trang đang làm dở (xem video, làm bài, ghi âm) → không bật hộp đè lên, chỉ hiện nút nhỏ. */
function isBusyRoute(pathname: string, search: string) {
  return /^\/(watch|practice\/play|review|fluency\/\d+)/.test(pathname) || (pathname === '/speaking' && search.includes('mode='));
}

// ---------- Ôn nhanh ----------

const RATINGS = [
  { value: 1 as const, label: 'Quên', className: 'bg-rose-500 hover:bg-rose-600' },
  { value: 2 as const, label: 'Khó', className: 'bg-amber-500 hover:bg-amber-600' },
  { value: 3 as const, label: 'Nhớ', className: 'bg-emerald-500 hover:bg-emerald-600' },
  { value: 4 as const, label: 'Dễ', className: 'bg-sky-500 hover:bg-sky-600' },
];

function MemoryBadge({ item }: { item: WarmupItem }) {
  const pct = Math.round(item.retrievability * 100);
  const reason =
    item.reason === 'slept'
      ? '🌙 Học tối qua'
      : item.reason === 'overdue'
        ? item.overdueDays > 0
          ? `Quá hạn ${item.overdueDays} ngày`
          : 'Đến hạn'
        : 'Đến hạn hôm nay';
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-bold">
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">{reason}</span>
      <span
        className={cn(
          'rounded-full px-2 py-0.5',
          pct < 70 ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' : pct < 85 ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
        )}
        title="Khả năng bạn còn nhớ thẻ này lúc này (ước tính theo FSRS)"
      >
        Còn nhớ ~{pct}%
      </span>
    </div>
  );
}

function QuickCard({ item, flipped }: { item: WarmupItem; flipped: boolean }) {
  if (item.kind === 'word') {
    const c = item.card;
    const ex = c.examples[0];
    return (
      <div className="space-y-3 text-center">
        <MemoryBadge item={item} />
        <div className="flex items-center justify-center gap-2">
          <p className="text-3xl font-extrabold text-ink">{c.term}</p>
          <AudioButton term={c.term} audio={c.audio} />
        </div>
        {c.ipa && <p className="font-mono text-sm text-muted">{c.ipa}</p>}
        {flipped && (
          <div className="animate-fade-in space-y-2">
            <p className="text-xl font-bold text-violet-700 dark:text-violet-300">{c.meaning}</p>
            {c.definition && <p className="text-sm text-muted">{c.definition}</p>}
            {ex && (
              <p className="text-sm italic text-muted">
                “<Highlight text={ex.en} term={c.term} />”
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
  const p = item.card;
  return (
    <div className="space-y-3 text-center">
      <MemoryBadge item={item} />
      <div className="flex justify-center">
        <ClipPlayer clip={{ videoId: p.videoId, start: p.start, end: p.end, text: p.sentence }} size="sm" />
      </div>
      <p className="text-lg font-semibold leading-relaxed text-ink">
        <ChunkSentence sentence={p.sentence} chunk={p.chunk} hidden={!flipped} />
      </p>
      {flipped && (
        <div className="animate-fade-in space-y-1 text-sm">
          {p.chunk && (
            <p>
              <b className="text-violet-700 dark:text-violet-300">{p.chunk}</b>
              {p.chunkVi && <span className="text-ink"> — {p.chunkVi}</span>}
            </p>
          )}
          {p.sentenceVi && <p className="text-muted">{p.sentenceVi}</p>}
        </div>
      )}
    </div>
  );
}

function QuickReview({ items, available }: { items: WarmupItem[]; available: number }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const closeWarmup = useUi((s) => s.closeWarmup);
  const [queue, setQueue] = useState(items);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [xp, setXp] = useState(0);
  const requeued = useRef(new Set<string>());
  const total = items.length;
  const item = queue[0];

  const rate = useMutation({
    mutationFn: async ({ target, rating }: { target: WarmupItem; rating: 1 | 2 | 3 | 4 }) =>
      target.kind === 'word'
        ? api.review(target.card.id, rating).then((r) => ({ xp: r.xp, card: r.card as WarmupItem['card'] }))
        : api.reviewPhrase(target.card.id, rating, 'warmup').then((r) => ({ xp: r.xp, card: r.phrase as WarmupItem['card'] })),
    onSuccess: (res, { target, rating }) => {
      setXp((x) => x + res.xp);
      setDone((d) => d + 1);
      setFlipped(false);
      setQueue((q) => {
        const rest = q.slice(1);
        // Quên → hỏi lại một lần ở cuối lượt (nhớ lại được ít nhất một lần mới thôi)
        const key = `${target.kind}:${target.card.id}`;
        if (rating === 1 && !requeued.current.has(key)) {
          requeued.current.add(key);
          return [...rest, { ...target, card: res.card } as WarmupItem];
        }
        return rest;
      });
      for (const k of ['overview', 'review-queue', 'today', 'words', 'phrases']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const doRate = (r: 1 | 2 | 3 | 4) => item && flipped && !rate.isPending && rate.mutate({ target: item, rating: r });
  useHotkeys(item ? { space: () => setFlipped((f) => !f), Enter: () => (flipped ? doRate(3) : setFlipped(true)), '1': () => doRate(1), '2': () => doRate(2), '3': () => doRate(3), '4': () => doRate(4) } : {});

  if (!item) {
    const more = available - total;
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-500/10">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="font-bold text-emerald-900 dark:text-emerald-100">
          Khởi động xong {total} thẻ · +{xp} XP
        </p>
        {more > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              closeWarmup();
              navigate('/review');
            }}
          >
            Ôn tiếp {more} thẻ khác đến hạn hôm nay →
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Brain className="h-4 w-4 text-fuchsia-500" /> Sắp quên
        <Progress value={done / Math.max(1, done + queue.length)} className="h-1.5 flex-1" />
        <span>
          {Math.min(done + 1, done + queue.length)}/{done + queue.length}
        </span>
      </div>
      <div className="min-h-44 rounded-2xl border border-line p-4">
        <QuickCard key={`${item.kind}:${item.card.id}:${done}`} item={item} flipped={flipped} />
      </div>
      {flipped ? (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              disabled={rate.isPending}
              onClick={() => doRate(r.value)}
              className={cn('flex flex-col items-center rounded-xl py-2 text-white transition active:scale-95 disabled:opacity-60', r.className)}
            >
              <span className="text-sm font-extrabold">{r.label}</span>
              <span className="text-[11px] text-white/85">{item.card.preview[r.value]}</span>
            </button>
          ))}
        </div>
      ) : (
        <Button variant="primary" className="w-full" onClick={() => setFlipped(true)}>
          Hiện đáp án <span className="ml-1 text-xs opacity-80">(Space)</span>
        </Button>
      )}
    </div>
  );
}

// ---------- Nhắc nhở bằng thông báo trình duyệt ----------

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/** Xin quyền thông báo — chỉ gọi từ một cú bấm của người dùng (trình duyệt chặn nếu tự hỏi khi tải trang). */
export async function enableReviewNotifications(qc: ReturnType<typeof useQueryClient>) {
  if (!notificationsSupported()) {
    toast.error('Trình duyệt này không hỗ trợ thông báo.');
    return false;
  }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') {
    toast.error('Trình duyệt đang chặn thông báo. Bấm biểu tượng ổ khoá cạnh địa chỉ trang để cho phép.');
    return false;
  }
  const s = await api.updateSettings({ notifyReviews: true });
  qc.setQueryData(['settings'], s);
  new Notification('IELTS Learn', { body: 'Đã bật nhắc nhở: app sẽ báo khi có từ sắp quên (tối đa 2 lần/ngày).', icon: '/favicon.svg', tag: 'ielts-learn-test' });
  return true;
}

function NotifyOptIn({ settings }: { settings: Settings | undefined }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!notificationsSupported() || !settings) return null;
  if (settings.notifyReviews && Notification.permission === 'granted') return null;
  if (Notification.permission === 'denied') return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-violet-50 p-3 text-sm dark:bg-violet-500/10">
      <BellRing className="h-5 w-5 shrink-0 text-violet-500" />
      <p className="flex-1 text-ink">
        Nhắc tôi khi có từ sắp quên <span className="text-muted">(khi app đang mở trong một tab, tối đa 2 lần/ngày)</span>
      </p>
      <Button
        size="sm"
        variant="soft"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await enableReviewNotifications(qc).catch(() => undefined);
          setBusy(false);
        }}
      >
        Bật nhắc nhở
      </Button>
    </div>
  );
}

const NOTIFY = { checkMs: 10 * 60_000, gapMs: 3 * 3600_000, maxPerDay: 2, fromHour: 8, toHour: 22 };

/**
 * Khi tab app đang mở nhưng người dùng làm việc khác: có thẻ quá hạn → thông báo; 20–22h chưa học từ mới →
 * nhắc học vài từ trước khi ngủ (sáng mai sẽ được ôn lại). Không có máy chủ push nên chỉ chạy khi tab còn mở.
 */
function useReviewNotifications(settings: Settings | undefined) {
  const navigate = useNavigate();
  const openWarmup = useUi((s) => s.openWarmup);
  const enabled = Boolean(settings?.notifyReviews) && notificationsSupported();
  useEffect(() => {
    if (!enabled) return;
    const check = async () => {
      if (Notification.permission !== 'granted' || !document.hidden) return;
      const now = new Date();
      const hour = now.getHours();
      if (hour < NOTIFY.fromHour || hour >= NOTIFY.toHour) return;
      const day = localDayKey(now);
      const log = JSON.parse(store.get('notify-log') ?? '{}') as { day?: string; count?: number; last?: number };
      const count = log.day === day ? (log.count ?? 0) : 0;
      if (count >= NOTIFY.maxPerDay || Date.now() - (log.last ?? 0) < NOTIFY.gapMs) return;
      let title = '';
      let body = '';
      let action: () => void = () => undefined;
      try {
        const w = await api.warmup();
        if (w.overdue >= 3 || (w.overdue > 0 && w.items.some((i) => i.retrievability < 0.8))) {
          title = `🧠 ${w.overdue} thẻ sắp quên`;
          body = 'Ôn nhanh khoảng 1 phút để giữ chúng trong trí nhớ.';
          action = () => openWarmup('notification');
        } else if (hour >= 20) {
          const o = await api.overview();
          if (o.today.newWords === 0) {
            title = '🌙 Học vài từ mới trước khi ngủ';
            body = 'Học buổi tối, sáng mai ôn lại — giấc ngủ giúp bạn nhớ lâu hơn.';
            action = () => navigate('/today');
          }
        }
      } catch {
        return;
      }
      if (!title) return;
      const n = new Notification(title, { body, icon: '/favicon.svg', tag: 'ielts-learn-review' });
      n.onclick = () => {
        window.focus();
        n.close();
        action();
      };
      store.set('notify-log', JSON.stringify({ day, count: count + 1, last: Date.now() }));
    };
    const t = window.setInterval(() => void check(), NOTIFY.checkMs);
    const onHide = () => document.hidden && window.setTimeout(() => void check(), 60_000);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [enabled, navigate, openWarmup]);
}

// ---------- Hộp khởi động + điều kiện hiện ----------

function WarmupModal({ settings }: { settings: Settings | undefined }) {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const { warmup, closeWarmup } = useUi();
  const w = useQuery({ queryKey: ['warmup'], queryFn: api.warmup, enabled: warmup.open, staleTime: 30_000 });
  const t = useQuery({ queryKey: ['today'], queryFn: api.today, enabled: warmup.open, staleTime: 15_000 });
  // Giữ nguyên danh sách thẻ trong lúc hộp đang mở (không đổi giữa chừng khi dữ liệu được làm mới)
  const [snapshot, setSnapshot] = useState<{ items: WarmupItem[]; available: number } | null>(null);
  useEffect(() => {
    if (!warmup.open) setSnapshot(null);
    else if (w.data && !snapshot) setSnapshot({ items: w.data.items, available: w.data.available });
  }, [warmup.open, w.data, snapshot]);

  const morning = w.data?.morning && (w.data?.slept ?? 0) > 0;
  const name = user?.name?.trim().split(/\s+/).pop();
  const title = morning
    ? 'Chào buổi sáng ☀️'
    : warmup.trigger === 'login'
      ? `Chào ${name ?? 'bạn'}! 👋`
      : warmup.trigger === 'return'
        ? 'Chào mừng quay lại 👋'
        : 'Khởi động nhanh 🧠';
  const subtitle = morning
    ? 'Nhớ lại những từ bạn học tối qua — ôn lại sau một đêm ngủ giúp nhớ lâu hơn.'
    : snapshot?.items.length
      ? `Ôn ${snapshot.items.length} thẻ sắp quên trong khoảng 1 phút, rồi tiếp tục kế hoạch hôm nay.`
      : 'Không có thẻ nào sắp quên. Tiếp tục kế hoạch hôm nay nhé!';

  const next = t.data?.steps.find((s) => !s.done && !s.skipped && !s.blocked) ?? t.data?.steps.find((s) => !s.done && !s.skipped);

  return (
    <Modal
      open={warmup.open}
      onClose={closeWarmup}
      title={
        <span className="flex items-center gap-2">
          {morning ? <Sun className="h-5 w-5 text-amber-500" /> : <Brain className="h-5 w-5 text-fuchsia-500" />} {title}
        </span>
      }
      description={subtitle}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                store.set(KEY_SNOOZE, String(Date.now() + SNOOZE_MS));
                closeWarmup();
              }}
            >
              Để sau 2 giờ
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                store.set(KEY_HIDE_DAY, localDayKey());
                closeWarmup();
              }}
            >
              Hôm nay không hiện nữa
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={closeWarmup}>
            Đóng
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {snapshot ? (
          snapshot.items.length > 0 && <QuickReview items={snapshot.items} available={snapshot.available} />
        ) : (
          <div className="h-44 animate-pulse rounded-2xl bg-surface-2" />
        )}

        {t.data && (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-ink">Hôm nay học gì</span>
              <Progress value={t.data.total ? t.data.finished / t.data.total : 0} className="h-1.5 flex-1" />
              <span className="text-xs font-semibold text-muted">
                {t.data.finished}/{t.data.total} bước
              </span>
            </div>
            {t.data.allDone ? (
              <p className="text-sm text-muted">Bạn đã xong kế hoạch hôm nay 🎉</p>
            ) : (
              next && (
                <button
                  type="button"
                  onClick={() => {
                    closeWarmup();
                    navigate(next.link);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl bg-surface px-3 py-2 text-left text-sm transition hover:bg-surface-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">Tiếp tục: {next.title}</span>
                    <span className="block truncate text-xs text-muted">{next.desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </button>
              )
            )}
          </div>
        )}

        <NotifyOptIn settings={settings} />
      </div>
    </Modal>
  );
}

export function StartScreen() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const location = useLocation();
  const { warmup, openWarmup } = useUi();
  const [pill, setPill] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = isBusyRoute(location.pathname, location.search);
  const hiddenAt = useRef<number | null>(null);
  const started = useRef(false);

  useReviewNotifications(settings);

  const evaluate = useCallback(
    async (trigger: WarmupTrigger) => {
      if (!settings || settings.startScreen === 'off') return;
      if (Number(store.get(KEY_SNOOZE) ?? 0) > Date.now() || store.get(KEY_HIDE_DAY) === localDayKey()) return;
      try {
        const [w, t] = await Promise.all([
          qc.fetchQuery({ queryKey: ['warmup'], queryFn: api.warmup, staleTime: 0 }),
          qc.fetchQuery({ queryKey: ['today'], queryFn: api.today, staleTime: 0 }),
        ]);
        // Chỉ hiện khi thật sự có việc: thẻ sắp quên hoặc kế hoạch hôm nay chưa xong
        if (!w.items.length && t.allDone) return;
      } catch {
        return;
      }
      if (busyRef.current || document.body.dataset.modalOpen) {
        setPill(true);
        return;
      }
      store.set(KEY_LAST, String(Date.now()));
      openWarmup(trigger);
    },
    [settings, qc, openWarmup],
  );

  // Đăng nhập xong / mở app (lần đầu sau ≥ 1 giờ) — chờ trang hiện xong rồi mới mở
  useEffect(() => {
    if (!settings || started.current) return;
    started.current = true;
    let afterLogin = false;
    try {
      afterLogin = sessionStorage.getItem(KEY_AFTER_LOGIN) === '1';
      sessionStorage.removeItem(KEY_AFTER_LOGIN);
    } catch {
      /* bỏ qua */
    }
    const last = Number(store.get(KEY_LAST) ?? 0);
    if (!afterLogin && Date.now() - last < REOPEN_GAP_MS) return;
    const t = window.setTimeout(() => void evaluate(afterLogin ? 'login' : 'open'), 700);
    return () => window.clearTimeout(t);
  }, [settings, evaluate]);

  // Quay lại tab sau một lúc
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      const last = Number(store.get(KEY_LAST) ?? 0);
      if (away >= RETURN_AFTER_MS && Date.now() - last >= RETURN_AFTER_MS) void evaluate('return');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [evaluate]);

  useEffect(() => {
    if (warmup.open) setPill(false);
  }, [warmup.open]);

  return (
    <>
      <WarmupModal settings={settings} />
      {pill && !warmup.open && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex animate-slide-up items-center gap-1 rounded-full bg-ink py-1 pl-1 pr-1 text-bg shadow-2xl lg:bottom-6">
          <button
            type="button"
            onClick={() => {
              store.set(KEY_LAST, String(Date.now()));
              openWarmup('manual');
            }}
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/10"
          >
            <Brain className="h-4 w-4 text-fuchsia-300" /> Ôn nhanh thẻ sắp quên
          </button>
          <button type="button" onClick={() => setPill(false)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Ẩn">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}

/** Nút trên thanh đầu trang: mở hộp ôn nhanh bất cứ lúc nào, kèm số thẻ quá hạn. */
export function WarmupButton() {
  const openWarmup = useUi((s) => s.openWarmup);
  const { data } = useQuery({ queryKey: ['warmup'], queryFn: api.warmup, staleTime: 60_000 });
  const n = data?.overdue ?? 0;
  const morning = data?.morning && (data?.slept ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={() => openWarmup('manual')}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-ink"
      aria-label={`Ôn nhanh thẻ sắp quên${n ? ` (${n} thẻ quá hạn)` : ''}`}
      title="Ôn nhanh thẻ sắp quên"
    >
      {morning ? <Moon className="h-5 w-5 text-indigo-400" /> : <Brain className="h-5 w-5" />}
      {n > 0 && <span className="absolute right-1 top-1 rounded-full bg-fuchsia-500 px-1 text-[10px] font-bold leading-4 text-white">{n > 99 ? '99+' : n}</span>}
    </button>
  );
}
