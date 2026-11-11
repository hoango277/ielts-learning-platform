import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Cpu, Download, GraduationCap, KeyRound, Languages, LogOut, Monitor, Moon, Palette, PlugZap, Sun, Target, UserRound, Volume2, XCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/Button';
import { Card, ErrorBox, Field, Input, Segmented, Select, Skeleton, Switch } from '../components/ui/primitives';
import { enableReviewNotifications } from '../components/warmup/StartScreen';
import { useLogout, useMe } from '../hooks/useAuth';
import { api } from '../lib/api';
import { speak } from '../lib/speech';
import type { Settings as SettingsT } from '../lib/types';
import { cn } from '../lib/utils';
import { useUi, type Theme } from '../store/ui';

function Section({ icon, title, desc, children }: { icon: ReactNode; title: string; desc?: string; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">{icon}</span>
        <div>
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          {desc && <p className="text-sm text-muted">{desc}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
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
        <div className="grid gap-3 sm:grid-cols-3">
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
        <p className="text-sm text-muted">Tài khoản, dịch thuật, mục tiêu học, thuật toán ôn tập và giao diện.</p>
      </div>

      <AccountSection />

      <Section icon={<Languages className="h-5 w-5 text-sky-500" />} title="Dịch thuật" desc="Dùng khi tra từ, dịch phụ đề song ngữ và câu ví dụ.">
        <Row label="Nhà cung cấp" hint="Tự động: dùng Hy-MT nếu đã cấu hình & đang chạy, lỗi thì chuyển sang Google.">
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
            <p className="font-bold text-ink">Tencent Hunyuan Hy-MT</p>
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
            Mô hình dịch mã nguồn mở của Tencent (HY-MT1.5 / Hy-MT2), hỗ trợ <b>dịch theo ngữ cảnh</b>: nghĩa của từ được dịch dựa trên cả câu
            trong video. Chạy model trên máy bạn qua bất kỳ server tương thích OpenAI (Ollama, llama.cpp, vLLM…).
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base URL (OpenAI-compatible)" htmlFor="hymt-url">
              <Input id="hymt-url" value={draft.hymtBaseUrl} onChange={(e) => set('hymtBaseUrl', e.target.value)} placeholder="http://localhost:11434/v1" />
            </Field>
            <Field label="Tên model" htmlFor="hymt-model">
              <Input id="hymt-model" value={draft.hymtModel} onChange={(e) => set('hymtModel', e.target.value)} placeholder="hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0" />
            </Field>
            <Field label="API key (nếu dùng dịch vụ có khoá)" htmlFor="hymt-key">
              <Input id="hymt-key" type="password" value={draft.hymtApiKey} onChange={(e) => set('hymtApiKey', e.target.value)} placeholder="để trống nếu chạy local" />
            </Field>
            <Field label="Mẫu prompt" htmlFor="hymt-style" hint="Theo đúng template trên model card của từng phiên bản.">
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
            <summary className="cursor-pointer font-semibold text-ink">Cách chạy Hy-MT trên máy</summary>
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

      <Section icon={<Target className="h-5 w-5 text-amber-500" />} title="Mục tiêu & ôn tập" desc="Thuật toán FSRS tự tính lịch ôn dựa trên độ khó và độ ổn định trí nhớ.">
        <Row label="Mục tiêu XP mỗi ngày" hint="Đạt mục tiêu để giữ chuỗi ngày học 🔥">
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
        <Row label={`Số thẻ mới mỗi ngày: ${draft.newCardsPerDay}`} hint="Nhiều thẻ mới → nhiều lượt ôn ở các ngày sau.">
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={draft.newCardsPerDay}
            onChange={(e) => set('newCardsPerDay', Number(e.target.value))}
            onMouseUp={() => save.mutate({ newCardsPerDay: draft.newCardsPerDay })}
            onKeyUp={() => save.mutate({ newCardsPerDay: draft.newCardsPerDay })}
            className="w-48 accent-violet-600"
            aria-label="Số thẻ mới mỗi ngày"
          />
        </Row>
        <Row label={`Tỉ lệ nhớ mong muốn: ${Math.round(draft.requestRetention * 100)}%`} hint="Cao hơn → ôn thường xuyên hơn nhưng nhớ chắc hơn. Khuyến nghị 90%.">
          <input
            type="range"
            min={0.8}
            max={0.97}
            step={0.01}
            value={draft.requestRetention}
            onChange={(e) => set('requestRetention', Number(e.target.value))}
            onMouseUp={() => save.mutate({ requestRetention: draft.requestRetention })}
            onKeyUp={() => save.mutate({ requestRetention: draft.requestRetention })}
            className="w-48 accent-violet-600"
            aria-label="Tỉ lệ nhớ mong muốn"
          />
        </Row>
      </Section>

      <div id="learning" className="scroll-mt-20">
        <Section icon={<GraduationCap className="h-5 w-5 text-emerald-500" />} title="Trình độ & kế hoạch học" desc="Dùng để đo độ khó video, gợi ý video vừa sức và lên kế hoạch mỗi ngày.">
          <Row
            label="Trình độ từ vựng hiện tại"
            hint="Từ thuộc nhóm phổ biến theo trình độ này (danh sách NGSL) được coi là bạn đã biết. Từ trong sổ (đã thuộc/đang ôn) luôn được tính."
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
          <Row label="Buổi học mỗi ngày" hint="Trang “Hôm nay học gì”: bản ngắn bỏ bước 4/3/2 và giảm số câu.">
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
          <Row label={`Thời gian chờ trước khi nói lại: ${draft.speakDelaySec} giây`} hint="Bài “Nghe – chờ – nói”: chờ lâu hơn = phải nhớ nhiều hơn, khó hơn.">
            <Segmented value={draft.speakDelaySec} onChange={(v) => commit('speakDelaySec', v)} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: `${n}s` }))} size="sm" />
          </Row>
          <Row
            label="Hộp “khởi động” khi mở app"
            hint="Sau khi đăng nhập, mở lại trang (tối đa 1 lần/giờ) hoặc quay lại tab sau ≥ 30 phút: ôn nhanh ~1 phút các thẻ sắp quên và xem kế hoạch hôm nay."
          >
            <Switch checked={draft.startScreen === 'auto'} onChange={(v) => commit('startScreen', v ? 'auto' : 'off')} label="Hộp khởi động khi mở app" />
          </Row>
          <Row label="Ôn buổi sáng từ học tối qua" hint="Trước 12 giờ trưa, ưu tiên nhớ lại các từ học hôm qua — ôn sau một đêm ngủ giúp nhớ lâu hơn.">
            <Switch checked={draft.morningReview} onChange={(v) => commit('morningReview', v)} label="Ôn buổi sáng" />
          </Row>
          <Row
            label="Thông báo khi có thẻ sắp quên"
            hint={
              typeof Notification === 'undefined'
                ? 'Trình duyệt không hỗ trợ thông báo.'
                : Notification.permission === 'denied'
                  ? 'Trình duyệt đang chặn thông báo của trang — bấm biểu tượng ổ khoá cạnh địa chỉ trang để cho phép.'
                  : 'Chỉ khi app đang mở trong một tab, 8h–22h, tối đa 2 lần/ngày; buổi tối nhắc học từ mới nếu hôm nay chưa học.'
            }
          >
            <Switch
              checked={draft.notifyReviews}
              onChange={async (v) => {
                if (!v) return commit('notifyReviews', false);
                const ok = await enableReviewNotifications(qc).catch(() => false);
                if (ok) set('notifyReviews', true);
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
            <input
              type="range"
              min={0.6}
              max={1.2}
              step={0.05}
              value={draft.ttsRate}
              onChange={(e) => set('ttsRate', Number(e.target.value))}
              onMouseUp={() => save.mutate({ ttsRate: draft.ttsRate })}
              className="w-40 accent-violet-600"
              aria-label="Tốc độ giọng đọc"
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
        <Row label="Tự dừng sau mỗi câu" hint="Bật sẵn khi mở video (phím A để đổi nhanh).">
          <Switch checked={draft.autoPause} onChange={(v) => commit('autoPause', v)} label="Tự dừng sau mỗi câu" />
        </Row>
        <Row label="Hiện bản dịch song ngữ mặc định">
          <Switch checked={draft.showTranslation} onChange={(v) => commit('showTranslation', v)} label="Hiện bản dịch" />
        </Row>
        <Row label="Số lần nghe mỗi câu khi shadowing">
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

      <Section icon={<Download className="h-5 w-5 text-emerald-500" />} title="Dữ liệu" desc="Dữ liệu được lưu trong SQLite trên máy chủ (backend/data/ielts-learn.db), mỗi tài khoản một sổ từ riêng.">
        <div className="flex flex-wrap gap-2">
          <a href={api.exportUrl('csv')}>
            <Button variant="outline" icon={<Download className="h-4 w-4" />}>
              Xuất sổ từ (CSV)
            </Button>
          </a>
          <a href={api.exportUrl('anki')}>
            <Button variant="outline" icon={<Download className="h-4 w-4" />}>
              Xuất cho Anki
            </Button>
          </a>
        </div>
      </Section>
    </div>
  );
}
