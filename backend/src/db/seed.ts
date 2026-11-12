import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.ts';
import { sha1 } from '../lib/text.ts';
import { get, run, tx } from './index.ts';

export interface SeedLexicon {
  word: string;
  pos?: string | null;
  ipa?: string | null;
  ipaUs?: string | null;
  audio?: string | null;
  audioUs?: string | null;
  meaningVi: string;
  meaningsVi: { pos: string; terms: string[] }[];
  definitions: { pos: string; definition: string; example?: string }[];
  examples: { en: string; vi?: string }[];
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  frequency?: number | null;
  level?: string | null;
}

export interface SeedTopic {
  slug: string;
  name: string;
  nameVi: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  order: number;
  /** core = cụm từ cốt lõi (soạn tay) · related = từ liên quan · advanced = từ nâng cao C1–C2 (ít gặp hơn) */
  words: { word: string; group: 'core' | 'related' | 'advanced'; rank: number }[];
}

export interface SeedFile {
  version: number;
  generatedAt: string;
  sources: string[];
  topics: SeedTopic[];
  lexicon: SeedLexicon[];
}

/** Nạp (hoặc cập nhật) dữ liệu chủ đề từ file JSON đã crawl. Không đụng tới sổ từ của người học. */
export function seedTopics(file = config.seedPath) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as SeedFile;
  return tx(() => {
    const lexIds = new Map<string, number>();
    for (const l of data.lexicon) {
      run(
        `INSERT INTO lexicon (word, pos, ipa, ipa_us, audio, audio_us, meaning_vi, meanings_vi, definitions, examples,
                              synonyms, antonyms, collocations, frequency, level, source, updated_at)
         VALUES (:word, :pos, :ipa, :ipaUs, :audio, :audioUs, :meaningVi, :meaningsVi, :definitions, :examples,
                 :synonyms, :antonyms, :collocations, :frequency, :level, :source, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(word) DO UPDATE SET pos = excluded.pos, ipa = excluded.ipa, ipa_us = excluded.ipa_us,
           audio = excluded.audio, audio_us = excluded.audio_us, meaning_vi = excluded.meaning_vi,
           meanings_vi = excluded.meanings_vi, definitions = excluded.definitions, examples = excluded.examples,
           synonyms = excluded.synonyms, antonyms = excluded.antonyms, collocations = excluded.collocations,
           frequency = excluded.frequency, level = excluded.level, source = excluded.source, updated_at = excluded.updated_at`,
        {
          word: l.word,
          pos: l.pos ?? null,
          ipa: l.ipa ?? null,
          ipaUs: l.ipaUs ?? null,
          audio: l.audio ?? null,
          audioUs: l.audioUs ?? null,
          meaningVi: l.meaningVi,
          meaningsVi: JSON.stringify(l.meaningsVi ?? []),
          definitions: JSON.stringify(l.definitions ?? []),
          examples: JSON.stringify(l.examples ?? []),
          synonyms: JSON.stringify(l.synonyms ?? []),
          antonyms: JSON.stringify(l.antonyms ?? []),
          collocations: JSON.stringify(l.collocations ?? []),
          frequency: l.frequency ?? null,
          level: l.level ?? null,
          source: data.sources.join(', '),
        },
      );
      lexIds.set(l.word, get<{ id: number }>('SELECT id FROM lexicon WHERE word = ?', l.word)!.id);
    }

    for (const t of data.topics) {
      run(
        `INSERT INTO topics (slug, name, name_vi, description, icon, color, category, sort_order)
         VALUES (:slug, :name, :nameVi, :description, :icon, :color, :category, :order)
         ON CONFLICT(slug) DO UPDATE SET name = excluded.name, name_vi = excluded.name_vi, description = excluded.description,
           icon = excluded.icon, color = excluded.color, category = excluded.category, sort_order = excluded.sort_order`,
        { slug: t.slug, name: t.name, nameVi: t.nameVi, description: t.description, icon: t.icon, color: t.color, category: t.category, order: t.order },
      );
      const topicId = get<{ id: number }>('SELECT id FROM topics WHERE slug = ?', t.slug)!.id;
      // Chỉ thay phần từ của dữ liệu crawl; từ do quản trị viên thêm (source = 'admin') được giữ nguyên
      run("DELETE FROM topic_words WHERE topic_id = ? AND source = 'seed'", topicId);
      for (const w of t.words) {
        const lexId = lexIds.get(w.word);
        if (!lexId) continue;
        run(
          'INSERT OR IGNORE INTO topic_words (topic_id, lexicon_id, group_name, rank) VALUES (?, ?, ?, ?)',
          topicId,
          lexId,
          w.group,
          w.rank,
        );
      }
    }
    // Dọn mục từ không còn thuộc chủ đề nào (và không được sổ từ tham chiếu)
    run(
      `DELETE FROM lexicon WHERE id NOT IN (SELECT lexicon_id FROM topic_words)
         AND id NOT IN (SELECT lexicon_id FROM words WHERE lexicon_id IS NOT NULL)`,
    );
    // Từ đã lưu vào sổ từ bộ chủ đề trước khi có phiên âm → điền phiên âm mới (không ghi đè cái đã có)
    run(
      `UPDATE words SET ipa = (SELECT COALESCE(l.ipa, l.ipa_us) FROM lexicon l WHERE l.id = words.lexicon_id)
        WHERE (ipa IS NULL OR ipa = '') AND lexicon_id IS NOT NULL`,
    );
    run(
      "INSERT INTO app_kv (key, value) VALUES ('seed.hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      seedHash(file),
    );
    return { topics: data.topics.length, lexicon: data.lexicon.length };
  });
}

/** Dấu vân tay nội dung file dữ liệu (bỏ qua khác biệt xuống dòng CRLF/LF giữa Windows và Linux) */
function seedHash(file: string) {
  return sha1(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
}

/**
 * Lúc khởi động: nạp bộ từ khi cơ sở dữ liệu còn trống, hoặc nạp lại khi file dữ liệu đã đổi
 * (vd. bản mới bổ sung phiên âm). Nạp theo kiểu cập nhật tại chỗ (theo từ / slug) nên giữ nguyên id,
 * sổ từ và tiến độ học.
 */
export function syncSeed(file = config.seedPath): ({ topics: number; lexicon: number; first: boolean }) | null {
  if (!fs.existsSync(file)) return null;
  const topicCount = get<{ n: number }>('SELECT COUNT(*) AS n FROM topics')!.n;
  const saved = get<{ value: string }>("SELECT value FROM app_kv WHERE key = 'seed.hash'")?.value;
  if (topicCount && saved === seedHash(file)) return null;
  return { ...seedTopics(file), first: !topicCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync(config.seedPath)) {
    console.error(`Không thấy ${config.seedPath}. Hãy chạy "npm run crawl" trước.`);
    process.exit(1);
  }
  const r = seedTopics();
  console.log(`✅ Đã nạp ${r.topics} chủ đề và ${r.lexicon} mục từ vào cơ sở dữ liệu.`);
}
