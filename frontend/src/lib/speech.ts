// Phát âm: ưu tiên file audio từ điển (người thật), không có thì dùng giọng đọc của trình duyệt (TTS)

let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  voicesCache = window.speechSynthesis.getVoices();
  return voicesCache;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = voicesCache.length ? voicesCache : loadVoices();
  const sameLang = voices.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  const pool = sameLang.length ? sameLang : voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  // Giọng "Natural"/"Online" (Edge) và Google nghe tự nhiên hơn
  return (
    pool.find((v) => /natural|online/i.test(v.name)) ??
    pool.find((v) => /google/i.test(v.name)) ??
    pool.find((v) => /aria|jenny|guy|samantha|daniel|libby|sonia/i.test(v.name)) ??
    pool[0]
  );
}

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function speak(text: string, opts: { accent?: 'us' | 'uk'; rate?: number; onEnd?: () => void } = {}) {
  if (!ttsSupported()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.accent === 'uk' ? 'en-GB' : 'en-US';
  u.rate = opts.rate ?? 0.95;
  const voice = pickVoice(u.lang);
  if (voice) u.voice = voice;
  if (opts.onEnd) u.onend = opts.onEnd;
  synth.speak(u);
  return true;
}

let currentAudio: HTMLAudioElement | null = null;

/** Phát âm một từ: audio thật nếu có, lỗi thì chuyển sang TTS. */
export function pronounce(term: string, opts: { audio?: string | null; accent?: 'us' | 'uk'; rate?: number } = {}) {
  currentAudio?.pause();
  if (opts.audio) {
    const audio = new Audio(opts.audio);
    currentAudio = audio;
    audio.play().catch(() => speak(term, opts));
    return;
  }
  speak(term, opts);
}

// ---- Nhận dạng giọng nói (Web Speech API — Chrome/Edge) ----

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string; confidence: number };
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}
