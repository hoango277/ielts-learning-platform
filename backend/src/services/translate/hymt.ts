import { createLimiter } from '../../lib/http.ts';
import type { Settings } from '../settings.service.ts';

/**
 * Tencent Hunyuan Hy-MT (HY-MT1.5 / Hy-MT2) qua bất kỳ endpoint tương thích OpenAI:
 *  - Ollama:     ollama run hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0  → http://localhost:11434/v1
 *  - llama.cpp:  llama-server -hf tencent/HY-MT1.5-1.8B-GGUF:Q8_0  → http://localhost:8080/v1
 *  - vLLM:       vllm serve tencent/Hy-MT2-7B                      → http://localhost:8000/v1
 * Prompt theo đúng template trên model card (không có system prompt).
 */

const LANG_NAMES: Record<string, { en: string; zh: string }> = {
  vi: { en: 'Vietnamese', zh: '越南语' },
  en: { en: 'English', zh: '英语' },
  zh: { en: 'Chinese', zh: '中文' },
  ja: { en: 'Japanese', zh: '日语' },
  ko: { en: 'Korean', zh: '韩语' },
  fr: { en: 'French', zh: '法语' },
  de: { en: 'German', zh: '德语' },
  es: { en: 'Spanish', zh: '西班牙语' },
  th: { en: 'Thai', zh: '泰语' },
  id: { en: 'Indonesian', zh: '印尼语' },
  ru: { en: 'Russian', zh: '俄语' },
};

type HymtConfig = Pick<Settings, 'hymtBaseUrl' | 'hymtModel' | 'hymtApiKey' | 'hymtPromptStyle'>;

export function isHymtConfigured(s: HymtConfig) {
  return Boolean(s.hymtBaseUrl.trim() && s.hymtModel.trim());
}

export function buildPrompt(text: string, to: string, style: HymtConfig['hymtPromptStyle'], context?: string): string {
  const lang = LANG_NAMES[to] ?? { en: to, zh: to };
  const ctx = context?.trim();
  if (style === 'hymt15') {
    if (ctx) {
      return `${ctx}\n参考上面的信息，把下面的文本翻译成${lang.zh}，注意不需要翻译上文，也不要额外解释：\n${text}`;
    }
    return `Translate the following segment into ${lang.en}, without additional explanation.\n\n${text}`;
  }
  if (ctx) {
    return (
      `[Background Information]\n${ctx}\n\n` +
      `Please translate the following text into ${lang.en}, taking the provided background information into consideration.\n\n` +
      `[Source Text]\n${text}`
    );
  }
  return `Translate the following text into ${lang.en}. Note that you should only output the translated result without any additional explanation:\n\n${text}`;
}

function cleanOutput(raw: string): string {
  let out = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  out = out.replace(/^<target>|<\/target>$/g, '').trim();
  out = out.replace(/^\[?(Translation|Bản dịch)\]?\s*[:：]\s*/i, '').trim();
  if (/^["“].*["”]$/s.test(out)) out = out.slice(1, -1).trim();
  return out;
}

// Model local thường chạy CPU/GPU đơn → hạn chế song song
const limit = createLimiter(2);

function endpoint(base: string, path: string) {
  return base.replace(/\/+$/, '') + path;
}

export async function hymtTranslate(
  text: string,
  to: string,
  cfg: HymtConfig,
  opts: { context?: string; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  if (!isHymtConfigured(cfg)) throw new Error('Hy-MT chưa được cấu hình');
  const prompt = buildPrompt(text, to, cfg.hymtPromptStyle, opts.context);
  return limit(async () => {
    const res = await fetch(endpoint(cfg.hymtBaseUrl, '/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.hymtApiKey ? { Authorization: `Bearer ${cfg.hymtApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.hymtModel,
        messages: [{ role: 'user', content: prompt }],
        // Tham số khuyến nghị trên model card
        temperature: 0.7,
        top_p: 0.6,
        top_k: 20,
        repetition_penalty: 1.05,
        max_tokens: opts.maxTokens ?? Math.min(2048, 64 + text.length * 3),
        stream: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Hy-MT HTTP ${res.status}: ${body.slice(0, 200)}`);
    const json = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('Hy-MT trả về rỗng');
    return cleanOutput(content);
  });
}

export async function hymtHealth(cfg: HymtConfig) {
  if (!isHymtConfigured(cfg)) return { ok: false, message: 'Chưa cấu hình Base URL và Model' };
  const t0 = Date.now();
  try {
    const sample = await hymtTranslate('Practice makes perfect.', 'vi', cfg, { timeoutMs: 90000 });
    return { ok: true, message: 'Kết nối thành công', latencyMs: Date.now() - t0, sample };
  } catch (err) {
    return { ok: false, message: (err as Error).message, latencyMs: Date.now() - t0 };
  }
}
