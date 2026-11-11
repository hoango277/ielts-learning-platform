import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleHelp, Cpu, Download, GraduationCap, KeyRound, Languages, LogOut, Monitor, Moon, Palette, PlugZap, Sun, Target, UserRound, Volume2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../components/ui/Button';
import { Card, ErrorBox, Field, Input, Segmented, Select, Skeleton, Switch } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { disableReviewNotifications, enableReviewNotifications } from '../components/warmup/StartScreen';
import { pushSupported } from '../lib/push';
import { useLogout, useMe } from '../hooks/useAuth';
import { api } from '../lib/api';
import { speak } from '../lib/speech';
import type { Settings as SettingsT } from '../lib/types';
import { cn } from '../lib/utils';
import { useUi, type Theme } from '../store/ui';

function Section({ icon, title, desc, children }: { icon: ReactNode; title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 shadow-soft">{icon}</span>
        <div>
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          {desc && <p className="text-sm text-muted">{desc}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** Thanh trượt: cập nhật bản nháp ngay khi kéo, tự lưu sau khi ngừng kéo (chuột, cảm ứng lẫn bàn phím đều được). */
function Range({
  value,
  min,
  max,
  step,
  label,
  onChange,
  onCommit,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<number | null>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  // Rời trang khi chưa kịp lưu → lưu nốt giá trị đang chờ
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current !== null) commit.current(pending.current);
    },
    [],
  );
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => {
        const v = Number(e.target.value);
        onChange(v);
        pending.current = v;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          pending.current = null;
          commit.current(v);
        }, 500);
      }}
      className={cn('w-48 accent-violet-600', className)}
    />
  );
}

function AccountSection() {
  const qc = useQueryClient();
  const { data: user } = useMe();
  const logout = useLogout();
  const [name, setName] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  const saveName = useMutation({
    mutationFn: () => api.updateProfile(name.trim()),
    onSuccess: ({ user: u }) => {
      qc.setQueryData(['me'], u);
      toast.success('Đã đổi tên hiển thị');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const changePw = useMutation({
    mutationFn: async () => {
      if (pw.next !== pw.confirm) throw new Error('Mật khẩu mới nhập lại không khớp.');
      return api.changePassword({ currentPassword: pw.current, newPassword: pw.next });
    },
    onSuccess: (r) => {
      setPw({ current: '', next: '', confirm: '' });
      setPwError(null);
      toast.success('Đã đổi mật khẩu', {
        description: r.otherSessionsClosed ? `Đã đăng xuất ${r.otherSessionsClosed} phiên trên thiết bị khác.` : undefined,
      });
    },
    onError: (e) => setPwError((e as Error).message),
  });

  if (!user) return null;
  return (
    <Section icon={<UserRound className="h-5 w-5 text-violet-500" />} title="Tài khoản" desc={`Đăng nhập bằng ${user.email}`}>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && name.trim() !== user.name) saveName.mutate();
        }}
      >
        <div className="min-w-[220px] flex-1">
          <Field label="Tên hiển thị" htmlFor="acc-name">
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
          </Field>
        </div>
        <Button type="submit" variant="soft" loading={saveName.isPending} disabled={!name.trim() || name.trim() === user.name}>
          Lưu tên
        </Button>
      </form>

      <form
        className="space-y-3 rounded-2xl border border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPwError(null);
          changePw.mutate();
        }}
      >
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <KeyRound className="h-4 w-4 text-amber-500" /> Đổi mật khẩu
        </p>
        {/* trường ẩn giúp trình quản lý mật khẩu biết đang đổi mật khẩu của tài khoản nào */}
        <input type="text" name="username" autoComplete="username" value={user.email} readOnly hidden />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Mật khẩu hiện tại" htmlFor="pw-current">
            <Input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="Mật khẩu mới" htmlFor="pw-new">
            <Input id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="Nhập lại mật khẩu mới" htmlFor="pw-confirm">
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
        </div>
        {pwError && (
          <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
            {pwError}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">Ít nhất 8 ký tự. Các thiết bị khác đang đăng nhập sẽ bị đăng xuất.</p>
          <Button type="submit" variant="outline" loading={changePw.isPending} disabled={!pw.current || !pw.next || !pw.confirm}>
            Đổi mật khẩu
          </Button>
        </div>
      </form>

      <Row label="Đăng xuất" hint="Thoát khỏi tài khoản trên trình duyệt này.">
        <Button variant="ghost" className="text-rose-600 dark:text-rose-400" icon={<LogOut className="h-4 w-4" />} loading={logout.isPending} onClick={() => logout.mutate()}>
          Đăng xuất
        </Button>
      </Row>
    </Section>
  );
}

const PRESETS = [
  { label: 'Ollama (máy bạn)', baseUrl: 'http://localhost:11434/v1', model: 'hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0', style: 'hymt15' as const },
  { label: 'llama.cpp server', baseUrl: 'http://localhost:8080/v1', model: 'hy-mt', style: 'hymt15' as const },
  { label: 'vLLM (Hy-MT2-7B)', baseUrl: 'http://localhost:8000/v1', model: 'tencent/Hy-MT2-7B', style: 'hymt2' as const },
];

/** Lối vào bài test ước lượng vốn từ + kết quả lần gần nhất. */
function PlacementRow() {
  const last = useQuery({ queryKey: ['placement-last'], queryFn: api.placementLast, staleTime: 60_000 });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-sm text-muted">
        {last.data
          ? `Bài test gần nhất (${new Date(last.data.createdAt ?? '').toLocaleDateString('vi-VN')}): mức ${last.data.level}, ước khoảng ${last.data.size.toLocaleString('vi-VN')} từ.`
          : 'Chưa chắc trình độ? Làm bài test ~3 phút để app ước lượng vốn từ của bạn.'}{' '}
        <Term k="placement" icon />
      </p>
      <LinkButton to="/placement" size="sm" variant="soft">
        {last.data ? 'Làm lại bài test' : 'Làm bài test'}
      </LinkButton>
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { theme, setTheme } = useUi();
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const [draft, setDraft] = useState<SettingsT | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<SettingsT>) => api.updateSettings(patch),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      qc.invalidateQueries({ queryKey: ['overview'] });
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      toast.success('Đã lưu cài đặt');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const test = useMutation({ mutationFn: () => api.testHymt(draft!) });
  // Bật/tắt nhắc nhở có thể chờ trình duyệt khá lâu → chặn bấm lặp trong lúc đang xử lý
  const [notifyBusy, setNotifyBusy] = useState(false);

  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (isPending || !draft) return <Skeleton className="mx-auto h-96 max-w-3xl" />;

  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const commit = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => {
    set(k, v);
    save.mutate({ [k]: v } as Partial<SettingsT>);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Cài đặt</h1>
        <p className="text-sm text-muted">
          Tài khoản, dịch thuật, mục tiêu học, lịch ôn tập và giao diện. Gặp mục khó hiểu? Bấm dấu <CircleHelp className="inline h-4 w-4 -translate-y-px" aria-label="hỏi chấm" /> cạnh mục đó hoặc xem{' '}
          <Link to="/glossary" className="font-semibold text-violet-600 hover:underline dark:text-violet-300">
            Giải thích thuật ngữ
          </Link>
          .
        </p>
      </div>

      <AccountSection />

      <Section icon={<Languages className="h-5 w-5 text-sky-500" />} title="Dịch thuật" desc="Dùng khi tra từ, dịch phụ đề song ngữ và câu ví dụ.">
        <Row
          label={
            <>
              Nguồn dịch <Term k="provider" icon />
            </>
          }
          hint={
            <>
              Tự động: dùng <Term k="hymt">Hy-MT</Term> nếu đã cài và đang chạy, gặp lỗi thì chuyển sang Google.
            </>
          }
        >
          <Segmented
            value={draft.translateProvider}
            onChange={(v) => commit('translateProvider', v)}
            options={[
              { value: 'auto', label: 'Tự động' },
              { value: 'google', label: 'Google' },
              { value: 'hymt', label: 'Hy-MT' },
            ]}
          />
        </Row>

        <div className="rounded-2xl border border-line p-4">
          <div className="mb-3 flex items-center gap-2">
            <Cpu className="h-5 w-5 text-violet-500" />
            <p className="flex items-center gap-1 font-bold text-ink">
              Model dịch Hy-MT (Tencent) <Term k="hymt" icon />
            </p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                data?.hymtConfigured ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-surface-2 text-muted',
              )}
            >
              {data?.hymtConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
            </span>
          </div>
          <p className="mb-4 text-sm leading-relaxed text-muted">
            Model dịch miễn phí của Tencent chạy ngay trên máy bạn, biết <b>dịch theo ngữ cảnh</b>: nghĩa của từ được chọn theo cả câu trong video. Phần này
            không bắt buộc — bỏ trống thì app dùng Google dịch. Nếu bạn chạy app bằng “npm run dev:hymt” hoặc Docker Compose kèm Hy-MT thì mọi thứ đã được điền
            sẵn.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                onClick={() => setDraft((d) => (d ? { ...d, hymtBaseUrl: p.baseUrl, hymtModel: p.model, hymtPromptStyle: p.style } : d))}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Địa chỉ máy chủ model (Base URL)" htmlFor="hymt-url" info={<Term k="base_url" icon />}>
              <Input id="hymt-url" value={draft.hymtBaseUrl} onChange={(e) => set('hymtBaseUrl', e.target.value)} placeholder="http://localhost:11434/v1" />
            </Field>
            <Field label="Tên model" htmlFor="hymt-model">
              <Input id="hymt-model" value={draft.hymtModel} onChange={(e) => set('hymtModel', e.target.value)} placeholder="hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0" />
            </Field>
            <Field label="Khoá API (nếu máy chủ yêu cầu)" htmlFor="hymt-key">
              <Input id="hymt-key" type="password" value={draft.hymtApiKey} onChange={(e) => set('hymtApiKey', e.target.value)} placeholder="để trống nếu chạy trên máy bạn" />
            </Field>
            <Field label="Mẫu câu lệnh (prompt)" htmlFor="hymt-style" info={<Term k="prompt_style" icon />} hint="Chọn đúng phiên bản model bạn đang chạy.">
              <Select id="hymt-style" value={draft.hymtPromptStyle} onChange={(e) => set('hymtPromptStyle', e.target.value as SettingsT['hymtPromptStyle'])}>
                <option value="hymt2">Hy-MT2 (2026)</option>
                <option value="hymt15">HY-MT1.5</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              loading={save.isPending}
              onClick={() =>
                save.mutate({ hymtBaseUrl: draft.hymtBaseUrl.trim(), hymtModel: draft.hymtModel.trim(), hymtApiKey: draft.hymtApiKey, hymtPromptStyle: draft.hymtPromptStyle })
              }
            >
              Lưu cấu hình Hy-MT
            </Button>
            <Button variant="outline" loading={test.isPending} icon={<PlugZap className="h-4 w-4" />} onClick={() => test.mutate()} disabled={!draft.hymtBaseUrl || !draft.hymtModel}>
              Kiểm tra kết nối
            </Button>
          </div>
          {test.data && (
            <div
              className={cn(
                'mt-3 flex items-start gap-2 rounded-xl p-3 text-sm',
                test.data.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
              )}
            >
              {test.data.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <div>
                <p className="font-semibold">
                  {test.data.message}
                  {test.data.latencyMs !== undefined && ` · ${(test.data.latencyMs / 1000).toFixed(1)}s`}
                </p>
                {test.data.sample && <p>“Practice makes perfect.” → {test.data.sample}</p>}
              </div>
            </div>
          )}
          <details className="mt-4 text-sm text-muted">
            <summary className="cursor-pointer font-semibold text-ink">Tự chạy Hy-MT bằng công cụ khác (nâng cao)</summary>
            <div className="mt-2 space-y-2 leading-relaxed">
              <p>
                <b>Ollama</b> (dễ nhất):
              </p>
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs text-ink">ollama pull hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0</pre>
              <p>
                <b>llama.cpp</b>:
              </p>
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs text-ink">llama-server -hf tencent/HY-MT1.5-1.8B-GGUF:Q8_0 --port 8080 --jinja</pre>
              <p>
                <b>vLLM</b> (GPU, Hy-MT2):
              </p>
              <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs text-ink">vllm serve tencent/Hy-MT2-7B --port 8000</pre>
              <p>Bản 1.8B (Q4/Q8 ≈ 1.1–1.9 GB) chạy được trên CPU; bản 7B nên dùng GPU.</p>
            </div>
          </details>
        </div>
      </Section>

      <Section
        icon={<Target className="h-5 w-5 text-amber-500" />}
        title="Mục tiêu & ôn tập"
        desc={
          <>
            App tự tính ngày ôn lại cho từng thẻ bằng thuật toán <Term k="fsrs">FSRS</Term> — hỏi lại đúng lúc bạn sắp quên.
          </>
        }
      >
        <Row
          label={
            <>
              Mục tiêu <Term k="xp">điểm XP</Term> mỗi ngày
            </>
          }
          hint={
            <>
              Đạt mục tiêu để giữ <Term k="streak">chuỗi ngày học</Term> 🔥
            </>
          }
        >
          <Segmented
            value={draft.dailyGoalXp}
            onChange={(v) => commit('dailyGoalXp', v)}
            options={[
              { value: 20, label: 'Nhẹ · 20' },
              { value: 50, label: 'Vừa · 50' },
              { value: 100, label: 'Chăm · 100' },
              { value: 200, label: 'Chiến · 200' },
            ]}
            size="sm"
          />
        </Row>
        <Row
          label={
            <>
              Số thẻ mới mỗi ngày: {draft.newCardsPerDay} <Term k="new_cards" icon />
            </>
          }
          hint="Nhiều thẻ mới hôm nay → nhiều lượt ôn ở các ngày sau. 10–20 là vừa sức."
        >
          <Range
            min={0}
            max={60}
            step={5}
            value={draft.newCardsPerDay}
            label="Số thẻ mới mỗi ngày"
            onChange={(v) => set('newCardsPerDay', v)}
            onCommit={(v) => save.mutate({ newCardsPerDay: v })}
          />
        </Row>
        <Row
          label={
            <>
              Tỉ lệ nhớ mong muốn: {Math.round(draft.requestRetention * 100)}% <Term k="retention" icon />
            </>
          }
          hint="Cao hơn → phải ôn thường xuyên hơn nhưng nhớ chắc hơn. Nên để 90%."
        >
          <Range
            min={0.8}
            max={0.97}
            step={0.01}
            value={draft.requestRetention}
            label="Tỉ lệ nhớ mong muốn"
            onChange={(v) => set('requestRetention', v)}
            onCommit={(v) => save.mutate({ requestRetention: v })}
          />
        </Row>
      </Section>

      <div id="learning" className="scroll-mt-20">
        <Section icon={<GraduationCap className="h-5 w-5 text-emerald-500" />} title="Trình độ & kế hoạch học" desc="Dùng để đo độ khó video, gợi ý video vừa sức và lên kế hoạch mỗi ngày.">
          <Row
            label={
              <>
                Trình độ từ vựng hiện tại <Term k="cefr" icon />
              </>
            }
            hint={
              <>
                App coi những từ phổ biến ở mức này (theo danh sách <Term k="ngsl">NGSL</Term>) là bạn đã biết, để tính video nào vừa sức. Từ trong sổ của bạn luôn được
                tính.
              </>
            }
          >
            <Segmented
              value={draft.vocabLevel}
              onChange={(v) => {
                commit('vocabLevel', v);
                qc.invalidateQueries({ queryKey: ['video-difficulty'] });
                qc.invalidateQueries({ queryKey: ['recommended'] });
                qc.invalidateQueries({ queryKey: ['today'] });
              }}
              options={[
                { value: 'A2', label: 'A2', title: '~1.000 từ phổ biến nhất' },
                { value: 'B1', label: 'B1', title: '~2.000 từ phổ biến nhất' },
                { value: 'B2', label: 'B2', title: '~2.800 từ NGSL + từ khá phổ biến' },
                { value: 'C1', label: 'C1', title: 'Gần như mọi từ thông dụng' },
              ]}
              size="sm"
            />
          </Row>
          <PlacementRow />
          <Row
            label="Buổi học mỗi ngày"
            hint={
              <>
                Trang “Hôm nay học gì”: bản ngắn bỏ <Term k="fluency_432">bài nói 4/3/2</Term> và giảm số câu.
              </>
            }
          >
            <Segmented
              value={draft.dailyPlanMode}
              onChange={(v) => {
                commit('dailyPlanMode', v);
                qc.invalidateQueries({ queryKey: ['today'] });
              }}
              options={[
                { value: 'short', label: 'Ngắn ~20 phút' },
                { value: 'standard', label: 'Chuẩn ~40 phút' },
              ]}
              size="sm"
            />
          </Row>
          <Row
            label={`Thời gian chờ trước khi nói lại: ${draft.speakDelaySec} giây`}
            hint={
              <>
                Bài <Term k="delayed_repeat">“Nghe – chờ – nói”</Term>: chờ lâu hơn = phải nhớ nhiều hơn, khó hơn.
              </>
            }
          >
            <Segmented value={draft.speakDelaySec} onChange={(v) => commit('speakDelaySec', v)} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}s` }))} size="sm" />
          </Row>
          <Row
            label={
              <>
                Hộp “khởi động” khi mở app <Term k="warmup" icon />
              </>
            }
            hint="Sau khi đăng nhập, mở lại trang (tối đa 1 lần/giờ) hoặc quay lại tab sau ≥ 30 phút: ôn nhanh ~1 phút các thẻ sắp quên và xem kế hoạch hôm nay."
          >
            <Switch checked={draft.startScreen === 'auto'} onChange={(v) => commit('startScreen', v ? 'auto' : 'off')} label="Hộp khởi động khi mở app" />
          </Row>
          <Row
            label={
              <>
                Ôn buổi sáng từ học tối qua <Term k="morning_review" icon />
              </>
            }
            hint="Trước 12 giờ trưa, ưu tiên nhớ lại các từ học hôm qua — ôn sau một đêm ngủ giúp nhớ lâu hơn."
          >
            <Switch checked={draft.morningReview} onChange={(v) => commit('morningReview', v)} label="Ôn buổi sáng" />
          </Row>
          <Row
            label={
              <>
                Thông báo khi có thẻ sắp quên <Term k="web_push" icon />
              </>
            }
            hint={
              typeof Notification === 'undefined'
                ? 'Trình duyệt không hỗ trợ thông báo.'
                : Notification.permission === 'denied'
                  ? 'Trình duyệt đang chặn thông báo của trang — bấm biểu tượng ổ khoá cạnh địa chỉ trang để cho phép.'
                  : pushSupported()
                    ? 'Máy chủ gửi nhắc kể cả khi bạn đã đóng tab (trình duyệt vẫn chạy): 8h–22h, tối đa 2 lần/ngày, cách nhau ≥ 3 giờ; buổi sáng nhắc từ học tối qua, buổi tối nhắc học từ mới.'
                    : 'Trình duyệt này không hỗ trợ thông báo đẩy — chỉ nhắc khi app đang mở trong một tab.'
            }
          >
            <Switch
              checked={draft.notifyReviews}
              onChange={async (v) => {
                if (notifyBusy) return;
                setNotifyBusy(true);
                try {
                  if (!v) {
                    set('notifyReviews', false);
                    await disableReviewNotifications(qc).catch(() => undefined);
                    return;
                  }
                  const ok = await enableReviewNotifications(qc).catch(() => false);
                  if (ok) set('notifyReviews', true);
                } finally {
                  setNotifyBusy(false);
                }
              }}
              label="Thông báo khi có thẻ sắp quên"
            />
          </Row>
        </Section>
      </div>

      <Section icon={<Volume2 className="h-5 w-5 text-rose-500" />} title="Phát âm & video">
        <Row label="Giọng phát âm ưu tiên">
          <Segmented
            value={draft.accent}
            onChange={(v) => commit('accent', v)}
            options={[
              { value: 'us', label: '🇺🇸 Anh-Mỹ' },
              { value: 'uk', label: '🇬🇧 Anh-Anh' },
            ]}
          />
        </Row>
        <Row label={`Tốc độ giọng đọc máy: ${draft.ttsRate}×`}>
          <div className="flex items-center gap-2">
            <Range
              min={0.6}
              max={1.2}
              step={0.05}
              value={draft.ttsRate}
              label="Tốc độ giọng đọc"
              onChange={(v) => set('ttsRate', v)}
              onCommit={(v) => save.mutate({ ttsRate: v })}
              className="w-40"
            />
            <Button size="sm" variant="ghost" onClick={() => speak('Practice makes perfect', { accent: draft.accent, rate: draft.ttsRate })}>
              Nghe thử
            </Button>
          </div>
        </Row>
        <Row label="Tốc độ phát video mặc định">
          <Select value={draft.playbackRate} onChange={(e) => commit('playbackRate', Number(e.target.value))} className="w-28" aria-label="Tốc độ video">
            {[0.5, 0.65, 0.75, 0.85, 1, 1.15, 1.25].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </Select>
        </Row>
        <Row
          label={
            <>
              Tự dừng sau mỗi câu <Term k="autopause" icon />
            </>
          }
          hint="Bật sẵn khi mở video (phím A để đổi nhanh)."
        >
          <Switch checked={draft.autoPause} onChange={(v) => commit('autoPause', v)} label="Tự dừng sau mỗi câu" />
        </Row>
        <Row
          label={
            <>
              Hiện bản dịch <Term k="bilingual">song ngữ</Term> mặc định
            </>
          }
        >
          <Switch checked={draft.showTranslation} onChange={(v) => commit('showTranslation', v)} label="Hiện bản dịch" />
        </Row>
        <Row
          label={
            <>
              Số lần nghe mỗi câu khi <Term k="shadowing">nói đuổi (shadowing)</Term>
            </>
          }
        >
          <Segmented value={draft.shadowRepeat} onChange={(v) => commit('shadowRepeat', v)} options={[1, 2, 3].map((n) => ({ value: n, label: `${n}×` }))} size="sm" />
        </Row>
      </Section>

      <Section icon={<Palette className="h-5 w-5 text-fuchsia-500" />} title="Giao diện">
        <Row label="Chế độ màu">
          <Segmented<Theme>
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <><Sun className="h-4 w-4" /> Sáng</> },
              { value: 'dark', label: <><Moon className="h-4 w-4" /> Tối</> },
              { value: 'system', label: <><Monitor className="h-4 w-4" /> Hệ thống</> },
            ]}
          />
        </Row>
      </Section>

      <Section
        icon={<Download className="h-5 w-5 text-emerald-500" />}
        title="Dữ liệu"
        desc="Dữ liệu học được lưu trên máy chủ đang chạy app; mỗi tài khoản có sổ từ riêng. Bạn có thể tải sổ từ về bất cứ lúc nào."
      >
        <div className="flex flex-wrap gap-2 pb-1">
          <LinkButton href={api.exportUrl('csv')} variant="outline" icon={<Download className="h-4 w-4" />}>
            Tải sổ từ (file CSV, mở bằng Excel)
          </LinkButton>
          <LinkButton href={api.exportUrl('anki')} variant="outline" icon={<Download className="h-4 w-4" />}>
            Tải cho Anki (app thẻ ghi nhớ)
          </LinkButton>
        </div>
      </Section>
    </div>
  );
}
