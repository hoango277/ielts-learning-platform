import { get, run } from '../db/index.ts';
import { phraseParts } from '../lib/ipa.ts';
import { inflectionRegex, levelFromFrequency, termKey } from '../lib/text.ts';
import { datamuse, wordFrequencies } from './datamuse.service.ts';
import { lookupTerm } from './lookup.service.ts';
import { translateBatch } from './translate/index.ts';

/** Ký tự cho phép trong một mục từ người dùng thêm: chữ cái, khoảng trắng, gạch nối, nháy đơn */
const TERM_RE = /^[a-z][a-z' -]*[a-z]$|^[a-z]$/;

function httpError(status: number, message: string) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** Chuẩn hoá mục từ người dùng gõ / dán: "  Global   Warming " → "global warming"; không hợp lệ → null */
export function normalizeTerm(raw: string): string | null {
  const key = termKey(raw.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim());
  if (!key || key.length > 60 || !TERM_RE.test(key) || key.split(' ').length > 5) return null;
  return key;
}

/** Collocation hay gặp (Datamuse): danh từ → "tính từ + danh từ", tính từ → "tính từ + danh từ" */
async function collocationsOf(word: string, pos: string | undefined): Promise<string[]> {
  if (/\s/.test(word)) return [];
  try {
    if (pos === 'noun') return (await datamuse(`rel_jjb=${encodeURIComponent(word)}&max=6`)).slice(0, 4).map((w) => `${w.word} ${word}`);
    if (pos === 'adjective') return (await datamuse(`rel_jja=${encodeURIComponent(word)}&max=6`)).slice(0, 4).map((w) => `${word} ${w.word}`);
  } catch {
    /* không có collocation cũng không sao */
  }
  return [];
}

/**
 * Mục từ trong kho từ dùng chung (bảng lexicon) cho một từ/cụm từ: có sẵn thì dùng lại,
 * chưa có thì tra (Google Dịch + từ điển + phiên âm dự phòng), dịch câu ví dụ, ước lượng cấp độ rồi lưu.
 */
export async function ensureLexiconEntry(raw: string): Promise<{ id: number; word: string; created: boolean }> {
  const key = normalizeTerm(raw);
  if (!key) throw httpError(400, `“${raw.trim().slice(0, 40)}” không phải từ/cụm từ tiếng Anh hợp lệ (tối đa 5 chữ, chỉ chữ cái).`);
  const existing = get<{ id: number }>('SELECT id FROM lexicon WHERE word = ?', key);
  if (existing) return { id: existing.id, word: key, created: false };

  const info = await lookupTerm(key);
  // Google trả nguyên văn khi không hiểu từ ("xqzvwk" → "xqzvwk") — không có trong từ điển nữa thì coi là không có từ này
  const echoed = info.translation.trim().toLowerCase() === key && !info.meanings.length && !info.dict.length;
  if (!info.translation || echoed) throw httpError(422, `Chưa tra được nghĩa của “${key}”. Kiểm tra chính tả hoặc thử lại sau.`);

  const isPhrase = /\s/.test(key);
  const pos = info.pos ?? info.dict[0]?.posEn ?? (isPhrase ? 'phrase' : undefined);
  const main = info.translation.normalize('NFC').trim();
  const extras = [...new Set((info.dict[0]?.terms ?? []).map((t) => t.normalize('NFC').trim()))]
    .filter((t) => t.toLowerCase() !== main.toLowerCase())
    .slice(0, 2);
  const definitions = info.meanings
    .flatMap((m) => m.definitions.slice(0, 2).map((d) => ({ pos: m.pos, definition: d.definition, example: d.example })))
    .slice(0, 4);

  // Câu ví dụ có chứa đúng từ này, dịch sang tiếng Việt (Hy-MT nếu bật, không thì Google)
  const re = inflectionRegex(key);
  const sentences = info.examples.filter((e) => re.test(e) && e.length <= 220);
  const pickedEn = (sentences.length ? sentences : info.examples).slice(0, 2).map((e) => e.charAt(0).toUpperCase() + e.slice(1));
  const vi = pickedEn.length ? await translateBatch(pickedEn).then((r) => r.translations).catch(() => [] as string[]) : [];
  const examples = pickedEn.map((en, i) => ({ en, vi: vi[i] || undefined }));

  // Cấp độ ước lượng theo tần suất (cụm từ: lấy chữ hiếm nhất), như bộ từ crawl sẵn
  const freqs = await wordFrequencies(isPhrase ? phraseParts(key) : [key]).catch(() => new Map<string, number | null>());
  const known = [...freqs.values()].filter((f): f is number => f != null);
  const frequency = known.length ? Math.min(...known) : null;
  let level = levelFromFrequency(frequency, isPhrase);
  if (isPhrase && (level === 'A1' || level === 'A2')) level = 'B1';

  const antonyms = [...new Set(info.meanings.flatMap((m) => m.antonyms))].slice(0, 6);
  const collocations = await collocationsOf(key, pos);

  // Hai người thêm cùng một từ cùng lúc → bản ghi sau bỏ qua, dùng bản đã có
  run(
    `INSERT INTO lexicon (word, pos, ipa, ipa_us, audio, audio_us, meaning_vi, meanings_vi, definitions, examples,
                          synonyms, antonyms, collocations, frequency, level, source, updated_at)
     VALUES (:word, :pos, :ipa, :ipaUs, :audio, :audioUs, :meaningVi, :meaningsVi, :definitions, :examples,
             :synonyms, :antonyms, :collocations, :frequency, :level, :source, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(word) DO NOTHING`,
    {
      word: key,
      pos: pos ?? null,
      ipa: info.ipaUk ?? info.ipa ?? null,
      ipaUs: info.ipaUs ?? info.ipa ?? null,
      audio: info.audioUk ?? null,
      audioUs: info.audioUs ?? info.audio ?? null,
      meaningVi: [main, ...extras].join(', '),
      meaningsVi: JSON.stringify(info.dict.map((d) => ({ pos: d.pos, terms: [...new Set(d.terms)].slice(0, 6) }))),
      definitions: JSON.stringify(definitions),
      examples: JSON.stringify(examples),
      synonyms: JSON.stringify(info.synonyms.slice(0, 8)),
      antonyms: JSON.stringify(antonyms),
      collocations: JSON.stringify(collocations),
      frequency,
      level,
      source: 'Thêm khi dùng app (Google Dịch, Free Dictionary API, Wiktionary, Datamuse)',
    },
  );
  const row = get<{ id: number }>('SELECT id FROM lexicon WHERE word = ?', key)!;
  return { id: row.id, word: key, created: true };
}

/** Xoá mục từ không còn thuộc bộ từ nào và không có trong sổ của ai (dọn sau khi bỏ từ / xoá bộ từ) */
export function pruneLexicon(ids: number[]) {
  for (const id of ids) {
    run(
      `DELETE FROM lexicon WHERE id = ?
         AND id NOT IN (SELECT lexicon_id FROM topic_words)
         AND id NOT IN (SELECT lexicon_id FROM words WHERE lexicon_id IS NOT NULL)`,
      id,
    );
  }
}
