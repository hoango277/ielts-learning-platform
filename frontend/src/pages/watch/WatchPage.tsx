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
  Mic,
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
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { SavePhraseDialog, type PhraseDraft } from '../../components/phrase/SavePhraseDialog';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Badge, EmptyState, ErrorBox, Kbd, Segmented, Select, Skeleton, Spinner } from '../../components/ui/primitives';
import { ChannelAvatar } from '../../components/video/VideoCard';
import { useSettings } from '../../components/word/bits';
import { WordPopover, type PopoverTarget } from '../../components/word/WordPopover';
import { useHotkeys } from '../../hooks/useHotkeys';
import { useLocalStorage } from '../../hooks/misc';
import { PLAYER_ERRORS, useYouTubePlayer, type PlayerApi } from '../../hooks/useYouTubePlayer';
import { api } from '../../lib/api';
import type { Transcript, VideoDetails, VideoState } from '../../lib/types';
import { cn, formatNumber, formatTime } from '../../lib/utils';
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
    ['W', 'Chế độ rạp: video rộng hết khung (máy tính)'],
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

function Player({ player, videoId }: { player: PlayerApi; videoId: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-lg">
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
  // Chế độ rạp (máy tính): video rộng hết khung, bảng phụ đề / luyện tập xuống dưới — nhớ cho lần sau
  const [theatre, setTheatre] = useLocalStorage('watch-theatre', false);
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
        setPop({ term: token.key, context: sentences[i]?.text, rect: el.getBoundingClientRect(), videoTime: sentences[i]?.start });
      },
    [player.pause, sentences], // eslint-disable-line react-hooks/exhaustive-deps
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
    w: () => setTheatre((v) => !v),
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
    (i: number, chunk?: string) => {
      const s = sentences[i];
      if (!s) return;
      player.pause();
      setPhraseDraft({ text: s.text, start: s.start, end: s.end, chunk });
    },
    [sentences, player.pause], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const activeTokens = activeIndex >= 0 ? tokenized[activeIndex] : null;

  const sideTabs: { key: SideTab; label: string; icon: typeof Captions }[] = [
    { key: 'transcript', label: 'Phụ đề', icon: Captions },
    { key: 'words', label: 'Từ đã lưu', icon: BookMarked },
    { key: 'level', label: 'Độ khó', icon: Gauge },
    { key: 'notes', label: 'Ghi chú', icon: NotebookPen },
    { key: 'next', label: 'Gợi ý', icon: ListVideo },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      {/*
        Chế độ rạp chỉ đổi bố cục bằng CSS: cột trái thành `display: contents` để khung video trải hết hai cột,
        nội dung + bảng bên xuống hàng dưới. Cây DOM giữ nguyên → khung YouTube không bị dựng lại, video không tải lại.
      */}
      <div className={cn('min-w-0 space-y-4', theatre && 'xl:contents')}>
        <div
          className={cn(
            'sticky top-14 z-10 -mx-4 bg-bg px-4 pb-2 pt-1 sm:-mx-6 sm:px-6 xl:static',
            theatre ? 'xl:col-span-2 xl:-mt-5 xl:mb-0 xl:bg-black xl:py-4' : 'xl:mx-0 xl:bg-transparent xl:p-0',
          )}
        >
          {/* Rạp: video cao tối đa vừa màn hình (chừa chỗ thanh trên cùng), canh giữa trên nền đen */}
          <div className={cn(theatre && 'xl:mx-auto xl:max-w-[calc((100dvh-9.5rem)*16/9)]')}>
            <Player player={player} videoId={id} />
          </div>
        </div>

        <div className={cn('min-w-0 space-y-4', theatre && 'xl:col-start-1 xl:row-start-2')}>
          {mode === 'watch' && (
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
            />
          )}

          {/* Thanh điều khiển */}
          <div className="card flex flex-wrap items-center gap-2 p-2.5">
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
                <ToggleChip on={autoPause} onClick={() => toggleAutoPause()} icon={<Pause className="h-4 w-4" />} label="Tự dừng" title="Video tự tạm dừng sau mỗi câu để bạn kịp nhại lại (phím A)" />
                <ToggleChip on={loop} onClick={() => setLoop((v) => !v)} icon={<Repeat className="h-4 w-4" />} label="Lặp câu" title="Phát đi phát lại câu hiện tại (phím L)" />
                <ToggleChip on={hideSubs} onClick={() => setHideSubs((v) => !v)} icon={hideSubs ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} label="Che phụ đề" title="Làm mờ phụ đề để luyện nghe (phím H)" />
              </>
            )}
            <ToggleChip on={showTranslation} onClick={() => setShowTranslation((v) => !v)} icon={<Languages className="h-4 w-4" />} label="Song ngữ" title="Hiện thêm bản dịch tiếng Việt dưới phụ đề tiếng Anh (phím T)" />
            <DifficultyChip videoId={id} onClick={() => setSide('level')} />
            <ToggleChip
              on={theatre}
              onClick={() => setTheatre((v) => !v)}
              icon={<RectangleHorizontal className="h-4 w-4" />}
              label="Rạp"
              title="Chế độ rạp: video rộng hết khung, phụ đề và bảng luyện xuống dưới (phím W)"
              className="hidden xl:inline-flex"
            />
            <span className="ml-auto hidden font-mono text-xs text-muted sm:inline">
              {current >= 0 && sentences[current] ? formatTime(sentences[current].start) : '0:00'} / {formatTime(player.duration || details.data?.durationSec || 0)}
            </span>
            <Button size="icon-sm" variant="ghost" onClick={() => setHelp(true)} aria-label="Phím tắt" title="Phím tắt (?)">
              <Keyboard className="h-4 w-4" />
            </Button>
          </div>

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

          {mode === 'shadow' && sentences.length > 0 && (
            <ShadowingPanel
              sentences={sentences}
              tokens={tokenized[practiceIndex]}
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

          <VideoInfo
            details={details.data}
            state={state}
            transcript={transcript}
            track={track}
            setTrack={setTrack}
            onUpload={() => fileRef.current?.click()}
            onResetUpload={() => resetUpload.mutate()}
          />
          {details.error && <ErrorBox error={details.error} onRetry={() => details.refetch()} />}
        </div>
      </div>

      {/* Panel bên phải (chế độ rạp: nằm hàng dưới, cạnh bảng luyện tập) */}
      <aside
        className={cn(
          'card flex h-[75vh] min-h-105 flex-col overflow-hidden xl:sticky xl:top-20 xl:h-[calc(100dvh-6.5rem)]',
          theatre && 'xl:col-start-2 xl:row-start-2',
        )}
      >
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
                tokenized={tokenized}
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
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
  className?: string;
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
        className,
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
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
