import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { ArrowDown, ArrowLeft, ArrowUp, Dice5, Mic, Play, Square, Timer, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Button, LinkButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Modal';
import { Card, EmptyState, ErrorBox, Input, Segmented, Skeleton, Textarea } from '../../components/ui/primitives';
import { Term } from '../../components/ui/Term';
import { LONG_PAUSE, useFluencyCapture } from '../../hooks/useFluencyCapture';
import { api } from '../../lib/api';
import type { FluencyRound, FluencySession, FluencyTopic } from '../../lib/types';
import { cn, relativeTime } from '../../lib/utils';

const CATEGORIES: { key: FluencyTopic['category'] | 'all'; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'people', label: 'Con người' },
  { key: 'places', label: 'Địa điểm' },
  { key: 'objects', label: 'Đồ vật' },
  { key: 'events', label: 'Sự kiện' },
  { key: 'experiences', label: 'Trải nghiệm' },
  { key: 'opinions', label: 'Quan điểm' },
];

const PREP_SEC = 60;
const mmss = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
const minutesLabel = (sec: number) => `${(sec / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} phút`;

// ---------- Chỉ số một lượt ----------

const METRICS: { key: keyof FluencyRound; label: string; unit: string; better: 'up' | 'down'; hint: string; term: string }[] = [
  { key: 'wpm', label: 'Tốc độ', unit: 'từ/phút', better: 'up', hint: 'Càng cao càng tốt', term: 'wpm' },
  { key: 'longPausesPerMin', label: 'Ngừng dài', unit: 'lần/phút', better: 'down', hint: `Im lặng ≥ ${LONG_PAUSE} giây · càng ít càng tốt`, term: 'long_pause' },
  { key: 'meanRun', label: 'Đoạn nói liền', unit: 'từ', better: 'up', hint: 'Càng dài càng tốt', term: 'mean_run' },
  { key: 'fillersPerMin', label: 'Từ đệm', unit: 'lần/phút', better: 'down', hint: 'um, uh, you know… · càng ít càng tốt', term: 'filler' },
];

function Delta({ cur, prev, better }: { cur: number; prev?: number; better: 'up' | 'down' }) {
  if (prev === undefined || prev === cur) return null;
  const up = cur > prev;
  const good = up === (better === 'up');
  return (
    <span className={cn('inline-flex items-center text-xs font-bold', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500')}>
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(Math.round((cur - prev) * 10) / 10)}
    </span>
  );
}

function RoundStats({ round, prev }: { round: FluencyRound; prev?: FluencyRound }) {
  return (
    <div className="stagger grid grid-cols-2 gap-2 sm:grid-cols-4">
      {METRICS.map((m) => (
        <div key={m.key} className="rounded-2xl border border-line bg-surface-2 p-3 shadow-soft">
          <p className="text-xs font-semibold text-muted">
            <Term k={m.term}>{m.label}</Term>
          </p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-display text-2xl font-black text-ink">{round[m.key] as number}</span>
            <Delta cur={round[m.key] as number} prev={prev?.[m.key] as number | undefined} better={m.better} />
          </p>
          <p className="text-[11px] text-muted">
            {m.unit} · {m.hint}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---------- Một buổi luyện ----------

function Runner({ session }: { session: FluencySession }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const cap = useFluencyCapture();
  const nextRound = session.rounds.length + 1;
  const finished = nextRound > session.plan.length;
  const target = session.plan[nextRound - 1] ?? 0;
  const [phase, setPhase] = useState<'prep' | 'ready' | 'recording' | 'saving' | 'result'>(session.rounds.length === 0 ? 'prep' : 'result');
  const [prepLeft, setPrepLeft] = useState(PREP_SEC);
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState(session.notes);
  const startedAt = useRef(0);
  const stopping = useRef(false);

  const saveNotes = useMutation({ mutationFn: () => api.updateFluencyNotes(session.id, notes) });

  // Đếm ngược chuẩn bị
  useEffect(() => {
    if (phase !== 'prep') return;
    if (prepLeft <= 0) {
      setPhase('ready');
      return;
    }
    const t = setTimeout(() => setPrepLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, prepLeft]);

  const finishRound = async () => {
    if (stopping.current) return;
    stopping.current = true;
    setPhase('saving');
    try {
      const r = await cap.stop();
      const longPauses = r.pauses.filter((p) => p >= LONG_PAUSE).length;
      const saved = await api.saveFluencyRound(session.id, {
        round: nextRound,
        targetSec: target,
        durationSec: Math.max(1, Math.round(r.durationSec * 10) / 10),
        speechSec: Math.round(r.speechSec * 10) / 10,
        pauseCount: r.pauses.length,
        longPauses,
        pauseSec: Math.round(r.pauses.reduce((a, b) => a + b, 0) * 10) / 10,
        transcript: r.transcript,
      });
      if (r.blob) await api.uploadFluencyAudio(saved.round.id, r.blob).catch(() => toast.error('Không lưu được file ghi âm'));
      await qc.invalidateQueries({ queryKey: ['fluency-session', session.id] });
      qc.invalidateQueries({ queryKey: ['fluency-sessions'] });
      qc.invalidateQueries({ queryKey: ['today'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      if (nextRound === session.plan.length) confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      setPhase('result');
    } catch (e) {
      toast.error((e as Error).message);
      setPhase('ready');
    } finally {
      stopping.current = false;
    }
  };

  // Đồng hồ lượt nói; hết giờ thì tự dừng
  useEffect(() => {
    if (phase !== 'recording') return;
    const t = setInterval(() => {
      const e = (performance.now() - startedAt.current) / 1000;
      setElapsed(e);
      if (e >= target) void finishRound();
    }, 200);
    return () => clearInterval(t);
  }, [phase, target]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRound = async () => {
    if (notes !== session.notes) saveNotes.mutate();
    const ok = await cap.start();
    if (!ok) return;
    startedAt.current = performance.now();
    setElapsed(0);
    setPhase('recording');
  };

  const last = session.rounds[session.rounds.length - 1];
  const prev = session.rounds[session.rounds.length - 2];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/fluency')} aria-label="Quay lại" disabled={phase === 'recording'}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">
            4/3/2 · {session.plan.map((s) => minutesLabel(s)).join(' → ')}
          </p>
          <h1 className="text-xl font-extrabold text-ink">{session.topic}</h1>
        </div>
      </div>

      <div className="flex gap-2">
        {session.plan.map((sec, i) => (
          <div
            key={i}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-center text-sm font-bold',
              i < session.rounds.length ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : i === session.rounds.length && !finished ? 'bg-violet-500 text-white' : 'bg-surface-2 text-muted',
            )}
          >
            Lượt {i + 1} · {mmss(sec)}
          </div>
        ))}
      </div>

      <Card className="space-y-4 p-5 sm:p-6">
        {session.prompts.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold text-ink">Gợi ý nên nói:</p>
            <ul className="grid grid-cols-1 gap-1 text-sm text-muted sm:grid-cols-2">
              {session.prompts.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </div>
        )}
        {(phase === 'prep' || phase === 'ready') && (
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== session.notes && saveNotes.mutate()}
            placeholder="Ghi chú nhanh vài ý chính (từ khoá), không viết cả câu…"
            className="min-h-[90px]"
            aria-label="Ghi chú chuẩn bị"
          />
        )}
        {phase === 'recording' && notes && <p className="whitespace-pre-line rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{notes}</p>}

        {phase === 'prep' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <p className="text-sm font-semibold text-muted">Thời gian chuẩn bị</p>
            <p className="font-mono text-5xl font-extrabold text-ink">{mmss(prepLeft)}</p>
            <Button variant="outline" onClick={() => setPhase('ready')}>
              Sẵn sàng, bỏ qua chuẩn bị
            </Button>
          </div>
        )}

        {phase === 'ready' && !finished && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-lg font-bold text-ink">
              Lượt {nextRound}: nói về đề này trong {minutesLabel(target)}
            </p>
            <p className="max-w-lg text-sm text-muted">
              {nextRound === 1
                ? 'Cứ nói tự nhiên, đủ ý. Đừng dừng lại sửa lỗi — mục tiêu là nói trôi chảy.'
                : 'Nói lại cùng nội dung nhưng ít thời gian hơn: cố nói nhanh hơn, ít ngập ngừng hơn, dùng lại những cụm bạn vừa nói.'}
            </p>
            <Button size="lg" variant="primary" icon={<Mic className="h-5 w-5" />} onClick={() => void startRound()}>
              Bắt đầu nói
            </Button>
            {!cap.srSupported && <p className="text-xs text-amber-600">Trình duyệt không hỗ trợ nhận dạng giọng nói — vẫn ghi âm và đo quãng ngừng, nhưng không đếm được số từ.</p>}
            {cap.error && <p className="text-sm text-rose-500">{cap.error}</p>}
          </div>
        )}

        {phase === 'recording' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-xs font-semibold text-muted">Còn lại</p>
                <p className={cn('font-mono text-5xl font-extrabold', target - elapsed < 15 ? 'text-rose-500' : 'text-ink')}>{mmss(target - elapsed)}</p>
              </div>
              <div className="flex h-16 w-6 items-end overflow-hidden rounded-full bg-surface-3" aria-label="Âm lượng micro">
                <div className={cn('w-full rounded-full transition-[height] duration-100', cap.speaking ? 'bg-emerald-500' : 'bg-slate-400')} style={{ height: `${Math.max(6, cap.level * 100)}%` }} />
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${Math.min(100, (elapsed / target) * 100)}%` }} />
            </div>
            <p className="min-h-16 rounded-xl bg-surface-2 p-3 text-sm leading-relaxed text-muted">{cap.live ? `…${cap.live.slice(-320)}` : cap.speaking ? 'Đang nghe…' : 'Bắt đầu nói đi!'}</p>
            {cap.error && <p className="text-xs text-amber-600">{cap.error}</p>}
            <div className="flex justify-center">
              <Button variant="danger" icon={<Square className="h-4 w-4 fill-current" />} onClick={() => void finishRound()}>
                Dừng sớm
              </Button>
            </div>
          </div>
        )}

        {phase === 'saving' && <p className="py-6 text-center text-sm font-semibold text-muted">Đang lưu lượt nói và ghi âm…</p>}

        {phase === 'result' && last && (
          <div className="space-y-4">
            <p className="text-lg font-bold text-ink">
              Lượt {last.round} — {last.wordCount} từ trong {mmss(last.durationSec)}
            </p>
            <RoundStats round={last} prev={prev} />
            {last.hasAudio && <audio src={api.fluencyAudioUrl(last.id)} controls className="w-full" />}
            {!finished ? (
              <div className="flex justify-center">
                <Button size="lg" variant="primary" icon={<Play className="h-5 w-5 fill-current" />} onClick={() => setPhase('ready')}>
                  Sang lượt {nextRound} ({minutesLabel(target)})
                </Button>
              </div>
            ) : (
              <Summary session={session} />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Summary({ session }: { session: FluencySession }) {
  const first = session.rounds[0];
  const last = session.rounds[session.rounds.length - 1];
  return (
    <div className="space-y-4 border-t border-line pt-4">
      <h2 className="text-lg font-extrabold text-ink">So sánh các lượt 🎯</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-3 font-semibold">Lượt</th>
              {METRICS.map((m) => (
                <th key={m.key} className="py-1 pr-3 font-semibold">
                  <Term k={m.term}>{m.label}</Term> <span className="font-normal">({m.unit})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {session.rounds.map((r, i) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2 pr-3 font-bold text-ink">
                  {r.round} · {mmss(r.targetSec)}
                </td>
                {METRICS.map((m) => (
                  <td key={m.key} className="py-2 pr-3 text-ink">
                    {r[m.key] as number} <Delta cur={r[m.key] as number} prev={session.rounds[i - 1]?.[m.key] as number | undefined} better={m.better} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {first && last && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
          {last.wpm > first.wpm
            ? `Lượt cuối bạn nói nhanh hơn ${Math.round(((last.wpm - first.wpm) / Math.max(1, first.wpm)) * 100)}% so với lượt đầu.`
            : 'Tốc độ chưa tăng — lần sau thử dùng lại nguyên các cụm từ đã nói ở lượt trước.'}{' '}
          {last.longPausesPerMin < first.longPausesPerMin ? 'Số lần ngừng dài đã giảm. 👏' : ''}
        </p>
      )}
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Xem lời nói từng lượt</summary>
        <div className="mt-2 space-y-3">
          {session.rounds.map((r) => (
            <div key={r.id} className="space-y-1">
              <p className="text-xs font-bold text-muted">Lượt {r.round}</p>
              <p className="text-sm leading-relaxed text-ink">{r.transcript || '(không nhận dạng được lời nói)'}</p>
              {Object.keys(r.fillers).length > 0 && (
                <p className="text-xs text-muted">
                  <Term k="filler">Từ đệm</Term>: {Object.entries(r.fillers).map(([k, v]) => `${k} ×${v}`).join(', ')}
                </p>
              )}
              {r.hasAudio && <audio src={api.fluencyAudioUrl(r.id)} controls className="h-9 w-full" />}
            </div>
          ))}
        </div>
      </details>
      <div className="flex flex-wrap justify-center gap-2">
        <LinkButton to="/fluency" variant="primary">Luyện đề khác</LinkButton>
        <LinkButton to="/today" variant="outline">Kế hoạch hôm nay</LinkButton>
      </div>
    </div>
  );
}

function RunnerPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['fluency-session', Number(id)], queryFn: () => api.fluencySession(Number(id)) });
  if (q.error) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  if (q.isPending) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-3xl" />;
  return <Runner key={q.data.id} session={q.data} />;
}

// ---------- Trang chọn đề + lịch sử ----------

function Hub() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const topics = useQuery({ queryKey: ['fluency-topics'], queryFn: api.fluencyTopics, staleTime: Infinity });
  const history = useQuery({ queryKey: ['fluency-sessions'], queryFn: api.fluencySessions });
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]['key']>('all');
  const [plan, setPlan] = useState<'standard' | 'short'>('standard');
  const [custom, setCustom] = useState('');
  const [deleting, setDeleting] = useState<FluencySession | null>(null);

  const create = useMutation({
    mutationFn: (body: { topicId?: string; topic?: string }) => api.createFluencySession({ ...body, plan }),
    onSuccess: (s) => navigate(`/fluency/${s.id}`),
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteFluencySession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fluency-sessions'] }),
  });

  const list = useMemo(() => (topics.data ?? []).filter((t) => cat === 'all' || t.category === cat), [topics.data, cat]);
  const trend = history.data?.trend ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-sky-500 via-indigo-500 to-violet-600 p-6 text-white shadow-[0_14px_34px_-12px_rgb(99_102_241/0.65)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 animate-float-slow rounded-full bg-white/20 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 animate-float-slow rounded-full bg-cyan-200/25 blur-2xl [animation-delay:-4s]" />
        <h1 className="relative flex items-center gap-2 text-2xl font-black sm:text-3xl">
          Nói trôi chảy 4/3/2 ⏱️ <Term k="fluency_432" icon className="text-white/80 hover:bg-white/20 hover:text-white dark:hover:text-white" />
        </h1>
        <p className="relative mt-1 max-w-2xl text-sm text-white/90">
          Nói cùng một đề 3 lần với thời gian giảm dần (4 → 3 → 2 phút). Nội dung đã quen nên não không phải nghĩ “nói gì” mà tập trung nói nhanh và liền mạch hơn — kỹ thuật
          luyện trôi chảy của Maurice (1983) và Paul Nation (1989). App ghi âm, đo tốc độ nói, số lần ngừng và từ đệm qua từng lượt.
        </p>
        <div className="relative mt-4 flex flex-wrap items-center gap-3">
          <Segmented
            value={plan}
            onChange={setPlan}
            className="bg-white/20 [&>button]:text-white [&>button[aria-checked=true]]:text-ink"
            options={[
              { value: 'standard', label: '4 / 3 / 2 phút' },
              { value: 'short', label: '2 / 1,5 / 1 phút' },
            ]}
          />
          <Button
            variant="secondary"
            className="bg-white text-indigo-700 hover:bg-white/90"
            icon={<Dice5 className="h-4 w-4" />}
            loading={create.isPending}
            onClick={() => {
              const all = topics.data ?? [];
              if (all.length) create.mutate({ topicId: all[Math.floor(Math.random() * all.length)].id });
            }}
          >
            Đề ngẫu nhiên
          </Button>
        </div>
      </section>

      {trend.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-extrabold text-ink">Tiến bộ qua các buổi</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 pr-3 font-semibold">Ngày</th>
                  <th className="py-1 pr-3 font-semibold">Đề</th>
                  <th className="py-1 pr-3 font-semibold">
                    <Term k="wpm">Tốc độ</Term> lượt đầu → cuối
                  </th>
                  <th className="py-1 pr-3 font-semibold">
                    <Term k="long_pause">Ngừng dài</Term>/phút
                  </th>
                  <th className="py-1 font-semibold">
                    <Term k="filler">Từ đệm</Term>/phút
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...trend].reverse().slice(0, 8).map((t) => (
                  <tr key={t.id} className="border-t border-line">
                    <td className="py-2 pr-3 text-muted">{t.day.slice(5).split('-').reverse().join('/')}</td>
                    <td className="max-w-[16rem] truncate py-2 pr-3 text-ink">{t.topic}</td>
                    <td className="py-2 pr-3 font-semibold text-ink">
                      {t.firstWpm} → {t.lastWpm} <Delta cur={t.lastWpm} prev={t.firstWpm} better="up" />
                    </td>
                    <td className="py-2 pr-3 text-ink">
                      {t.firstPausesPerMin} → {t.lastPausesPerMin}
                    </td>
                    <td className="py-2 text-ink">{t.fillersPerMin}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) create.mutate({ topic: custom.trim() });
          }}
          className="flex gap-2"
        >
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Hoặc tự nhập đề, vd. Describe your hometown" aria-label="Đề tự nhập" />
          <Button type="submit" variant="primary" disabled={!custom.trim()} loading={create.isPending}>
            Bắt đầu
          </Button>
        </form>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCat(c.key)}
              className={cn('h-8 shrink-0 rounded-lg px-3 font-display text-sm font-bold transition active:scale-95', cat === c.key ? 'bg-ink text-bg shadow-card' : 'bg-surface-2 text-ink hover:bg-surface-3')}
            >
              {c.label}
            </button>
          ))}
        </div>
        {topics.isPending ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => create.mutate({ topicId: t.id })}
                disabled={create.isPending}
                className="rounded-2xl border border-line bg-surface p-3 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-card active:translate-y-0 disabled:opacity-60"
              >
                <p className="font-display font-bold text-ink">{t.title}</p>
                <p className="text-xs text-muted">{t.vi}</p>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 font-extrabold text-ink">
          <Timer className="h-5 w-5 text-indigo-500" /> Các buổi đã luyện
        </h2>
        {history.isPending ? (
          <Skeleton className="h-24" />
        ) : !history.data?.sessions.length ? (
          <EmptyState icon="🎤" title="Chưa có buổi nào" description="Chọn một đề ở trên để bắt đầu lượt 4/3/2 đầu tiên." />
        ) : (
          <ul className="divide-y divide-line">
            {history.data.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5">
                <Link to={`/fluency/${s.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{s.topic}</p>
                  <p className="text-xs text-muted">
                    {relativeTime(s.createdAt)} · {s.rounds.length}/{s.plan.length} lượt
                    {s.rounds.length > 0 && ` · ${s.rounds.map((r) => r.wpm).join(' → ')} từ/phút`}
                    {!s.completed && ' · chưa xong'}
                  </p>
                </Link>
                <Button size="icon-sm" variant="ghost" onClick={() => setDeleting(s)} aria-label="Xoá buổi luyện">
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        title="Xoá buổi luyện?"
        message="Bản ghi âm của buổi này cũng sẽ bị xoá khỏi máy."
        confirmLabel="Xoá"
        danger
      />
    </div>
  );
}

export default function FluencyPage() {
  const { id } = useParams();
  return id ? <RunnerPage /> : <Hub />;
}
