import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.ts';
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
  words: { word: string; group: 'core' | 'related'; rank: number }[];
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
      run('DELETE FROM topic_words WHERE topic_id = ?', topicId);
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
    return { topics: data.topics.length, lexicon: data.lexicon.length };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!fs.existsSync(config.seedPath)) {
    console.error(`Không thấy ${config.seedPath}. Hãy chạy "npm run crawl" trước.`);
    process.exit(1);
  }
  const r = seedTopics();
  console.log(`✅ Đã nạp ${r.topics} chủ đề và ${r.lexicon} mục từ vào cơ sở dữ liệu.`);
}
