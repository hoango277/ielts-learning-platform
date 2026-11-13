import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  BookmarkCheck,
  Captions,
  ChevronDown,
  Eye,
  EyeOff,
  Keyboard,
  Languages,
  ListVideo,
  Maximize,
  Mic,
  Minimize,
  PanelRightClose,
  PanelRightOpen,
  NotebookPen,
  Pause,
  PenLine,
  Play,
  RectangleHorizontal,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Timer,
  Tv,
  Upload,
  BookMarked,
  ExternalLink,
  Gauge,
  Hourglass,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { SavePhraseDialog, type PhraseDraft } from '../../components/phrase/SavePhraseDialog';
import { isTenseForm } from '../../components/tenses/meta';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge, EmptyState, ErrorBox, Kbd, Segmented, Select, Skeleton, Spinner } from '../../components/ui/primitives';
import { ChannelAvatar } from '../../components/video/VideoCard';
import { useSettings } from '../../components/word/bits';
import { WordPopover, type PopoverTarget } from '../../components/word/WordPopover';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useLocalStorage, useMediaQuery } from '../../hooks/misc';
import { PLAYER_ERRORS, useYouTubePlayer, type PlayerApi } from '../../hooks/useYouTubePlayer';
import { api } from '../../lib/api';
import { canFullscreen, toggleFullscreen } from '../../lib/fullscreen';
import type { TenseForm, Transcript, VerbForm, VideoDetails, VideoState } from '../../lib/types';
import { cn, formatNumber, formatTime } from '../../lib/utils';
import { useUi } from '../../store/ui';
import { DictationPanel } from './DictationPanel';
import { DifficultyChip, DifficultyPanel } from './DifficultyPanel';
import { ShadowingPanel } from './ShadowingPanel';
import { NotesPanel, SavedWordsPanel, UpNextPanel } from './SidePanels';
import { SubtitleBar, type WordClick } from './SubtitleBar';
import { buildKeyIndex, tokenizeSentence } from './tokens';
import { TranscriptPanel } from './TranscriptPanel';
import { usePlayback } from './usePlayback';
import { useSentenceTranslations } from './useSentenceTranslations';

type Mode = 'watch' | 'shadow' | 'dictation';
type SideTab = 'transcript' | 'words' | 'level' | 'notes' | 'next';

const SPEEDS = [0.5, 0.65, 0.75, 0.85, 1, 1.15, 1.25, 1.5];

/*
 * Chế độ rạp: video (16:9) và dải phụ đề cùng rộng, vừa khít một màn hình. Chiều cao video = 100dvh trừ phần cố định:
 * thanh trên cùng 3.5rem + lề dải đen 2 × 0.75rem + khoảng cách 0.5rem + dải phụ đề (SubtitleBar, chế độ cinema):
 * 6.75rem (2 dòng) hoặc 8.75rem khi bật song ngữ (thêm dòng dịch) → 12.25rem / 14.25rem.
 * Video đổi cỡ theo màn hình (và nút Song ngữ) chứ không theo độ dài câu → không nhảy cỡ mỗi khi sang câu mới.
 */
const THEATRE_FIT = 'xl:mx-auto xl:max-w-[calc((100dvh-12.25rem)*16/9)]';
const THEATRE_FIT_BILINGUAL = 'xl:mx-auto xl:max-w-[calc((100dvh-14.25rem)*16/9)]';

/*
 * Toàn màn hình kiểu YouTube (từ lg): cột trái nền đen = video phóng to + phụ đề của app ngay dưới (không che hình)
 * + thanh điều khiển gọn một hàng, canh giữa theo chiều dọc; cột phải (360–400px) = chọn chế độ + toàn bộ phụ đề, cao hết
 * màn hình. Video rộng hết cột trái nhưng thấp hơn 100dvh trừ phần cố định: lề 2 × 0.75rem + 0.5rem + dải phụ đề 6.75rem
 * (8.75rem khi song ngữ) + 0.75rem + điều khiển 3.5rem = 13rem (15rem). Màn 16:9 có cột phụ đề 400px vẫn dư 225px bề dọc
 * → video không phải co. Nói đuổi / Chép chính tả: video nhỏ lại (phần cố định ≈ 27.5rem) để thấy trọn bảng luyện.
 */
const FS_FIT = 'lg:mx-auto lg:w-full lg:max-w-[calc((100dvh-13rem)*16/9)]';
const FS_FIT_BILINGUAL = 'lg:mx-auto lg:w-full lg:max-w-[calc((100dvh-15rem)*16/9)]';
// Phụ đề đè lên video (như YouTube): chỉ còn chừa lề + thanh điều khiển ≈ 6rem
const FS_FIT_OVERLAY = 'lg:mx-auto lg:w-full lg:max-w-[calc((100dvh-6rem)*16/9)]';
const FS_PRACTICE_FIT = 'lg:mx-auto lg:w-full lg:min-w-[min(100%,28rem)] lg:max-w-[calc((100dvh-27.5rem)*16/9)]';

function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ['Space', 'Phát / tạm dừng'],
    ['← / →', 'Câu trước / câu sau'],
    ['↑', 'Nghe lại câu hiện tại'],
    ['A', 'Bật/tắt tự dừng sau mỗi câu'],
    ['L', 'Bật/tắt lặp câu'],
    ['T', 'Bật/tắt bản dịch song ngữ'],
    ['H', 'Ẩn/hiện phụ đề (luyện nghe)'],
    ['[ / ]', 'Giảm / tăng tốc độ'],
    ['1 / 2 / 3', 'Chế độ Xem / Shadowing / Chép chính tả'],
    ['W', 'Chế độ rạp khi xem: video rộng, phụ đề ngay dưới video (máy tính)'],
    ['F', 'Toàn màn hình như YouTube: video lớn, phụ đề của app, toàn bộ phụ đề bên cạnh (Esc hoặc F để thoát)'],
    ['G', 'Kính thì: tô màu động từ theo thì'],
    ['R', 'Ghi âm (chế độ Shadowing)'],
    ['Ctrl', 'Nghe lại (khi đang gõ chép chính tả)'],
    ['Ctrl + K', 'Tra từ nhanh'],
    ['Ctrl + B', 'Thu gọn / mở rộng thanh bên'],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Phím tắt" size="sm">
      <ul className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between py-2 text-sm">
            <span className="text-ink">{v}</span>
            <Kbd>{k}</Kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function TranscriptState({ query, videoId, onUpload }: { query: { isPending: boolean; error: unknown; refetch: () => void }; videoId: string; onUpload: () => void }) {
  if (query.isPending)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-muted">
        <Spinner className="h-7 w-7 text-brand-500" />
        <p className="text-sm">Đang tải phụ đề…</p>
      </div>
    );
  return (
    <div className="space-y-4 p-4">
      <ErrorBox error={query.error} onRetry={query.refetch} />
      <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
        <p className="font-semibold text-ink">Không có phụ đề tiếng Anh?</p>
        <p className="mt-1">
          Bạn có thể tải lên file phụ đề <b>.srt</b> hoặc <b>.vtt</b> cho video <code>{videoId}</code> để vẫn shadowing và chép chính tả được.
        </p>
        <Button className="mt-3" size="sm" variant="soft" icon={<Upload className="h-4 w-4" />} onClick={onUpload}>
          Tải file phụ đề lên
        </Button>
      </div>
    </div>
  );
}

function Player({ player, videoId, flat }: { player: PlayerApi; videoId: string; /** toàn màn hình kiểu YouTube: không bo góc, không bóng */ flat?: boolean }) {
  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg', flat && 'lg:rounded-none lg:shadow-none')}>
      <div ref={player.containerRef} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
      {!player.ready && !player.error && (
        <div className="absolute inset-0 flex items-center justify-center text-white/70">
          <Spinner className="h-8 w-8" />
        </div>
      )}
      {player.error !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-white">
          <Tv className="h-10 w-10 text-rose-400" />
          <p className="max-w-md text-sm">{PLAYER_ERRORS[player.error] ?? 'Không phát được video.'} Bạn vẫn có thể đọc phụ đề và tra từ.</p>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            Mở trên YouTube <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  );
}

function ChannelLabel({ channel }: { channel: VideoDetails['channel'] }) {
  return (
    <>
      <ChannelAvatar name={channel.name} src={channel.avatar} size={40} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{channel.name}</p>
        <p className="text-xs text-muted">{channel.subscribers}</p>
      </div>
    </>
  );
}

function VideoInfo({
  details,
  state,
  transcript,
  track,
  setTrack,
  onUpload,
  onResetUpload,
}: {
  details: VideoDetails | undefined;
  state: VideoState | null | undefined;
  transcript: Transcript | undefined;
  track: string | undefined;
  setTrack: (t: string | undefined) => void;
  onUpload: () => void;
  onResetUpload: () => void;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const save = useMutation({
    mutationFn: (saved: boolean) =>
      api.setSaved(details!.id, { saved, title: details?.title, channelName: details?.channel.name, durationSec: details?.durationSec }),
    onSuccess: (s) => {
      qc.setQueryData(['video-state', details!.id], s);
      qc.invalidateQueries({ queryKey: ['videos'] });
      toast.success(s.saved ? 'Đã lưu video vào thư viện' : 'Đã bỏ lưu video');
    },
  });
  if (!details) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-5 w-1/3" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-extrabold leading-snug text-ink sm:text-2xl">{details.title}</h1>
      <div className="flex flex-wrap items-center gap-3">
        {details.channel.id ? (
          <Link to={`/channel/${details.channel.id}`} className="flex min-w-0 items-center gap-2.5">
            <ChannelLabel channel={details.channel} />
          </Link>
        ) : (
          // Không có id kênh → hiện chữ thường, không tạo link "#" vô dụng
          <div className="flex min-w-0 items-center gap-2.5">
            <ChannelLabel channel={details.channel} />
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={state?.saved ? 'soft' : 'outline'}
            onClick={() => save.mutate(!state?.saved)}
            loading={save.isPending}
            icon={state?.saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          >
            {state?.saved ? 'Đã lưu' : 'Lưu video'}
          </Button>
          <a
            href={`https://www.youtube.com/watch?v=${details.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2"
          >
            YouTube <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
        <Captions className="h-4 w-4 text-muted" />
        <span className="font-semibold text-ink">Phụ đề:</span>
        {transcript?.kind === 'upload' ? (
          <>
            <Badge className="bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">File bạn tải lên</Badge>
            <Button size="sm" variant="ghost" onClick={onResetUpload}>
              Dùng phụ đề YouTube
            </Button>
          </>
        ) : transcript?.tracks.length ? (
          <Select value={track ?? transcript.trackId} onChange={(e) => setTrack(e.target.value)} className="h-8 w-auto min-w-0 max-w-full flex-1 rounded-lg py-0 text-sm sm:flex-none" aria-label="Chọn phụ đề">
            {transcript.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.kind === 'asr' ? ' — tự động (có timing từng từ)' : ' — chuẩn'}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-muted">—</span>
        )}
        <Button size="sm" variant="ghost" onClick={onUpload} icon={<Upload className="h-4 w-4" />}>
          Tải .srt/.vtt
        </Button>
        <span className="ml-auto text-xs text-muted">
          {[details.views ? `${formatNumber(details.views)} lượt xem` : null, details.relativeDate ?? details.published].filter(Boolean).join(' • ')}
        </span>
      </div>
      {details.description && (
        <div className="rounded-2xl bg-surface-2 p-3 text-sm text-ink">
          <p className={cn('whitespace-pre-wrap leading-relaxed', !expanded && 'line-clamp-3')}>{details.description}</p>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink">
            {expanded ? 'Thu gọn' : 'Xem thêm'} <ChevronDown className={cn('h-3.5 w-3.5 transition', expanded && 'rotate-180')} />
          </button>
        </div>
      )}
    </div>
  );
}

function WatchView({ id, start, state, initialMode }: { id: string; start: number; state: VideoState | null | undefined; initialMode?: Mode }) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const player = useYouTubePlayer(id, { start, rate: settings?.playbackRate ?? 1 });
  const [track, setTrack] = useState<string | undefined>();
  const details = useQuery({ queryKey: ['video', id], queryFn: () => api.video(id), staleTime: 20 * 60_000 });
  const transcriptQ = useQuery({ queryKey: ['transcript', id, track ?? ''], queryFn: () => api.transcript(id, track), staleTime: Infinity, retry: 1 });
  const keys = useQuery({ queryKey: ['word-keys'], queryFn: api.wordKeys, staleTime: 60_000 });
  const transcript = transcriptQ.data;
  const sentences = useMemo(() => transcript?.sentences ?? [], [transcript]);
  // Kính thì: tô màu động từ trong phụ đề theo thì (nhớ lựa chọn cho các video sau)
  const [lens, setLens] = useLocalStorage('watch-tense-lens', false);
  const [lensFilter, setLensFilter] = useState<VerbForm | null>(null);
  const tenseQ = useQuery({
    queryKey: ['video-tenses', id, track ?? '', transcript?.trackId ?? ''],
    queryFn: () => api.videoTenses(id, track),
    enabled: lens && Boolean(transcript?.sentences.length),
    staleTime: Infinity,
    retry: 1,
  });

  const [mode, setMode] = useState<Mode>(initialMode ?? 'watch');
  const [side, setSide] = useState<SideTab>('transcript');
  const [autoPause, setAutoPause] = useState(false);
  const [loop, setLoop] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [hideSubs, setHideSubs] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [pop, setPop] = useState<PopoverTarget | null>(null);
  const [help, setHelp] = useState(false);
  const [phraseDraft, setPhraseDraft] = useState<PhraseDraft | null>(null);
  // Chế độ rạp (máy tính, khi Xem & tra từ): video rộng trên nền đen, phụ đề câu đang nói nằm ngay dưới video;
  // thanh điều khiển + transcript xuống dưới — nhớ cho lần sau. Nói đuổi / Chép chính tả luôn dùng bố cục thường
  // để bảng luyện nằm cạnh video (rạp đẩy bảng luyện xuống dưới mép màn hình thì không luyện được).
  const [theatre, setTheatre] = useLocalStorage('watch-theatre', false);
  const wide = useMediaQuery('(min-width: 80rem)'); // = breakpoint xl, nơi bố cục rạp có hiệu lực
  // Toàn màn hình (phím F) — AppShell ẩn thanh bên / thanh trên cùng; từ lg dùng bố cục 2 cột kiểu YouTube
  const fs = useUi((s) => s.immersive);
  const lgUp = useMediaQuery('(min-width: 64rem)'); // = breakpoint lg
  const fsWide = fs && lgUp;
  // Toàn màn hình: phụ đề của app nằm dưới video (mặc định, không che hình) hay đè lên phần dưới video như YouTube (tuỳ
  // chọn); cột toàn bộ phụ đề bên phải có thể ẩn để video phủ kín màn hình — nhớ cho lần sau
  const [subsOnVideo, setSubsOnVideo] = useLocalStorage('watch-fs-subs-overlay', false);
  const [fsPanel, setFsPanel] = useLocalStorage('watch-fs-panel', true);
  // Chuột đang ở trên video → YouTube hiện thanh tua → phụ đề đè lên video nâng lên (như phụ đề của YouTube)
  const [videoHover, setVideoHover] = useState(false);
  const overlayCapable = fsWide && subsOnVideo;
  useEffect(() => {
    if (!overlayCapable) setVideoHover(false); // không còn phụ đề đè → bỏ trạng thái rê chuột cũ
  }, [overlayCapable]);
  useEffect(() => {
    if (fs) window.scrollTo(0, 0);
  }, [fs]);
  const toggleLens = () => {
    const on = !lens;
    setLens(on);
    if (on) setSide('transcript');
    else setLensFilter(null);
    toast.message(on ? 'Kính thì: động từ được tô màu theo thì — bấm vào để xem vì sao' : 'Đã tắt Kính thì', { duration: 1500 });
  };
  const savePhraseRef = useRef<((i: number, chunk?: string, tense?: TenseForm) => void) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Lấy giá trị mặc định từ Cài đặt một lần khi mở video (không ghi đè lựa chọn trong lúc xem)
  const initFromSettings = useRef(false);
  useEffect(() => {
    if (!settings || initFromSettings.current) return;
    initFromSettings.current = true;
    setAutoPause(settings.autoPause);
    setShowTranslation(settings.showTranslation);
  }, [settings]);

  /** Bật/tắt tự dừng và ghi nhớ lựa chọn cho các video sau. */
  const toggleAutoPause = (value = !autoPause) => {
    setAutoPause(value);
    api
      .updateSettings({ autoPause: value })
      .then((s) => qc.setQueryData(['settings'], s))
      .catch(() => undefined);
    toast.message(value ? 'Đã bật tự dừng sau mỗi câu' : 'Đã tắt tự dừng — video phát liên tục', { duration: 1500 });
  };

  const playback = usePlayback(player, sentences, { autoPause: mode === 'watch' && autoPause, loop: mode === 'watch' && loop });
  const { activeIndex } = playback;

  const keyIndex = useMemo(() => buildKeyIndex(keys.data), [keys.data]);
  const tokenized = useMemo(() => sentences.map((s) => tokenizeSentence(s, keyIndex)), [sentences, keyIndex]);
  // Gắn thì vào từng từ khi Kính thì đang bật
  const tokenizedView = useMemo(() => {
    const data = lens ? tenseQ.data : undefined;
    if (!data) return tokenized;
    return tokenized.map((toks, i) => {
      const spans = data.sentences[i];
      if (!spans?.length) return toks;
      const copy = toks.slice();
      for (const sp of spans) for (let k = sp.from; k <= sp.to && k < copy.length; k++) copy[k] = { ...copy[k], tense: sp.form, tenseG: sp.g };
      return copy;
    });
  }, [lens, tenseQ.data, tokenized]);
  // Lọc phụ đề: chỉ các câu có thì đang chọn ở thanh chú thích
  const lensIndices = useMemo(() => {
    if (!lens || !lensFilter || !tenseQ.data) return null;
    return new Set(
      Object.entries(tenseQ.data.sentences)
        .filter(([, spans]) => spans.some((sp) => sp.form === lensFilter))
        .map(([i]) => Number(i)),
    );
  }, [lens, lensFilter, tenseQ.data]);
  const focusIndex = mode === 'watch' ? activeIndex : practiceIndex;
  const translations = useSentenceTranslations(`${id}:${transcript?.trackId ?? ''}`, sentences, showTranslation || mode !== 'watch', focusIndex);

  // ---- Ghi tiến độ xem (mỗi 15 giây phát thật) ----
  const playingRef = useRef(false);
  playingRef.current = player.playing;
  const meta = useRef<{ title?: string; channelName?: string; channelId?: string; durationSec?: number }>({});
  meta.current = { title: details.data?.title, channelName: details.data?.channel.name, channelId: details.data?.channel.id, durationSec: details.data?.durationSec };
  useEffect(() => {
    if (!player.ready) return;
    let watched = 0;
    let last = Date.now();
    // Nhớ vị trí gần nhất: lúc rời trang player có thể đã bị huỷ nên không đọc trực tiếp được nữa.
    // Trước khi phát, getTime() trả 0 dù đã mở ở `start` → bắt đầu từ `start` và chỉ ghi đè khi có thời gian thật,
    // để mở rồi rời đi ngay không xoá mất vị trí xem dở (undefined = không gửi, máy chủ giữ vị trí cũ).
    const readTime = () => {
      const t = player.getTime();
      return t > 0 ? t : undefined;
    };
    let position = readTime() ?? (start > 0 ? start : undefined);
    api.progress(id, { ...meta.current, position, watchedSeconds: 0 }).then(() => qc.invalidateQueries({ queryKey: ['videos'] }));
    const iv = window.setInterval(() => {
      const now = Date.now();
      if (playingRef.current) watched += (now - last) / 1000;
      last = now;
      position = readTime() ?? position;
      if (watched >= 15) {
        api.progress(id, { ...meta.current, position, watchedSeconds: Math.round(watched) }).catch(() => undefined);
        watched = 0;
      }
    }, 1000);
    const flush = () => {
      const body = JSON.stringify({ position, watchedSeconds: Math.round(watched) });
      navigator.sendBeacon?.(`/api/videos/${id}/progress`, new Blob([body], { type: 'application/json' }));
      watched = 0;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('pagehide', flush);
      flush();
      // Lần mở lại video phải tiếp tục từ vị trí vừa rời: cập nhật ngay cache trạng thái video
      // và đánh dấu cũ để WatchPage tải lại trước khi dựng trình phát (trình phát chỉ đọc `start` một lần)
      const lastPosition = position;
      if (lastPosition !== undefined) {
        qc.setQueryData<VideoState | null>(['video-state', id], (old) => (old ? { ...old, lastPosition } : old));
      }
      qc.invalidateQueries({ queryKey: ['video-state', id] });
      qc.invalidateQueries({ queryKey: ['overview'] });
    };
  }, [player.ready, id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Hành động ----
  const onWordClick = useCallback(
    (i: number): WordClick =>
      (token, el) => {
        if (!token.key) return;
        if (playingRef.current) player.pause();
        let tense: PopoverTarget['tense'];
        if (token.tense && token.tenseG !== undefined) {
          // Cả cụm động từ của từ được bấm (câu hỏi đảo có 2 đoạn: "Have … been")
          const toks = tokenizedView[i] ?? [];
          const idx = toks.map((t, k) => (t.tense && t.tenseG === token.tenseG ? k : -1)).filter((k) => k >= 0);
          const runs: string[][] = [];
          idx.forEach((k, j) => (j && k === idx[j - 1] + 1 ? runs[runs.length - 1].push(toks[k].text) : runs.push([toks[k].text])));
          const phrase = runs
            .map((r) => r.join(' '))
            .join(' … ')
            .replace(/[.,!?;:]+$/, '');
          const chunk = toks
            .slice(idx[0], idx[idx.length - 1] + 1)
            .map((t) => t.text)
            .join(' ');
          const form = token.tense;
          tense = {
            form,
            phrase,
            onSave: () => {
              setPop(null);
              savePhraseRef.current?.(i, chunk, isTenseForm(form) ? form : undefined);
            },
            onReport: () => {
              api
                .tenseReport({ videoId: id, sentence: sentences[i]?.text ?? '', verb: phrase, form })
                .then(() => toast.success('Cảm ơn bạn! Đã ghi nhận để cải thiện nhận diện thì.'))
                .catch((e) => toast.error((e as Error).message));
            },
          };
        }
        setPop({ term: token.key, context: sentences[i]?.text, rect: el.getBoundingClientRect(), videoTime: sentences[i]?.start, tense });
      },
    [player.pause, sentences, tokenizedView, id], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const switchMode = (m: Mode) => {
    if (m !== 'watch') setPracticeIndex(Math.max(0, activeIndex));
    playback.cancelSegment();
    player.pause();
    setMode(m);
  };

  const onSeekRow = useCallback(
    (i: number) => {
      if (mode === 'watch') playback.jumpTo(i);
      else {
        setPracticeIndex(i);
        if (mode === 'shadow') playback.playSentence(i);
      }
    },
    [mode, playback],
  );
  const onLoopRow = useCallback(
    (i: number) => {
      setLoop(true);
      if (mode !== 'watch') setMode('watch');
      playback.jumpTo(i);
    },
    [mode, playback],
  );

  const current = mode === 'watch' ? activeIndex : practiceIndex;
  const prev = () => (mode === 'watch' ? playback.jumpTo(Math.max(0, activeIndex - 1)) : setPracticeIndex((i) => Math.max(0, i - 1)));
  const next = () =>
    mode === 'watch' ? playback.jumpTo(Math.min(sentences.length - 1, activeIndex + 1)) : setPracticeIndex((i) => Math.min(sentences.length - 1, i + 1));
  const replay = () => (mode === 'watch' ? playback.jumpTo(Math.max(0, activeIndex)) : playback.playSentence(practiceIndex));
  const togglePlay = () => (player.playing ? player.pause() : mode === 'watch' ? playback.resume() : playback.playSentence(practiceIndex));
  const changeSpeed = (dir: 1 | -1) => {
    const i = SPEEDS.indexOf(player.rate);
    const n = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 4 : i) + dir))];
    player.setRate(n);
    toast.message(`Tốc độ ${n}×`, { duration: 900 });
  };

  useHotkeys({
    space: togglePlay,
    ArrowLeft: prev,
    ArrowRight: next,
    ArrowUp: replay,
    a: () => toggleAutoPause(),
    l: () => setLoop((v) => !v),
    t: () => setShowTranslation((v) => !v),
    h: () => setHideSubs((v) => !v),
    '[': () => changeSpeed(-1),
    ']': () => changeSpeed(1),
    '1': () => switchMode('watch'),
    '2': () => switchMode('shadow'),
    '3': () => switchMode('dictation'),
    '?': () => setHelp(true),
    b: () => current >= 0 && savePhraseAt(current),
    w: () =>
      fs
        ? toast.message('Đang toàn màn hình — thoát (Esc) rồi mới dùng chế độ rạp', { duration: 1800 })
        : mode === 'watch'
          ? setTheatre((v) => !v)
          : toast.message('Chế độ rạp dùng khi Xem & tra từ (phím 1)', { duration: 1600 }),
    f: () => canFullscreen && void toggleFullscreen(),
    g: toggleLens,
  });

  const upload = useMutation({
    mutationFn: (content: string) => api.uploadTranscript(id, content),
    onSuccess: (t) => {
      qc.setQueryData(['transcript', id, ''], t);
      setTrack(undefined);
      toast.success(`Đã nạp ${t.sentences.length} câu từ file phụ đề`);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const resetUpload = useMutation({
    mutationFn: () => api.deleteUploadedTranscript(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transcript', id] }),
  });

  // Câu đã lưu vào sổ mẫu câu (đánh dấu trong phụ đề)
  const savedPhrases = useQuery({ queryKey: ['video-phrases', id], queryFn: () => api.videoPhrases(id), staleTime: 60_000 });
  const savedStarts = useMemo(() => new Set((savedPhrases.data ?? []).filter((p) => p.start != null).map((p) => Math.round(p.start! * 10))), [savedPhrases.data]);
  const savePhraseAt = useCallback(
    (i: number, chunk?: string, tense?: TenseForm) => {
      const s = sentences[i];
      if (!s) return;
      player.pause();
      setPhraseDraft({ text: s.text, start: s.start, end: s.end, chunk, tense });
    },
    [sentences, player.pause], // eslint-disable-line react-hooks/exhaustive-deps
  );

  savePhraseRef.current = savePhraseAt;
  const activeTokens = activeIndex >= 0 ? tokenizedView[activeIndex] : null;
  const theatreOn = theatre && mode === 'watch' && !fs; // toàn màn hình có bố cục riêng, không dùng rạp
  // Toàn màn hình + "phụ đề trên video": phụ đề của app đè lên phần dưới video như YouTube
  const overlaySubs = fsWide && mode === 'watch' && subsOnVideo;
  // Rạp (màn hình rộng) và toàn màn hình (phụ đề dưới video): phụ đề nằm trên nền đen ngay dưới video
  const cinema = (theatreOn && wide) || (fsWide && mode === 'watch' && !subsOnVideo);
  const theatreFit = showTranslation ? THEATRE_FIT_BILINGUAL : THEATRE_FIT;
  const fsFit = mode !== 'watch' ? FS_PRACTICE_FIT : overlaySubs ? FS_FIT_OVERLAY : showTranslation ? FS_FIT_BILINGUAL : FS_FIT;
  // Bề ngang chung của video và dải phụ đề rạp/toàn màn hình
  const videoFit = theatreOn ? theatreFit : fsWide ? fsFit : undefined;
  const subtitleBar = (
    <SubtitleBar
      tokens={activeTokens}
      translation={translations[activeIndex]}
      showTranslation={showTranslation}
      hidden={hideSubs}
      timeStore={player.timeStore}
      onWordClick={onWordClick(activeIndex)}
      index={activeIndex}
      total={sentences.length}
      autoPaused={autoPause && !player.playing && activeIndex >= 0 && playback.autoPausedIndex === activeIndex}
      onResume={playback.resume}
      onDisableAutoPause={() => {
        toggleAutoPause(false);
        playback.resume();
      }}
      variant={overlaySubs ? 'overlay' : cinema ? 'cinema' : 'card'}
      lifted={overlaySubs && (videoHover || !player.playing)}
    />
  );

  const sideTabs: { key: SideTab; label: string; icon: typeof Captions }[] = [
    { key: 'transcript', label: 'Phụ đề', icon: Captions },
    { key: 'words', label: 'Từ đã lưu', icon: BookMarked },
    { key: 'level', label: 'Độ khó', icon: Gauge },
    { key: 'notes', label: 'Ghi chú', icon: NotebookPen },
    { key: 'next', label: 'Gợi ý', icon: ListVideo },
  ];

  const modeSwitch = (
    <Segmented<Mode>
      value={mode}
      onChange={switchMode}
      ariaLabel="Chế độ học"
      className="w-full [&>button]:flex-1"
      options={[
        { value: 'watch', label: <><Tv className="h-4 w-4" /> <span className="sm:hidden">Xem</span><span className="hidden sm:inline">Xem & tra từ</span></>, title: 'Xem video, bấm vào từ để tra nghĩa (phím 1)' },
        { value: 'shadow', label: <><Mic className="h-4 w-4" /> Nói đuổi</>, title: 'Shadowing: nghe từng câu rồi nhại lại, app chấm từ nào bạn nói khớp (phím 2)' },
        { value: 'dictation', label: <><PenLine className="h-4 w-4" /> <span className="sm:hidden">Chính tả</span><span className="hidden sm:inline">Chép chính tả</span></>, title: 'Nghe từng câu rồi gõ lại chính xác (phím 3)' },
      ]}
    />
  );

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]',
        fsWide && 'lg:h-dvh lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-0 xl:grid-cols-[minmax(0,1fr)_400px]',
        fsWide && !fsPanel && 'lg:grid-cols-1 xl:grid-cols-1', // ẩn cột phụ đề: video phủ kín màn hình
      )}
    >
      {/*
        Chế độ rạp chỉ đổi bố cục bằng CSS: cột trái thành `display: contents` để khung video trải hết hai cột,
        nội dung + bảng bên xuống hàng dưới. Cây DOM giữ nguyên → khung YouTube không bị dựng lại, video không tải lại.
        Toàn màn hình cũng chỉ đổi lớp CSS: cột trái nền đen tự cuộn, nhóm video + phụ đề + điều khiển canh giữa dọc.
      */}
      <div
        className={cn(
          'min-w-0 space-y-4',
          theatreOn && 'xl:contents',
          fsWide && 'scrollbar-thin lg:flex lg:h-dvh lg:flex-col lg:gap-3 lg:space-y-0 lg:overflow-y-auto lg:bg-black lg:p-3',
        )}
      >
        <div
          className={cn(
            'sticky top-14 z-10 -mx-4 bg-bg px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 xl:static',
            theatreOn ? 'xl:col-span-2 xl:-mt-5 xl:mb-0 xl:bg-black xl:py-3' : 'xl:mx-0 xl:bg-transparent xl:p-0',
            fs && 'top-0', // toàn màn hình: không còn thanh trên cùng để chừa chỗ
            fsWide && 'lg:static lg:m-0 lg:mt-auto lg:bg-transparent lg:p-0',
          )}
        >
          {/* Rạp / toàn màn hình: video + phụ đề vừa đúng một màn hình, canh giữa trên nền đen */}
          <div
            className={cn(videoFit, overlaySubs && 'relative')}
            onMouseEnter={overlaySubs ? () => setVideoHover(true) : undefined}
            onMouseLeave={overlaySubs ? () => setVideoHover(false) : undefined}
          >
            <Player player={player} videoId={id} flat={fsWide} />
            {overlaySubs && subtitleBar}
          </div>
          {cinema && <div className={cn(videoFit, 'mt-2')}>{subtitleBar}</div>}
        </div>

        <div
          className={cn(
            'min-w-0 space-y-4',
            theatreOn && 'xl:col-start-1 xl:row-start-2',
            fsWide && 'lg:mb-auto lg:w-full',
            fsWide && mode === 'watch' && fsFit,
          )}
        >
          {mode === 'watch' && !cinema && !overlaySubs && subtitleBar}

          {/* Thanh điều khiển (toàn màn hình: gọn một hàng, chỉ biểu tượng — rê chuột xem tên) */}
          <div className={cn('card flex flex-wrap items-center gap-2 p-2.5', fsWide && 'p-1.5')}>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={prev} aria-label="Câu trước (←)" title="Câu trước (←)">
                <SkipBack className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={replay} aria-label="Nghe lại câu (↑)" title="Nghe lại câu (↑)">
                <RotateCcw className="h-5 w-5" />
              </Button>
              <Button size="icon" variant="primary" onClick={togglePlay} aria-label={player.playing ? 'Tạm dừng (Space)' : 'Phát (Space)'} className="h-11 w-11 rounded-full">
                {player.playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={next} aria-label="Câu sau (→)" title="Câu sau (→)">
                <SkipForward className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-surface-2 px-2 py-1" title="Tốc độ phát ([ / ])">
              <Timer className="h-4 w-4 text-muted" />
              <select
                value={player.rate}
                onChange={(e) => player.setRate(Number(e.target.value))}
                aria-label="Tốc độ phát"
                className="cursor-pointer bg-transparent text-sm font-semibold text-ink focus:outline-none"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </div>
            {mode === 'watch' && (
              <>
                <ToggleChip compact={fsWide} on={autoPause} onClick={() => toggleAutoPause()} icon={<Pause className="h-4 w-4" />} label="Tự dừng" title="Video tự tạm dừng sau mỗi câu để bạn kịp nhại lại (phím A)" />
                <ToggleChip compact={fsWide} on={loop} onClick={() => setLoop((v) => !v)} icon={<Repeat className="h-4 w-4" />} label="Lặp câu" title="Phát đi phát lại câu hiện tại (phím L)" />
                <ToggleChip compact={fsWide} on={hideSubs} onClick={() => setHideSubs((v) => !v)} icon={hideSubs ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} label="Che phụ đề" title="Làm mờ phụ đề để luyện nghe (phím H)" />
              </>
            )}
            <ToggleChip compact={fsWide} on={showTranslation} onClick={() => setShowTranslation((v) => !v)} icon={<Languages className="h-4 w-4" />} label="Song ngữ" title="Hiện thêm bản dịch tiếng Việt dưới phụ đề tiếng Anh (phím T)" />
            <ToggleChip
              compact={fsWide}
              on={lens}
              onClick={toggleLens}
              icon={<Hourglass className="h-4 w-4" />}
              label="Thì"
              title="Kính thì: tô màu động từ theo thì, bấm vào động từ để xem vì sao dùng thì đó (phím G)"
            />
            {!fsWide && <DifficultyChip videoId={id} onClick={() => setSide('level')} />}
            {mode === 'watch' && !fs && (
              <ToggleChip
                on={theatre}
                onClick={() => setTheatre((v) => !v)}
                icon={<RectangleHorizontal className="h-4 w-4" />}
                label="Rạp"
                title="Chế độ rạp: video rộng trên nền đen, phụ đề ngay dưới video; thanh điều khiển và transcript xuống dưới (phím W)"
                className="hidden xl:inline-flex"
              />
            )}
            {fsWide && mode === 'watch' && (
              <ToggleChip
                compact
                on={subsOnVideo}
                onClick={() => setSubsOnVideo((v) => !v)}
                icon={<Captions className="h-4 w-4" />}
                label="Phụ đề trên video"
                title={
                  subsOnVideo
                    ? 'Phụ đề đang nằm trên video như YouTube — bấm để đưa xuống dưới video (không che hình)'
                    : 'Phụ đề đang nằm dưới video — bấm để đưa lên phần dưới của video như YouTube'
                }
              />
            )}
            {fsWide && (
              <ToggleChip
                compact
                on={fsPanel}
                onClick={() => setFsPanel((v) => !v)}
                icon={fsPanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                label="Cột toàn bộ phụ đề"
                title={fsPanel ? 'Ẩn cột toàn bộ phụ đề — video phủ kín màn hình như YouTube' : 'Hiện cột toàn bộ phụ đề bên phải'}
              />
            )}
            {canFullscreen && (
              <ToggleChip
                compact={fsWide}
                on={fs}
                onClick={() => void toggleFullscreen()}
                icon={fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                label="Toàn màn hình"
                title={
                  fs
                    ? 'Thoát toàn màn hình (F hoặc Esc)'
                    : 'Toàn màn hình như YouTube: video phóng to trên nền đen, phụ đề của app ngay dưới video, toàn bộ phụ đề bên cạnh — hợp để nói đuổi (phím F, thoát: Esc)'
                }
              />
            )}
            <span className="ml-auto hidden font-mono text-xs text-muted sm:inline">
              {current >= 0 && sentences[current] ? formatTime(sentences[current].start) : '0:00'} / {formatTime(player.duration || details.data?.durationSec || 0)}
              {/* phụ đề đè lên video không có chỗ cho số thứ tự câu → hiện ở đây */}
              {overlaySubs && sentences.length > 0 && ` · câu ${Math.max(0, current) + 1}/${sentences.length}`}
            </span>
            <Button size="icon-sm" variant="ghost" onClick={() => setHelp(true)} aria-label="Phím tắt" title="Phím tắt (?)">
              <Keyboard className="h-4 w-4" />
            </Button>
          </div>

          {/* Toàn màn hình kiểu YouTube: nút chọn chế độ chuyển lên đầu cột phụ đề bên phải */}
          {!fsWide && modeSwitch}

          {mode === 'shadow' && sentences.length > 0 && (
            <ShadowingPanel
              sentences={sentences}
              tokens={tokenizedView[practiceIndex]}
              index={practiceIndex}
              setIndex={setPracticeIndex}
              player={player}
              playSentence={playback.playSentence}
              videoId={id}
              translation={translations[practiceIndex]}
              repeat={settings?.shadowRepeat ?? 1}
              onWordClick={onWordClick(practiceIndex)}
            />
          )}
          {mode === 'dictation' && sentences.length > 0 && (
            <DictationPanel
              sentences={sentences}
              index={practiceIndex}
              setIndex={setPracticeIndex}
              player={player}
              playSentence={playback.playSentence}
              videoId={id}
              translation={translations[practiceIndex]}
            />
          )}
          {mode !== 'watch' && !sentences.length && !transcriptQ.isPending && (
            <EmptyState icon="🎧" title="Cần phụ đề để luyện" description="Video này chưa có phụ đề. Hãy tải lên file .srt/.vtt hoặc chọn video khác." />
          )}

          {/* Toàn màn hình kiểu YouTube: bỏ tên video / mô tả cho gọn */}
          {!fsWide && (
            <VideoInfo
              details={details.data}
              state={state}
              transcript={transcript}
              track={track}
              setTrack={setTrack}
              onUpload={() => fileRef.current?.click()}
              onResetUpload={() => resetUpload.mutate()}
            />
          )}
          {details.error && <ErrorBox error={details.error} onRetry={() => details.refetch()} />}
        </div>
      </div>

      {/* Panel bên phải (chế độ rạp: nằm hàng dưới, cạnh bảng luyện tập; toàn màn hình: cột phải cao hết màn hình) */}
      <aside
        className={cn(
          'card flex h-[75vh] min-h-105 flex-col overflow-hidden xl:sticky xl:top-20 xl:h-[calc(100dvh-6.5rem)]',
          theatreOn && 'xl:col-start-2 xl:row-start-2',
          fsWide && 'lg:static lg:h-dvh lg:min-h-0 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none xl:static xl:h-dvh',
          fsWide && !fsPanel && 'lg:hidden',
        )}
      >
        {fsWide && <div className="border-b border-line p-2">{modeSwitch}</div>}
        <div role="tablist" aria-label="Bảng bên" className="flex border-b border-line">
          {sideTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={side === t.key}
                title={t.label}
                onClick={() => setSide(t.key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-1.5 py-3 text-xs font-semibold transition sm:text-[13px]',
                  side === t.key ? 'border-brand-500 text-ink' : 'border-transparent text-muted hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1">
          {side === 'transcript' &&
            (transcript ? (
              <TranscriptPanel
                sentences={sentences}
                tokenized={tokenizedView}
                activeIndex={mode === 'watch' ? activeIndex : practiceIndex}
                translations={translations}
                showTranslation={showTranslation}
                hideFrom={mode === 'dictation' ? practiceIndex : null}
                timeStore={player.timeStore}
                onSeek={onSeekRow}
                onLoop={onLoopRow}
                onWordClick={onWordClick}
                onPhrase={(t) => {
                  player.pause();
                  setPop(t);
                }}
                savedStarts={savedStarts}
                lens={lens ? { counts: tenseQ.data?.counts ?? {}, filter: lensFilter, onFilter: setLensFilter, loading: tenseQ.isPending, failed: tenseQ.isError } : undefined}
                filterIndices={lensIndices}
                onSavePhrase={savePhraseAt}
              />
            ) : (
              <TranscriptState query={transcriptQ} videoId={id} onUpload={() => fileRef.current?.click()} />
            ))}
          {side === 'words' && <SavedWordsPanel videoId={id} onSeek={(t) => player.seek(t, true)} />}
          {side === 'level' && <DifficultyPanel videoId={id} onSeek={(t) => player.seek(t, true)} />}
          {side === 'notes' && <NotesPanel videoId={id} getTime={player.getTime} onSeek={(t) => player.seek(t, true)} />}
          {side === 'next' && <UpNextPanel details={details.data} />}
        </div>
      </aside>

      <input
        ref={fileRef}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) upload.mutate(await f.text());
          e.target.value = '';
        }}
      />
      {pop && (
        <WordPopover
          target={pop}
          videoId={id}
          onClose={() => setPop(null)}
          onSavePhrase={
            pop.context
              ? () => {
                  const i = sentences.findIndex((s) => s.text === pop.context);
                  setPop(null);
                  if (i >= 0) savePhraseAt(i, pop.term);
                }
              : undefined
          }
        />
      )}
      <SavePhraseDialog draft={phraseDraft} videoId={id} onClose={() => setPhraseDraft(null)} />
      <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

function ToggleChip({
  on,
  onClick,
  icon,
  label,
  title,
  className,
  compact,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  className?: string;
  /** Chỉ hiện biểu tượng (tên vẫn đọc được bằng trình đọc màn hình, rê chuột xem giải thích) */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-xl px-3 font-display text-sm font-bold transition active:scale-95',
        on ? 'bg-brand-500 text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.18),0_4px_10px_-4px_color-mix(in_oklab,var(--color-brand-500)_70%,transparent)]' : 'bg-surface-2 text-muted hover:bg-surface-3 hover:text-ink',
        compact && 'px-2.5',
        className,
      )}
    >
      {icon}
      <span className={compact ? 'sr-only' : 'hidden sm:inline'}>{label}</span>
    </button>
  );
}

export default function WatchPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const stateQ = useQuery({ queryKey: ['video-state', id], queryFn: () => api.videoState(id), enabled: /^[\w-]{11}$/.test(id) });
  // Video đã dựng trình phát — các lần tải lại sau (vd. mạng kết nối lại) không được gỡ trình phát đang xem
  const shownFor = useRef<string | null>(null);
  if (!/^[\w-]{11}$/.test(id)) return <EmptyState icon="🤔" title="Link video không hợp lệ" />;
  // Có dữ liệu cũ trong cache mà đang tải lại → chờ bản mới: vị trí xem dở chỉ được đọc một lần khi dựng trình phát
  const waiting = stateQ.isPending || (stateQ.isFetching && !stateQ.isFetchedAfterMount);
  if (waiting && shownFor.current !== id) {
    return (
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-[60vh]" />
      </div>
    );
  }
  shownFor.current = id;
  const t = Number(params.get('t'));
  const saved = stateQ.data;
  const resume = saved && saved.lastPosition > 10 && saved.durationSec && saved.lastPosition < saved.durationSec - 15 ? saved.lastPosition : 0;
  const m = params.get('mode');
  const initialMode = m === 'shadow' || m === 'dictation' ? m : undefined;
  return <WatchView key={id} id={id} start={t > 0 ? t : resume} state={stateQ.data} initialMode={initialMode} />;
}
