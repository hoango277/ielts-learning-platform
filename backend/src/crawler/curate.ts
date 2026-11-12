/**
 * Áp dụng dữ liệu soạn tay (curated.ts) vào bộ từ: loại từ lạc đề, sửa nghĩa tiếng Việt, bổ sung câu ví dụ,
 * định nghĩa, phiên âm, từ loại còn thiếu. Không gọi mạng.
 *
 *   npm run crawl:curate        # sửa data/seed/topics.json; app tự nạp lại khi khởi động
 *
 * Crawler cũng tự gọi applyCuration trước khi ghi file, nên crawl lại không làm mất phần soạn tay.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { config } from '../config.ts';
import type { SeedFile } from '../db/seed.ts';
import { DEFINITIONS, EXAMPLES, EXCLUDE, IPA_FIX, MEANING_VI, POS_FIX } from './curated.ts';

export function applyCuration(seed: SeedFile) {
  const stats = { excluded: 0, pruned: 0, meanings: 0, examples: 0, definitions: 0, ipa: 0, pos: 0 };
  for (const t of seed.topics) {
    const drop = new Set(EXCLUDE[t.slug] ?? []);
    const before = t.words.length;
    t.words = t.words.filter((w) => !drop.has(w.word));
    stats.excluded += before - t.words.length;
  }
  // Mục từ không còn thuộc chủ đề nào → bỏ khỏi file
  const used = new Set(seed.topics.flatMap((t) => t.words.map((w) => w.word)));
  const total = seed.lexicon.length;
  seed.lexicon = seed.lexicon.filter((l) => used.has(l.word));
  stats.pruned = total - seed.lexicon.length;

  for (const l of seed.lexicon) {
    const vi = MEANING_VI[l.word];
    if (vi && l.meaningVi !== vi) {
      l.meaningVi = vi;
      stats.meanings++;
    }
    const pos = POS_FIX[l.word];
    if (pos && !l.pos) {
      l.pos = pos;
      stats.pos++;
    }
    const ipa = IPA_FIX[l.word];
    if (ipa && !l.ipa && !l.ipaUs) {
      [l.ipa, l.ipaUs] = ipa;
      stats.ipa++;
    }
    // Ví dụ / định nghĩa soạn tay chỉ điền vào chỗ trống, không thay dữ liệu từ điển đã có
    const example = EXAMPLES[l.word];
    if (example && !l.examples.length) {
      l.examples = [{ en: example[0], vi: example[1] }];
      stats.examples++;
    }
    const definition = DEFINITIONS[l.word];
    if (definition && !l.definitions.length) {
      l.definitions = [{ pos: l.pos ?? '', definition }];
      stats.definitions++;
    }
  }
  return stats;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = JSON.parse(fs.readFileSync(config.seedPath, 'utf8')) as SeedFile;
  const s = applyCuration(seed);
  fs.writeFileSync(config.seedPath, JSON.stringify(seed, null, 1));
  console.log(
    `✅ Loại ${s.excluded} từ lạc đề (bỏ ${s.pruned} mục), sửa ${s.meanings} nghĩa, thêm ${s.examples} ví dụ, ` +
      `${s.definitions} định nghĩa, ${s.ipa} phiên âm, ${s.pos} từ loại → ${config.seedPath}`,
  );
}
