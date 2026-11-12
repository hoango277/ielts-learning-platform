import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Cpu, Languages, Plus, PlugZap, ShieldCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Row, Section } from '../components/settings/parts';
import { TopicForm } from '../components/topics/TopicForm';
import { Emoji3D } from '../components/ui/Emoji3D';
import { Button } from '../components/ui/Button';
import { ErrorBox, Field, Input, Segmented, Select, Skeleton, Switch } from '../components/ui/primitives';
import { Term } from '../components/ui/Term';
import { useMe } from '../hooks/useAuth';
import { api } from '../lib/api';
import type { AdminUser, ServerSettings } from '../lib/types';
import { cn, relativeTime } from '../lib/utils';

// Điền nhanh: địa chỉ tính từ MÁY CHỦ chạy app (localhost = chính máy chủ; Docker Compose kèm Hy-MT dùng tên dịch vụ "hymt")
const PRESETS = [
  { label: 'Docker Compose kèm Hy-MT', baseUrl: 'http://hymt:8080/v1', model: 'hy-mt', style: 'hymt15' as const },
  { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0', style: 'hymt15' as const },
  { label: 'llama.cpp server', baseUrl: 'http://localhost:8080/v1', model: 'hy-mt', style: 'hymt15' as const },
  { label: 'vLLM (Hy-MT2-7B)', baseUrl: 'http://localhost:8000/v1', model: 'tencent/Hy-MT2-7B', style: 'hymt2' as const },
];

/** Cấu hình dịch & mô hình AI — áp dụng cho mọi người dùng của máy chủ */
function TranslationSection({ data }: { data: ServerSettings }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ServerSettings>(data);
  // Chỉ nhận những khoá máy chủ thực sự đổi (không ghi đè ô đang sửa dở)
  const serverRef = useRef(data);
  useEffect(() => {
    const prev = serverRef.current;
    serverRef.current = data;
    setDraft((d) => {
      const next = { ...d } as Record<keyof ServerSettings, unknown>;
      for (const k of Object.keys(data) as (keyof ServerSettings)[]) if (!Object.is(data[k], prev[k])) next[k] = data[k];
      return next as ServerSettings;
    });
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<ServerSettings>) => api.updateAdminSettings(patch),
    onSuccess: (s) => {
      qc.setQueryData(['admin-settings'], s);
      toast.success('Đã lưu cấu hình máy chủ');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const test = useMutation({ mutationFn: () => api.testHymt(draft) });
  const set = <K extends keyof ServerSettings>(k: K, v: ServerSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Section
      id="translation"
      icon={<Languages className="h-5 w-5 text-sky-500" />}
      title="Dịch & mô hình AI"
      desc="Áp dụng cho mọi người dùng khi tra từ, dịch phụ đề song ngữ và câu ví dụ. Người dùng thường không thấy phần này."
    >
      <Row
        label={
          <>
            Nguồn dịch <Term k="provider" icon />
          </>
        }
        hint={
          <>
            Tự động: dùng <Term k="hymt">Hy-MT</Term> nếu đã cấu hình và đang chạy, gặp lỗi thì chuyển sang Google.
          </>
        }
      >
        <Segmented
          value={draft.translateProvider}
          onChange={(v) => {
            set('translateProvider', v);
            save.mutate({ translateProvider: v });
          }}
          options={[
            { value: 'auto', label: 'Tự động' },
            { value: 'google', label: 'Google' },
            { value: 'hymt', label: 'Hy-MT' },
          ]}
        />
      </Row>

      <div className="rounded-2xl border border-line p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Cpu className="h-5 w-5 text-brand-500" />
          <p className="flex items-center gap-1 font-bold text-ink">
            Mô hình dịch Hy-MT (Tencent) <Term k="hymt" icon />
          </p>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-semibold',
              data.hymtConfigured ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'bg-surface-2 text-muted',
            )}
          >
            {data.hymtConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
          </span>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          Mô hình dịch bạn tự chạy trên máy chủ, biết <b>dịch theo ngữ cảnh</b>: nghĩa của từ được chọn theo cả câu trong video. Bỏ trống thì app dùng Google
          dịch. Địa chỉ tính từ máy chủ chạy app (localhost là chính máy chủ). Chạy bằng Docker Compose kèm Hy-MT thì mọi thứ đã được điền sẵn.
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.label} size="sm" variant="outline" onClick={() => setDraft((d) => ({ ...d, hymtBaseUrl: p.baseUrl, hymtModel: p.model, hymtPromptStyle: p.style }))}>
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
          <Field label="Khoá API (nếu máy chủ model yêu cầu)" htmlFor="hymt-key">
            <Input id="hymt-key" type="password" autoComplete="off" value={draft.hymtApiKey} onChange={(e) => set('hymtApiKey', e.target.value)} placeholder="để trống nếu không cần" />
          </Field>
          <Field label="Mẫu câu lệnh (prompt)" htmlFor="hymt-style" info={<Term k="prompt_style" icon />} hint="Chọn đúng phiên bản model đang chạy.">
            <Select id="hymt-style" value={draft.hymtPromptStyle} onChange={(e) => set('hymtPromptStyle', e.target.value as ServerSettings['hymtPromptStyle'])}>
              <option value="hymt2">Hy-MT2 (2026)</option>
              <option value="hymt15">HY-MT1.5</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate({ hymtBaseUrl: draft.hymtBaseUrl.trim(), hymtModel: draft.hymtModel.trim(), hymtApiKey: draft.hymtApiKey, hymtPromptStyle: draft.hymtPromptStyle })}
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
        {test.error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">{(test.error as Error).message}</p>}
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
  );
}

function RegistrationSection({ data }: { data: ServerSettings }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: (allowRegistration: boolean) => api.updateAdminSettings({ allowRegistration }),
    onSuccess: (s) => {
      qc.setQueryData(['admin-settings'], s);
      qc.invalidateQueries({ queryKey: ['auth-status'] });
      toast.success(s.allowRegistration ? 'Đã mở đăng ký tài khoản mới' : 'Đã tắt đăng ký tài khoản mới');
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Section id="registration" icon={<UserPlus className="h-5 w-5 text-emerald-500" />} title="Đăng ký tài khoản">
      <Row label="Cho phép người khác tự tạo tài khoản" hint="Tắt khi chỉ những người bạn đã tạo tài khoản mới được dùng. Người đã có tài khoản vẫn đăng nhập bình thường.">
        <Switch checked={data.allowRegistration} onChange={(v) => save.mutate(v)} label="Cho phép đăng ký tài khoản mới" />
      </Row>
    </Section>
  );
}

const ROLE_LABEL: Record<AdminUser['role'], string> = { admin: 'Quản trị viên', user: 'Học viên' };

/** Bộ từ chung: chủ đề admin tạo thêm cho mọi học viên; thêm từ vào bất kỳ chủ đề nào ngay trên trang chủ đề */
function TopicsSection() {
  const topics = useQuery({ queryKey: ['topics'], queryFn: api.topics });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const custom = (topics.data ?? []).filter((t) => t.source === 'admin');
  return (
    <Section
      id="topics"
      icon={<BookOpen className="h-5 w-5 text-amber-500" />}
      title="Bộ từ chung"
      desc="Mở rộng bộ từ cho mọi học viên: tạo chủ đề mới, hoặc mở một chủ đề bất kỳ và bấm “Thêm từ vào bộ” (chỉ quản trị viên thấy nút này)."
    >
      <Row label="Chủ đề do quản trị viên tạo" hint="Mọi học viên đều thấy và luyện được. App tự tra nghĩa, phiên âm, câu ví dụ cho từ mới.">
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          Tạo chủ đề mới
        </Button>
      </Row>
      {custom.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {custom.map((t) => (
            <li key={t.slug}>
              <Link to={`/topics/${t.slug}`} className="card card-hover flex items-center gap-3 p-3">
                <Emoji3D emoji={t.icon} size={32} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">{t.name}</span>
                  <span className="block text-xs text-muted">{t.wordCount} từ</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <TopicForm open shared onClose={() => setCreating(false)} onSaved={(t) => navigate(`/topics/${t.slug}`)} />}
    </Section>
  );
}

function UsersSection({ meId }: { meId: number }) {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['admin-users'], queryFn: api.adminUsers });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: AdminUser['role'] }) => api.setUserRole(id, role),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`${u.name}: ${ROLE_LABEL[u.role]}`);
      // Tự bỏ quyền của mình → cập nhật ngay (trang này sẽ đóng lại)
      if (u.id === meId) qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const admins = users.data?.filter((u) => u.role === 'admin').length ?? 0;

  return (
    <Section
      id="users"
      icon={<Users className="h-5 w-5 text-brand-500" />}
      title="Người dùng"
      desc="Quản trị viên cấu hình máy chủ; học viên chỉ học. Máy chủ luôn cần ít nhất một quản trị viên."
    >
      {users.error ? (
        <ErrorBox error={users.error} onRetry={() => users.refetch()} />
      ) : !users.data ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {users.data.map((u) => {
            const isMe = u.id === meId;
            const lastAdmin = u.role === 'admin' && admins <= 1;
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold',
                    u.role === 'admin' ? 'bg-brand text-white' : 'bg-surface-2 text-ink',
                  )}
                  aria-hidden="true"
                >
                  {u.name.trim().slice(0, 1).toUpperCase() || '?'}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                    <span className="truncate">{u.name}</span>
                    {isMe && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase text-muted">Bạn</span>}
                  </p>
                  <p className="truncate text-sm text-muted">{u.email}</p>
                  <p className="text-xs text-muted">
                    {u.words} từ trong sổ · {u.lastLoginAt ? `đăng nhập ${relativeTime(u.lastLoginAt)}` : 'chưa đăng nhập'}
                  </p>
                </div>
                <Select
                  aria-label={`Vai trò của ${u.name}`}
                  value={u.role}
                  disabled={setRole.isPending || lastAdmin}
                  title={lastAdmin ? 'Quản trị viên duy nhất — cấp quyền cho người khác trước' : undefined}
                  className="w-40"
                  onChange={(e) => {
                    const role = e.target.value as AdminUser['role'];
                    if (isMe && role === 'user' && !window.confirm('Bỏ quyền quản trị của chính bạn? Bạn sẽ không vào lại được trang này.')) return;
                    setRole.mutate({ id: u.id, role });
                  }}
                >
                  <option value="admin">{ROLE_LABEL.admin}</option>
                  <option value="user">{ROLE_LABEL.user}</option>
                </Select>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** Trang Quản trị: chỉ quản trị viên (máy chủ cũng chặn mọi API quản trị với người dùng thường). */
export default function Admin() {
  const me = useMe();
  const settings = useQuery({ queryKey: ['admin-settings'], queryFn: api.adminSettings, enabled: me.data?.role === 'admin' });
  if (me.data && me.data.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-soft">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Quản trị</h1>
          <p className="text-sm text-muted">Cấu hình chung cho cả máy chủ. Chỉ quản trị viên thấy trang này.</p>
        </div>
      </header>
      {settings.error ? (
        <ErrorBox error={settings.error} onRetry={() => settings.refetch()} />
      ) : !settings.data || !me.data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <TranslationSection data={settings.data} />
          <RegistrationSection data={settings.data} />
          <TopicsSection />
          <UsersSection meId={me.data.id} />
        </>
      )}
    </div>
  );
}
