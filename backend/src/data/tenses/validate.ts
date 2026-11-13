import { analyzeSentence, checkProduction, isTenseForm, type TenseForm } from '../../lib/tense.ts';
import type { LessonPack, TimelineSpec } from './types.ts';

/**
 * Kiểm tra nội dung một bài (dùng trong unit test và khi soạn):
 *   npx tsx src/data/tenses/validate.ts [lessonId]
 * - Đủ số lượng phần bài học và câu luyện tối thiểu.
 * - Thì ghi trong nội dung khớp với bộ nhận diện thì (src/lib/tense.ts).
 * - Mọi đáp án mẫu của câu phản xạ được chấm ĐÚNG, mọi câu sai mẫu bị chấm SAI.
 */

export const MIN = { uses: 2, ccq: 3, contrasts: 2, vietnamese: 2, traps: 3, chunks: 5, meaning: 6, ccqItems: 10, listen: 6, produce: 14, prompts: 2 };

const hasForm = (sentence: string, form: TenseForm) => analyzeSentence(sentence).some((v) => v.form === form);
const formsOf = (sentence: string) => analyzeSentence(sentence).map((v) => `${v.text}→${v.form}`).join(', ') || 'không thấy động từ';

function checkTimeline(t: TimelineSpec, where: string, errors: string[]) {
  if (!t.marks.length) errors.push(`${where}: trục thời gian chưa có dấu nào`);
  for (const m of t.marks) {
    const nums = 'at' in m ? [m.at] : [m.from, m.to];
    if (nums.some((n) => !(n >= 0 && n <= 100))) errors.push(`${where}: vị trí ngoài 0–100 (${JSON.stringify(m)})`);
  }
}

export function validatePack(pack: LessonPack): string[] {
  const errors: string[] = [];
  const { lesson, items, prompts } = pack;
  const L = lesson.id;
  const need = (n: number, min: number, what: string) => n < min && errors.push(`${L}: cần ít nhất ${min} ${what} (đang có ${n})`);

  need(lesson.uses.length, MIN.uses, 'cách dùng (uses)');
  need(lesson.ccq.length, MIN.ccq, 'câu hỏi kiểm tra trong bài (ccq)');
  need(lesson.contrasts.length, MIN.contrasts, 'cặp câu đối chiếu');
  need(lesson.vietnamese.length, MIN.vietnamese, 'dòng đối chiếu tiếng Việt');
  need(lesson.traps.length, MIN.traps, 'bẫy');
  need(lesson.chunks.length, MIN.chunks, 'cụm làm sẵn');
  for (const f of lesson.forms) if (!lesson.shapes.some((s) => s.form === f)) errors.push(`${L}: thiếu "hình dạng" cho ${f}`);
  lesson.uses.forEach((u, i) => {
    checkTimeline(u.timeline, `${L} uses[${i}]`, errors);
    if (u.examples.length < 2) errors.push(`${L} uses[${i}]: cần ít nhất 2 ví dụ`);
    for (const ex of u.examples) if (!hasForm(ex.en, u.form)) errors.push(`${L} uses[${i}] ví dụ "${ex.en}" không nhận ra ${u.form} (thấy: ${formsOf(ex.en)})`);
  });
  lesson.contrasts.forEach((c, i) => {
    for (const side of [c.a, c.b]) if (!hasForm(side.en, side.form)) errors.push(`${L} contrasts[${i}] "${side.en}" không nhận ra ${side.form} (thấy: ${formsOf(side.en)})`);
  });

  const count = (k: string) => items.filter((it) => it.kind === k).length;
  need(count('meaning'), MIN.meaning, 'câu "meaning"');
  need(count('ccq'), MIN.ccqItems, 'câu "ccq"');
  need(count('listen'), MIN.listen, 'câu "listen"');
  need(count('produce'), MIN.produce, 'câu "produce"');
  need(prompts.length, MIN.prompts, 'đề viết');

  const ids = new Set<string>();
  for (const it of items) {
    const where = `${L}/${it.id}`;
    if (ids.has(it.id)) errors.push(`${where}: trùng id`);
    ids.add(it.id);
    if (it.lesson !== L) errors.push(`${where}: lesson phải là "${L}"`);
    if (!isTenseForm(it.form)) errors.push(`${where}: form không hợp lệ`);
    switch (it.kind) {
      case 'meaning':
        if (it.options.length < 3 || it.options.length > 4) errors.push(`${where}: cần 3–4 lựa chọn`);
        if (!(it.answer >= 0 && it.answer < it.options.length)) errors.push(`${where}: answer ngoài phạm vi`);
        if (!hasForm(it.sentence, it.form)) errors.push(`${where}: "${it.sentence}" không nhận ra ${it.form} (thấy: ${formsOf(it.sentence)})`);
        break;
      case 'ccq':
        if (!hasForm(it.sentence, it.form)) errors.push(`${where}: "${it.sentence}" không nhận ra ${it.form} (thấy: ${formsOf(it.sentence)})`);
        break;
      case 'listen': {
        if (it.options.length < 2 || it.options.length > 3) errors.push(`${where}: cần 2–3 câu`);
        if (new Set(it.options.map((o) => o.text.toLowerCase())).size !== it.options.length) errors.push(`${where}: các câu phải khác nhau`);
        if (new Set(it.options.map((o) => o.form)).size !== it.options.length) errors.push(`${where}: mỗi câu một thì khác nhau`);
        for (const o of it.options) if (!hasForm(o.text, o.form)) errors.push(`${where}: "${o.text}" không nhận ra ${o.form} (thấy: ${formsOf(o.text)})`);
        if (!it.options.some((o) => o.form === it.form)) errors.push(`${where}: phải có một câu đúng thì ${it.form}`);
        break;
      }
      case 'produce': {
        if (!it.accept.includes(it.form)) errors.push(`${where}: accept phải chứa form`);
        if (!it.answers.length) errors.push(`${where}: chưa có đáp án`);
        if (!it.wrong.length) errors.push(`${where}: cần ít nhất 1 câu sai mẫu`);
        const target = { verb: it.verb, accept: it.accept };
        it.answers.forEach((a, i) => {
          const r = checkProduction(target, a);
          if (!r.correct) errors.push(`${where}: đáp án "${a}" bị chấm SAI (${r.reason}, thấy: ${formsOf(a)}${r.issues.length ? `; lỗi: ${r.issues.map((x) => x.type).join(',')}` : ''})`);
          else if (i === 0 && r.paraphrase) errors.push(`${where}: câu mẫu "${a}" không chứa động từ "${it.verb}" (thấy: ${formsOf(a)})`);
        });
        for (const w of it.wrong) {
          const r = checkProduction(target, w);
          if (r.correct) errors.push(`${where}: câu sai mẫu "${w}" lại được chấm ĐÚNG (thấy: ${formsOf(w)})`);
        }
        break;
      }
    }
  }
  for (const p of prompts) {
    if (p.minSentences < 3) errors.push(`${L}/${p.id}: minSentences nên ≥ 3`);
    if (!p.targets.some((f) => hasForm(p.model, f))) errors.push(`${L}/${p.id}: bài mẫu không có thì mục tiêu nào`);
  }
  return errors;
}

// Chạy trực tiếp: in lỗi của một bài hoặc tất cả
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('validate.ts')) {
  const { LESSON_PACKS } = await import('./index.ts');
  const only = process.argv[2];
  let total = 0;
  for (const pack of LESSON_PACKS) {
    if (only && pack.lesson.id !== only) continue;
    const errs = validatePack(pack);
    total += errs.length;
    const c = (k: string) => pack.items.filter((i) => i.kind === k).length;
    console.log(`\n${pack.lesson.id}: meaning ${c('meaning')} · ccq ${c('ccq')} · listen ${c('listen')} · produce ${c('produce')} · đề viết ${pack.prompts.length} → ${errs.length ? `${errs.length} LỖI` : 'OK'}`);
    for (const e of errs) console.log('  - ' + e);
  }
  process.exitCode = total ? 1 : 0;
}
