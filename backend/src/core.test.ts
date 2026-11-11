import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fsrs, createEmptyCard, Rating } from 'ts-fsrs';
import { inflectionRegex, lemmaCandidates, levelFromFrequency, termKey } from './lib/text.ts';
import { formatInterval } from './lib/time.ts';
import { buildPrompt } from './services/translate/hymt.ts';
import { parseSubtitleFile, segmentSentences, type TWord } from './services/transcript.service.ts';

const words = (text: string, start = 0, step = 0.3): TWord[] =>
  text.split(' ').map((w, i) => ({ w, s: start + i * step, e: start + i * step + step * 0.9 }));

test('tách câu theo dấu câu (phụ đề chuẩn)', () => {
  const s = segmentSentences(words('So in college, I was a government major. Now, when a normal student writes a paper, they spread it out.'));
  assert.equal(s.length, 2);
  assert.equal(s[0].text, 'So in college, I was a government major.');
  assert.ok(s[1].start > s[0].end - 0.01);
});

test('tách câu theo khoảng lặng (phụ đề tự động không dấu câu)', () => {
  const a = words('so in college i was a government major', 0);
  const b = words('which means i had to write a lot of papers', 4);
  const s = segmentSentences([...a, ...b]);
  assert.equal(s.length, 2);
  assert.equal(s[0].text, 'So in college i was a government major');
});

test('gộp câu quá ngắn vào câu sau', () => {
  const s = segmentSentences(words('Okay. So today we will talk about climate change.'));
  assert.equal(s.length, 1);
});

test('đọc file SRT', () => {
  const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello <i>world</i>.\n\n2\n00:00:04,000 --> 00:00:06,000\n[Music] How are you?\n';
  const s = segmentSentences(parseSubtitleFile(srt));
  assert.deepEqual(
    s.map((x) => x.text),
    ['Hello world.', 'How are you?'],
  );
  assert.equal(s[0].start, 1);
});

test('regex biến thể từ / cụm từ', () => {
  assert.equal('He dropped out of school.'.match(inflectionRegex('drop out'))?.[0], 'dropped out');
  assert.equal('She studies hard.'.match(inflectionRegex('study'))?.[0], 'studies');
  assert.equal('We are using less.'.match(inflectionRegex('use'))?.[0], 'using');
  assert.equal('The category is wrong.'.match(inflectionRegex('cat')), null);
});

test('khoá từ & dạng gốc', () => {
  assert.equal(termKey('  “Resilient,” '), 'resilient');
  assert.ok(lemmaCandidates('studies').includes('study'));
  assert.ok(lemmaCandidates('dropped').includes('drop'));
});

test('ước lượng cấp độ theo tần suất', () => {
  assert.equal(levelFromFrequency(800), 'A1');
  assert.equal(levelFromFrequency(19), 'B2');
  assert.equal(levelFromFrequency(2), 'C1');
  assert.equal(levelFromFrequency(null, true), 'B2');
});

test('prompt Hy-MT đúng template', () => {
  assert.equal(
    buildPrompt('Hello', 'vi', 'hymt15'),
    'Translate the following segment into Vietnamese, without additional explanation.\n\nHello',
  );
  const ctx = buildPrompt('major', 'vi', 'hymt2', 'I was a government major.');
  assert.ok(ctx.startsWith('[Background Information]\nI was a government major.'));
  assert.ok(ctx.endsWith('[Source Text]\nmajor'));
  assert.ok(buildPrompt('major', 'vi', 'hymt15', 'ctx').includes('越南语'));
});

test('FSRS: Quên < Khó < Nhớ < Dễ', () => {
  const f = fsrs();
  const now = new Date();
  const p = f.repeat(createEmptyCard(now), now);
  const due = ([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const).map((r) => p[r].card.due.getTime());
  assert.ok(due[0] <= due[1] && due[1] <= due[2] && due[2] < due[3]);
});

test('nhãn khoảng thời gian tiếng Việt', () => {
  assert.equal(formatInterval(10 * 60_000), '10 phút');
  assert.equal(formatInterval(3 * 86400_000), '3 ngày');
  assert.equal(formatInterval(75 * 86400_000), '2,5 tháng');
});

test('băm & kiểm tra mật khẩu (scrypt)', async () => {
  const { hashPassword, verifyPassword } = await import('./services/auth.service.ts');
  const h = await hashPassword('mật-khẩu-123');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.notEqual(h, await hashPassword('mật-khẩu-123')); // salt ngẫu nhiên
  assert.equal(await verifyPassword('mật-khẩu-123', h), true);
  assert.equal(await verifyPassword('sai-mat-khau', h), false);
  assert.equal(await verifyPassword('x', 'hỏng'), false);
});

test('đọc / ghi cookie', async () => {
  const { parseCookies, serializeCookie } = await import('./lib/cookies.ts');
  assert.deepEqual(parseCookies('a=1; ielts_sid=abc%2Bdef; b=2'), { a: '1', ielts_sid: 'abc+def', b: '2' });
  const c = serializeCookie('ielts_sid', 'tok', { maxAge: 60, secure: true });
  assert.match(c, /^ielts_sid=tok; Path=\/; Max-Age=60; Expires=.+; HttpOnly; Secure; SameSite=Lax$/);
  assert.doesNotMatch(serializeCookie('s', 'v'), /Max-Age/); // cookie phiên
});

test('đếm từ đệm khi nói (4/3/2)', async () => {
  const { countFillers, roundMetrics } = await import('./lib/fluency.ts');
  const r = countFillers('Um, I mean it was kind of hard, you know. It is a kind of fruit. I was like wow, actually great. You know what?');
  assert.equal(r.byType['um/uh'], 1);
  assert.equal(r.byType['I mean'], 1);
  assert.equal(r.byType['kind of / sort of'], 1); // "a kind of fruit" không tính
  assert.equal(r.byType['you know'], 1); // "You know what?" không tính
  assert.equal(r.byType['like (quotative)'], 1);
  assert.equal(r.byType.actually, 1);
  const m = roundMetrics({ durationSec: 120, speechSec: 100, wordCount: 240, pauseCount: 9, longPauses: 4, pauseSec: 20 });
  assert.equal(m.wpm, 120);
  assert.equal(m.meanRun, 24);
  assert.equal(m.longPausesPerMin, 2);
});

test('độ phủ từ vựng của video', async () => {
  const { tokenizeForCoverage, computeCoverage } = await import('./lib/coverage.ts');
  assert.deepEqual(tokenizeForCoverage("Um, I don't think we can't — it's 2024!"), ['i', 'do', 'think', 'we', 'can', 'it']);
  const words = [
    { w: 'the', n: 90, f: 50000, s: 0 },
    { w: 'decided', n: 5, f: 60, s: 1 }, // B1
    { w: 'ubiquitous', n: 3, f: 2, s: 2 }, // C1
    { w: 'mitigate', n: 2, f: 3, s: 3 },
  ];
  const base = computeCoverage({ words, vocabLevel: 'B1', notebook: new Map() });
  assert.equal(base.totalTokens, 100);
  assert.equal(base.knownTokens, 95);
  assert.equal(base.label, 'fit');
  assert.deepEqual(base.topNew.map((w) => w.w), ['ubiquitous', 'mitigate']);
  // Từ đã thuộc trong sổ được tính là biết; từ mới thêm vào sổ là "đang học"
  const nb = computeCoverage({ words, vocabLevel: 'B1', notebook: new Map([['ubiquitous', 'mastered' as const], ['mitigate', 'new' as const]]) });
  assert.equal(nb.knownTokens, 98);
  assert.equal(nb.learningWords, 1);
  assert.equal(nb.label, 'easy');
});

test('họ từ và từ đồng nghĩa từ WordNet (offline)', async () => {
  const { wordFamily, baseForms, senses } = await import('./lib/wordnet.ts');
  const fam = wordFamily('decide').map((m) => `${m.word}:${m.pos}`);
  for (const w of ['decide:v', 'decision:n', 'decisive:a', 'decisively:r', 'indecisive:a']) assert.ok(fam.includes(w), w);
  assert.ok(!fam.some((w) => w.startsWith('deciding')), 'bỏ phân từ');
  assert.ok(baseForms('studies').some((b) => b.lemma === 'study' && b.pos === 'v'));
  assert.ok(senses('purchase').some((s) => s.synonyms.includes('buy')));
});

test('kiểm tra cụm đích trong câu nói', async () => {
  const { findTarget } = await import('./services/speaking.service.ts');
  assert.equal(findTarget('make a decision', 'so I finally made a decision'), 'made a decision'); // động từ bất quy tắc
  assert.equal(findTarget('took a photo', 'can you take a photo'), 'take a photo');
  assert.equal(findTarget('take responsibility', 'she takes responsibility for it'), 'takes responsibility');
  assert.equal(findTarget('raise awareness', 'we need to raise awareness'), 'raise awareness');
  assert.equal(findTarget('', 'anything'), null);
});

test('dữ liệu soạn tay: collocation và nâng cấp từ hợp lệ', async () => {
  const { COLLOCATIONS } = await import('./data/collocations.ts');
  const { UPGRADES } = await import('./data/upgrades.ts');
  for (const c of COLLOCATIONS) {
    assert.match(c.example, /\{[^}]+\}/, c.example);
    assert.ok(!c.wrong.includes(c.answer) && !(c.also ?? []).some((a) => c.wrong.includes(a)), `${c.answer} ${c.partner}`);
  }
  for (const u of UPGRADES) {
    for (const s of u.sentences) {
      assert.match(s.text, /\[\[[^\]]+\]\]/, s.text);
      for (const f of s.fits) assert.ok(u.upgrades.some((x) => x.word === f), `${u.basic}: ${f}`);
    }
  }
});

test('chọn thẻ khởi động: ưu tiên + ngân sách thời gian', async () => {
  const { selectWarmup } = await import('./lib/warmup.ts');
  const c = (key: string, kind: 'word' | 'phrase', reason: 'slept' | 'overdue' | 'due_today', r: number, dueMs = 0) => ({ key, kind, reason, retrievability: r, dueMs });
  const picked = selectWarmup([
    c('w1', 'word', 'due_today', 0.95, 300),
    c('w2', 'word', 'overdue', 0.7),
    c('w3', 'word', 'overdue', 0.5),
    c('p1', 'phrase', 'slept', 0.9),
    c('w4', 'word', 'due_today', 0.93, 100),
  ]);
  // Từ học tối qua trước, rồi quá hạn (nhớ kém nhất trước), rồi đến hạn hôm nay (sớm trước)
  assert.deepEqual(picked.map((x) => x.key), ['p1', 'w3', 'w2', 'w4', 'w1']);
  // Ngân sách 90 giây: tối đa 11 thẻ từ (8s) nhưng giới hạn 10; thẻ mẫu câu 15s → 6 thẻ
  const many = (kind: 'word' | 'phrase') => Array.from({ length: 20 }, (_, i) => c(`${kind}${i}`, kind, 'overdue', i / 20));
  assert.equal(selectWarmup(many('word')).length, 10);
  assert.equal(selectWarmup(many('phrase')).length, 6);
  assert.equal(selectWarmup([]).length, 0);
});
