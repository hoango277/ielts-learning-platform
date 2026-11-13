import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeSentence, checkProduction, findIssues, tenseSpansForWords } from './lib/tense.ts';

const forms = (s: string) => analyzeSentence(s).map((v) => v.form);

test('nhận diện thì: câu trần thuật, câu hỏi đảo, dạng rút gọn', () => {
  assert.deepEqual(forms('She works in a bank.'), ['present-simple']);
  assert.deepEqual(forms('I am watching a video right now.'), ['present-continuous']);
  assert.deepEqual(forms('I was cooking when she called.'), ['past-continuous', 'past-simple']);
  assert.deepEqual(forms('I have lived here since 2019.'), ['present-perfect']);
  assert.deepEqual(forms("I've been learning English for three years."), ['present-perfect-continuous']);
  assert.deepEqual(forms('She had left before I arrived.'), ['past-perfect', 'past-simple']);
  assert.deepEqual(forms('I will call you tomorrow.'), ['future-will']);
  assert.deepEqual(forms("I'm going to study abroad next year."), ['future-going-to']);
  // Câu hỏi đảo: trợ động từ + động từ chính được gộp lại
  assert.deepEqual(forms('Have you ever been to Japan?'), ['present-perfect']);
  assert.deepEqual(forms('Did you finish your homework?'), ['past-simple']);
  assert.deepEqual(forms('Is she working now?'), ['present-continuous']);
  assert.deepEqual(forms('Are you going to study abroad?'), ['future-going-to']);
  assert.deepEqual(forms("He's been to London twice."), ['present-perfect']);
  // Không phải động từ chia thì: sau "to", mệnh lệnh
  assert.deepEqual(forms('I want to go home.'), ['present-simple']);
  assert.deepEqual(forms('Look at this picture.'), []);
  const [q] = analyzeSentence('What did you do last weekend?');
  assert.equal(q.lemma, 'do');
});

test('soát lỗi thì hay gặp của người Việt', () => {
  const types = (s: string) => findIssues(s).map((i) => `${i.type}:${i.fix ?? ''}`);
  assert.deepEqual(types('I go to school yesterday.'), ['past-marker-present:went']);
  assert.deepEqual(types('I have seen him yesterday.'), ['finished-time-perfect:saw']);
  assert.deepEqual(types('I lived here since 2019.'), ['since-past:have lived']);
  assert.deepEqual(types('I have lived here since last year.'), []);
  assert.deepEqual(types('He go to work by bus.'), ['agreement:goes']);
  assert.deepEqual(types("She don't like coffee."), ["agreement:doesn't"]);
  assert.deepEqual(types('They goes to school every day.'), ['agreement:go']);
  assert.deepEqual(types("I didn't went to the party."), ['did-past:go']);
  assert.deepEqual(types('I going to school now.'), ['missing-be:am going']);
  assert.deepEqual(types('I have went there before.'), ['have-past:gone']);
  assert.deepEqual(types('We was late.'), ['agreement:were']);
  assert.deepEqual(types('I watched TV when I was a child.'), []);
  // Gợi ý luôn là câu hỏi, không lộ đáp án
  for (const i of findIssues('I go to school yesterday.')) assert.ok(!i.hint.includes('went'));
});

test('chấm câu phản xạ: đúng thì mới đạt, cho phép đổi động từ', () => {
  const live = { verb: 'live', accept: ['present-perfect', 'present-perfect-continuous'] as const };
  const t = { verb: live.verb, accept: [...live.accept] };
  assert.equal(checkProduction(t, "I've lived in Hanoi for three years.").correct, true);
  assert.equal(checkProduction(t, 'i have been living in ha noi for 3 years').correct, true);
  assert.equal(checkProduction(t, 'I lived in Hanoi for three years').correct, false);
  assert.equal(checkProduction(t, 'I live in Hanoi for three years').reason, 'wrong-form');
  const para = checkProduction(t, "I've stayed in Hanoi for three years");
  assert.equal(para.correct, true);
  assert.equal(para.paraphrase, true);
  // Đúng thì nhưng sai hoà hợp chủ ngữ → chưa đạt
  assert.equal(checkProduction({ verb: 'go', accept: ['present-simple'] }, 'He go to work by bus.').correct, false);
  assert.equal(checkProduction({ verb: 'go', accept: ['present-simple'] }, 'He goes to work by bus.').correct, true);
});

test('Kính thì: gắn thì theo chỉ số từ của câu phụ đề', () => {
  const spans = tenseSpansForWords('Have you ever been to Japan and what did you see there'.split(' '));
  assert.deepEqual(
    spans.map((s) => [s.from, s.to, s.form]),
    [
      [0, 0, 'present-perfect'],
      [3, 3, 'present-perfect'],
      [8, 8, 'past-simple'],
      [10, 10, 'past-simple'],
    ],
  );
  assert.equal(spans[0].g, spans[1].g);
});

test('nội dung module Thì: 6 bài đủ phần, đáp án mẫu được chấm đúng, câu sai mẫu bị chấm sai', async () => {
  const { LESSON_PACKS, ALL_ITEMS, ALL_PROMPTS } = await import('./data/tenses/index.ts');
  const { validatePack } = await import('./data/tenses/validate.ts');
  assert.equal(LESSON_PACKS.length, 6);
  const errors = LESSON_PACKS.flatMap((p) => validatePack(p));
  assert.deepEqual(errors, []);
  const ids = ALL_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'id câu luyện bị trùng giữa các bài');
  const pids = ALL_PROMPTS.map((p) => p.id);
  assert.equal(new Set(pids).size, pids.length, 'id đề viết bị trùng');
});

test('module Thì: chấm gợi ý trước, tự thêm câu sai vào hàng ôn, thống kê 3 chỉ số', async () => {
  const { register } = await import('./services/auth.service.ts');
  const { runWithUser } = await import('./lib/context.ts');
  const { all } = await import('./db/index.ts');
  const t = await import('./services/tenses.service.ts');
  const { ALL_ITEMS } = await import('./data/tenses/index.ts');
  const { todayPlan } = await import('./services/today.service.ts');

  const user = (await register({ name: 'Thì', email: `tense-${Date.now()}@example.com`, password: 'mat-khau-123' })).user;
  await runWithUser(user.id, async () => {
    const item = ALL_ITEMS.find((i) => i.kind === 'produce');
    assert.ok(item && item.kind === 'produce');

    // Lần 1 sai → chỉ có gợi ý, không lộ đáp án; câu được thêm vào hàng ôn với nhãn thì
    const r1 = await t.checkAnswer({ itemId: item.id, text: item.wrong[0], mode: 'type', attempt: 1, latencyMs: 4000 });
    assert.equal(r1.correct, false);
    assert.equal(r1.answer, undefined);
    assert.ok(r1.hint);
    assert.equal(r1.addedCard, true);
    const cards = all<{ tense: string; note: string }>('SELECT tense, note FROM phrases WHERE user_id = ?', user.id);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].tense, item.form);

    // Lần 2 → hiện đáp án + giải thích; lượt thứ hai không ghi thêm vào thống kê
    const r2 = await t.checkAnswer({ itemId: item.id, text: item.answers[0], mode: 'type', attempt: 2 });
    assert.equal(r2.correct, true);
    assert.equal(r2.answer, item.answers[0]);
    assert.ok(r2.explain);

    // Bài sửa câu: gõ lại y nguyên câu sai không được tính là đúng
    const fix = await t.checkAnswer({ itemId: item.id, text: item.wrong[0], mode: 'fix', attempt: 1 });
    assert.equal(fix.correct, false);

    // Nói đúng ngay lần đầu → tính vào chỉ số phản xạ
    await t.checkAnswer({ itemId: item.id, text: item.answers[0], mode: 'speak', attempt: 1, latencyMs: 2500 });
    const rec = ALL_ITEMS.find((i) => i.kind === 'ccq')!;
    t.recordRecognition({ itemId: rec.id, correct: true, latencyMs: 1500 });

    const ov = t.overview();
    const fs = ov.forms.find((f) => f.form === item.form)!;
    assert.equal(fs.speakMs, 2500);
    assert.equal(fs.use, 33); // 3 lượt dùng: sai (gõ), sai (sửa câu), đúng (nói)
    assert.equal(ov.today.done, 4);

    // Kế hoạch hôm nay có bước "Trộn thì"
    const plan = todayPlan();
    const step = plan.steps.find((s) => s.key === 'tenses');
    assert.ok(step);
    assert.equal(step.value, 4);

    // Lượt luyện trộn: đủ số câu, xen kẽ nhiều thì
    const s = t.createSession({ mode: 'mixed', count: 12, speak: '1' });
    assert.equal(s.items.length, 12);
    assert.ok(new Set(s.items.map((i) => i.form)).size >= 3);
    assert.ok(s.items.some((i) => i.task === 'fix' && i.wrongSentence));

    // Viết đoạn: soát thì + đối chiếu thì mục tiêu
    const w = t.submitWriting({ promptId: 'mx-w-year', text: 'This year I have finished my course. In May I went to Da Nang. I go there again yesterday.' });
    assert.ok(w.analysis.issueCount >= 1);
    assert.equal(w.targets.find((x) => x.form === 'present-perfect')?.used, true);
  });
});
