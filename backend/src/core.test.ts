import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fsrs, createEmptyCard, Rating } from 'ts-fsrs';
import { inflectionRegex, lemmaCandidates, levelFromFrequency, termKey } from './lib/text.ts';
import { cleanIpa, composePhraseIpa, derivedIpa, phraseParts, spellingVariants } from './lib/ipa.ts';
import { formatInterval } from './lib/time.ts';
import { inflectIpa, parseWiktionaryIpa } from './lib/wiktionary.ts';
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

test('bài test vốn từ: hiệu chỉnh đoán mò và quy ra trình độ', async () => {
  const { scoreAnswers } = await import('./services/placement.service.ts');
  type Key = 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'pseudo';
  const answers = (known: Partial<Record<Key, number>>, pseudoYes = 0): { band: Key; known: boolean }[] => [
    ...(['b1', 'b2', 'b3', 'b4', 'b5'] as const).flatMap((band) => Array.from({ length: 8 }, (_, i) => ({ band, known: i < (known[band] ?? 0) }))),
    ...Array.from({ length: 12 }, (_, i) => ({ band: 'pseudo' as const, known: i < pseudoYes })),
  ];
  assert.equal(scoreAnswers(answers({ b1: 8, b2: 8, b3: 8, b4: 8, b5: 8 })).level, 'C1');
  assert.equal(scoreAnswers(answers({ b1: 8, b2: 7, b3: 3 })).level, 'B1');
  assert.equal(scoreAnswers(answers({ b1: 8, b2: 4 })).level, 'A2');
  // Chọn "Biết" cho mọi thứ (kể cả từ giả) → điểm hiệu chỉnh về 0, có cảnh báo
  const guesser = scoreAnswers(answers({ b1: 8, b2: 8, b3: 8, b4: 8, b5: 8 }, 12));
  assert.equal(guesser.level, 'A2');
  assert.equal(guesser.size, 0);
  assert.ok(guesser.warning);
  // 3/12 từ giả → hiệu chỉnh: (7/8 − 0,25) / 0,75 ≈ 0,83
  const r = scoreAnswers(answers({ b1: 7 }, 3));
  assert.equal(r.bands[0].corrected, 0.83);
});

test('từ giả của bài test không trùng từ có thật', async () => {
  const { PSEUDOWORDS } = await import('./data/pseudowords.ts');
  const { hasWord } = await import('./lib/wordnet.ts');
  const { ngslRank } = await import('./lib/ngsl.ts');
  assert.ok(PSEUDOWORDS.length >= 30);
  for (const w of PSEUDOWORDS) assert.ok(!hasWord(w) && ngslRank(w) === null, w);
});

test('nhận ra khi Hy-MT dịch cả câu ngữ cảnh thay vì từ cần dịch', async () => {
  const { looksLikeSentenceTranslation } = await import('./services/translate/index.ts');
  assert.equal(looksLikeSentenceTranslation('Chúng tôi ngồi trên bờ sông và ngắm nhìn những chiếc thuyền.', 'bank'), true);
  assert.equal(looksLikeSentenceTranslation('Xuất bản nó thành nhiều phần nhỏ như vậy.', 'spread it out'), true);
  assert.equal(looksLikeSentenceTranslation('kinh doanh', 'runs'), false);
  assert.equal(looksLikeSentenceTranslation('hòa nhã', 'civil'), false);
  assert.equal(looksLikeSentenceTranslation('đưa ra quyết định nhanh chóng', 'make a quick decision'), false);
  // Dịch cả câu thì kết quả dài là đúng
  assert.equal(looksLikeSentenceTranslation('Luyện tập dẫn đến sự hoàn hảo.', 'Practice makes perfect.'), false);
});

test('đăng ký thông báo đẩy: chỉ nhận endpoint HTTPS công khai', async () => {
  const { isPublicPushEndpoint } = await import('./services/push.service.ts');
  for (const ok of [
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://wns2-sg2p.notify.windows.com/w/?token=abc',
    'https://web.push.apple.com/QGuQ',
  ]) {
    assert.equal(isPublicPushEndpoint(ok), true, ok);
  }
  for (const bad of [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://localhost/x',
    'https://127.0.0.1:8080/x',
    'https://0x7f.1/x',
    'https://[::1]/x',
    'https://10.0.0.5/admin',
    'https://hymt.internal/v1',
    'https://user:pass@fcm.googleapis.com/x',
    'not a url',
  ]) {
    assert.equal(isPublicPushEndpoint(bad), false, bad);
  }
});

test('bài test vốn từ: mọi từ trong đề đều được xếp đúng nhóm khi chấm', async () => {
  const { createTest, submitResult } = await import('./services/placement.service.ts');
  const { runWithUser } = await import('./lib/context.ts');
  const t = createTest();
  // DB test không có bộ từ chủ đề → chỉ có 3 nhóm NGSL (8 từ mỗi nhóm) + từ giả
  assert.equal(t.items.length, 3 * t.perBand + t.pseudo);
  const r = runWithUser(1, () => submitResult({ answers: t.items.map((word) => ({ word, known: true })), apply: false }));
  for (const b of r.bands.slice(0, 3)) assert.equal(b.total, t.perBand, b.key);
  assert.equal(r.falseAlarm, 1);
});

test('phân quyền: tài khoản đầu tiên là admin, không bỏ được admin cuối cùng, user không sửa được cấu hình mô hình AI', async () => {
  const { register, setUserRole, listUsers } = await import('./services/auth.service.ts');
  const { updateSettings } = await import('./services/settings.service.ts');
  const { getServerSettings, publicServerSettings, updateServerSettings } = await import('./services/server-settings.service.ts');
  const { runWithUser } = await import('./lib/context.ts');

  const admin = await register({ name: 'Quản trị', email: `admin-${Date.now()}@example.com`, password: 'mat-khau-123' });
  const user = await register({ name: 'Học viên', email: `user-${Date.now()}@example.com`, password: 'mat-khau-123' });
  assert.equal(admin.user.role, 'admin');
  assert.equal(user.user.role, 'user');

  // Không bỏ được quyền của admin duy nhất; cấp quyền cho người khác rồi mới bỏ được
  assert.throws(() => setUserRole(admin.user.id, { role: 'user' }), /ít nhất một quản trị viên/);
  assert.equal(setUserRole(user.user.id, { role: 'admin' }).role, 'admin');
  assert.equal(setUserRole(admin.user.id, { role: 'user' }).role, 'user');
  assert.equal(listUsers().filter((u) => u.role === 'admin').length, 1);

  // Cài đặt cá nhân bỏ qua khoá cấu hình mô hình AI (chỉ admin đổi ở trang Quản trị)
  const before = getServerSettings().hymtBaseUrl;
  runWithUser(admin.user.id, () => {
    const s = updateSettings({ dailyGoalXp: 60, hymtBaseUrl: 'http://10.0.0.5:8080/v1' } as never);
    assert.equal(s.dailyGoalXp, 60);
    assert.equal('hymtBaseUrl' in s, false);
  });
  assert.equal(getServerSettings().hymtBaseUrl, before);

  // Khoá API bị che khi trả về; gửi lại bản đã che thì giữ khoá cũ
  updateServerSettings({ hymtBaseUrl: 'https://mt.example.com/v1', hymtModel: 'hy-mt', hymtApiKey: 'sk-bi-mat-1234' });
  assert.equal(publicServerSettings().hymtApiKey, '••••1234');
  updateServerSettings({ hymtApiKey: '••••1234', hymtModel: 'hy-mt-2' });
  assert.equal(getServerSettings().hymtApiKey, 'sk-bi-mat-1234');
  assert.equal(getServerSettings().hymtModel, 'hy-mt-2');
});

test('đọc IPA Anh-Anh / Anh-Mỹ từ mã nguồn Wiktionary', () => {
  const page = (...lines: string[]) => lines.join(String.fromCharCode(10));
  const marketing = page('==English==', '===Pronunciation===', '* {{IPA|en|/ˈmɑːkɪtɪŋ/|a=UK}}', '* {{IPA|en|/ˈmɑɹkɪtɪŋ/|a=US}}', '==French==', '* {{IPA|fr|/maʁ.ke.tiŋ/}}');
  assert.deepEqual(parseWiktionaryIpa(marketing), { uk: '/ˈmɑːkɪtɪŋ/', us: '/ˈmɑɹkɪtɪŋ/', formOf: undefined });
  // Không ghi giọng → dùng chung; bỏ phiên âm hẹp […]
  const burnout = page('{{also|burn-out}}', '==English==', '* {{IPA|en|[ˈbɜːnaʊt]|/ˈbɜː(ɹ)naʊt/}}');
  assert.equal(parseWiktionaryIpa(burnout)?.uk, '/ˈbɜː(ɹ)naʊt/');
  // Giọng ghi kiểu cũ {{a|…}}, nhiều giọng trong một dòng
  const project = page('==English==', '* {{a|RP}} {{IPA|en|/ˈpɹɒd͡ʒ.ɛkt/}}', '* {{IPA|en|/ˈpɹɑˌd͡ʒɛkt/|a=GA,Canada}}');
  assert.deepEqual(parseWiktionaryIpa(project), { uk: '/ˈpɹɒd͡ʒ.ɛkt/', us: '/ˈpɹɑˌd͡ʒɛkt/', formOf: undefined });
  // Danh từ / động từ đọc khác nhau: giọng ghi ở mẫu enPR bên cạnh; danh từ ưu tiên nhấn âm đầu
  const transport = page(
    '==English==',
    '===Etymology===',
    '===Pronunciation===',
    '* {{enPR|trănspôrtʹ|a=RP}}, {{IPA|en|/tɹænsˈpɔːt/}}',
    '* {{enPR|trănspôrtʹ|a=GenAm}}, {{IPA|en|/tɹænsˈpɔɹt/}}',
    '* {{enPR|trănsʹpôrt|a=RP}}, {{IPA|en|/ˈtɹæns.pɔːt/}}',
    '* {{enPR|trănsʹpôrt|a=GenAm}}, {{IPA|en|/ˈtɹæns.pɔɹt/}}',
    '===Verb===',
    '===Noun===',
  );
  assert.deepEqual(parseWiktionaryIpa(transport, 'noun'), { uk: '/ˈtɹæns.pɔːt/', us: '/ˈtɹæns.pɔɹt/', formOf: undefined });
  assert.equal(parseWiktionaryIpa(transport, 'verb')?.uk, '/tɹænsˈpɔːt/');
  // Mỗi mục từ nguyên có cách đọc riêng → chọn mục đúng từ loại
  const graduate = page(
    '==English==',
    '===Etymology 1===',
    '====Pronunciation====',
    '* {{IPA|en|/ˈɡɹæd͡ʒuət/}}',
    '====Noun====',
    '===Etymology 2===',
    '====Pronunciation====',
    '* {{IPA|en|/ˈɡɹædjueɪt/|a=UK}}',
    '====Verb====',
  );
  assert.equal(parseWiktionaryIpa(graduate, 'noun')?.uk, '/ˈɡɹæd͡ʒuət/');
  assert.equal(parseWiktionaryIpa(graduate, 'verb')?.uk, '/ˈɡɹædjueɪt/');
  // Trang chỉ là dạng biến đổi của từ gốc
  assert.deepEqual(parseWiktionaryIpa(page('==English==', '# {{plural of|en|accessory}}'))?.formOf, { kind: 'plural', base: 'accessory' });
  assert.deepEqual(parseWiktionaryIpa(page('==English==', '# {{alternative spelling of|en|urbanization}}'))?.formOf, { kind: 'spelling', base: 'urbanization' });
  assert.equal(parseWiktionaryIpa(page('==French==', '* {{IPA|fr|/kuʁ/}}')), null);
});

test('IPA dạng biến đổi: số nhiều, quá khứ', () => {
  assert.equal(inflectIpa('/əkˈsɛsəɹi/', 'plural'), '/əkˈsɛsəɹiz/');
  assert.equal(inflectIpa('/ˈpɹɒdʒɛkt/', 'plural'), '/ˈpɹɒdʒɛkts/');
  assert.equal(inflectIpa('/bʌs/', 'plural'), '/ˈbʌsɪz/');
  assert.equal(inflectIpa('/kənˈsjuːm/', 'past'), '/kənˈsjuːmd/');
  assert.equal(inflectIpa('/ˈwɒnt/', 'past'), '/ˈwɒntɪd/');
  assert.equal(inflectIpa('/wɜːk/', 'past'), '/wɜːkt/');
});

test('ghép IPA cho cụm từ', async () => {
  const dict: Record<string, string> = { global: '/ˈɡləʊbəl/', warming: '/ˈwɔːmɪŋ/', value: '/ˈvæljuː/', money: '/ˈmʌni/', close: '/kləʊs/', knit: '/nɪt/' };
  const ipaOf = async (w: string) => (dict[w] ? { uk: dict[w], us: dict[w] } : null);
  assert.deepEqual(phraseParts('Close-knit'), ['close', 'knit']);
  assert.equal((await composePhraseIpa('global warming', ipaOf))?.uk, '/ˈɡləʊbəl ˈwɔːmɪŋ/');
  assert.equal((await composePhraseIpa('close-knit', ipaOf))?.uk, '/kləʊs nɪt/');
  // Hư từ trong cụm đọc lướt
  assert.equal((await composePhraseIpa('value for money', ipaOf))?.us, '/ˈvæljuː fɚ ˈmʌni/');
  // Thiếu một chữ → không đoán bừa
  assert.equal(await composePhraseIpa('global economy', ipaOf), null);
  assert.equal(await composePhraseIpa('global', ipaOf), null);
});

test('suy IPA theo cấu tạo từ khi từ điển không có', async () => {
  const dict: Record<string, string> = {
    graduate: '/ˈɡɹæd͡ʒuət/',
    sponsor: '/ˈspɒnsə/',
    dense: '/dɛns/',
    work: '/wɜːk/',
    load: '/ləʊd/',
    urbanize: '/ˈɜːbənaɪz/',
    instruction: '/ɪnˈstɹʌkʃən/',
    thermal: '/ˈθɜːməl/',
    domesticate: '/dəˈmɛstɪkeɪt/',
    priced: '/pɹaɪst/',
    spoilt: '/spɔɪlt/',
    conservation: '/ˌkɒnsəˈveɪʃən/',
  };
  const ipaOf = async (w: string) => (dict[w] ? { uk: dict[w], us: dict[w] } : null);
  const isWord = (w: string) => w in dict;
  const uk = async (w: string) => (await derivedIpa(w, ipaOf, isWord))?.uk;
  assert.equal(await uk('undergraduate'), '/ˌʌndəˈɡɹæd͡ʒuət/');
  assert.equal(await uk('geothermal'), '/ˌdʒiːəʊˈθɜːməl/');
  assert.equal(await uk('sponsorship'), '/ˈspɒnsəʃɪp/');
  assert.equal(await uk('densely'), '/ˈdɛnsli/');
  assert.equal(await uk('workload'), '/ˈwɜːkˌləʊd/');
  assert.equal(await uk('urbanization'), '/ˌɜːbənaɪˈzeɪʃən/');
  assert.equal(await uk('instructional'), '/ɪnˈstɹʌkʃənəl/');
  assert.equal(await uk('domestication'), '/dəˌmɛstɪˈkeɪʃən/');
  assert.equal(await uk('overpriced'), '/ˌəʊvəˈpɹaɪst/');
  assert.equal(await uk('unspoilt'), '/ʌnˈspɔɪlt/');
  assert.equal(await uk('conservationist'), '/ˌkɒnsəˈveɪʃənɪst/');
  assert.equal(await uk('xyzabc'), undefined);
  // Mẫu "infl of" của Wiktionary
  const poaching = ['==English==', '# {{infl of|en|poach||ing-form}}'].join(String.fromCharCode(10));
  assert.deepEqual(parseWiktionaryIpa(poaching)?.formOf, { kind: 'ing', base: 'poach' });
  assert.equal(inflectIpa('/pəʊtʃ/', 'ing'), '/ˈpəʊtʃɪŋ/');
  assert.equal(inflectIpa('/kənˈsjuːm/', 'ing'), '/kənˈsjuːmɪŋ/');
});

test('chuẩn hoá cách viết IPA', () => {
  assert.equal(cleanIpa('/ˌæn θrə pəˈdʒɛn ɪk/', 'anthropogenic'), '/ˌænθrəpəˈdʒɛnɪk/');
  assert.equal(cleanIpa('/dəˌmɛ.stɪ.ˈkeɪʃən/', 'domestication'), '/dəˌmɛ.stɪˈkeɪʃən/');
  // Cụm từ giữ khoảng trắng giữa các chữ
  assert.equal(cleanIpa('/ˈɡləʊbəl ˈwɔːmɪŋ/', 'global warming'), '/ˈɡləʊbəl ˈwɔːmɪŋ/');
});

test('cách viết Anh ↔ Mỹ', () => {
  assert.ok(spellingVariants('colonise').includes('colonize'));
  assert.ok(spellingVariants('behavioural').includes('behavioral'));
  assert.ok(spellingVariants('theatre').includes('theater'));
  assert.ok(spellingVariants('urbanisation').includes('urbanization'));
});

test('bộ từ: "Bộ từ của tôi" chỉ chủ thấy; bộ chung chỉ admin sửa; nạp lại dữ liệu giữ từ admin thêm', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { register, setUserRole } = await import('./services/auth.service.ts');
  const { runWithUser } = await import('./lib/context.ts');
  const { all, run } = await import('./db/index.ts');
  const { seedTopics } = await import('./db/seed.ts');
  const t = await import('./services/topics.service.ts');
  const { normalizeTerm } = await import('./services/lexicon.service.ts');

  // Chuẩn hoá từ người dùng gõ/dán
  assert.equal(normalizeTerm('  Global   Warming '), 'global warming');
  assert.equal(normalizeTerm('“Break the ice”'), 'break the ice');
  assert.equal(normalizeTerm('abc123'), null);
  assert.equal(normalizeTerm('one two three four five six'), null);

  // Dữ liệu crawl tối giản: 1 chủ đề, 2 từ
  const lex = (word: string) => ({ word, meaningVi: word, meaningsVi: [], definitions: [], examples: [], synonyms: [], antonyms: [], collocations: [] });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ielts-seed-')), 'topics.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      generatedAt: '',
      sources: ['test'],
      topics: [{ slug: 'edu-test', name: 'Edu', nameVi: 'Giáo dục', description: '', icon: '🎓', color: 'teal', category: 'society', order: 0,
        words: [{ word: 'curriculum', group: 'core', rank: 0 }, { word: 'campus', group: 'related', rank: 1 }] }],
      lexicon: [lex('curriculum'), lex('campus')],
    }),
  );
  seedTopics(file);
  // Mục từ có sẵn trong kho → thêm vào bộ không cần gọi mạng
  for (const w of ['mitigate', 'serendipity']) {
    run("INSERT OR IGNORE INTO lexicon (word, meaning_vi, examples) VALUES (?, ?, '[]')", w, `nghĩa của ${w}`);
  }

  const stamp = Date.now();
  const a = (await register({ name: 'A', email: `a-${stamp}@example.com`, password: 'mat-khau-123' })).user;
  const b = (await register({ name: 'B', email: `b-${stamp}@example.com`, password: 'mat-khau-123' })).user;
  const admin = (await register({ name: 'Admin', email: `ad-${stamp}@example.com`, password: 'mat-khau-123' })).user;
  setUserRole(admin.id, { role: 'admin' });

  // A tạo bộ riêng, thêm từ
  const mine = await runWithUser(a.id, async () => {
    const topic = t.createTopic({ name: 'Writing Task 2' });
    assert.equal(topic.mine, true);
    assert.equal(topic.editable, true);
    const r1 = await t.addTopicEntry(topic.slug, 'Serendipity', {});
    assert.equal(r1.word.word, 'serendipity');
    assert.equal(r1.word.addedBy, 'user');
    assert.equal((await t.addTopicEntry(topic.slug, 'serendipity', {})).alreadyInTopic, true);
    assert.equal(t.getTopic(topic.slug).words.length, 1);
    return topic;
  });

  // B không thấy, không sửa được, không luyện được bộ của A; không tạo được bộ chung
  runWithUser(b.id, () => {
    assert.equal(t.listTopics().some((x) => x.slug === mine.slug), false);
    assert.throws(() => t.getTopic(mine.slug), /Không tìm thấy/);
    assert.throws(() => t.assertTopicVisible(mine.id), /Không tìm thấy/);
    assert.throws(() => t.deleteTopic(mine.slug), /Không tìm thấy/);
    assert.throws(() => t.createTopic({ name: 'X', shared: true }, false), /quản trị viên/);
    assert.throws(() => t.updateTopic('edu-test', { name: 'Hack' }, false), /quản trị viên/);
    assert.equal(t.getTopic('edu-test').topic.editable, false);
  });
  // Từ trong bộ riêng không lọt vào kho từ dùng chung (đáp án nhiễu, bài test trình độ)
  const shared = all<{ word: string }>(`SELECT word FROM lexicon WHERE id IN (${t.SHARED_LEXICON_SQL})`).map((r) => r.word);
  assert.ok(shared.includes('curriculum') && !shared.includes('serendipity'));

  // Admin thêm từ vào bộ chung; không bỏ được từ của dữ liệu crawl
  await runWithUser(admin.id, async () => {
    const r = await t.addTopicEntry('edu-test', 'mitigate', { group: 'advanced' }, true);
    assert.equal(r.word.group, 'advanced');
    assert.equal(r.word.addedBy, 'admin');
    const curriculum = t.getTopic('edu-test', true).words.find((w) => w.word === 'curriculum')!;
    assert.throws(() => t.removeTopicEntry('edu-test', curriculum.id, true), /có sẵn/);
    assert.throws(() => t.deleteTopic('edu-test', true), /có sẵn/);
  });
  // Nạp lại dữ liệu crawl (file đổi) vẫn giữ từ admin đã thêm
  seedTopics(file);
  runWithUser(admin.id, () => {
    const words = t.getTopic('edu-test', true).words.map((w) => w.word);
    assert.deepEqual(words.sort(), ['campus', 'curriculum', 'mitigate']);
  });

  // A bỏ từ rồi xoá bộ: mục từ không còn ai dùng được dọn khỏi kho
  runWithUser(a.id, () => {
    const id = t.getTopic(mine.slug).words[0].id;
    t.removeTopicEntry(mine.slug, id);
    assert.equal(t.getTopic(mine.slug).words.length, 0);
    t.deleteTopic(mine.slug);
    assert.equal(t.listTopics().some((x) => x.slug === mine.slug), false);
  });
  assert.equal(all("SELECT 1 FROM lexicon WHERE word = 'serendipity'").length, 0);
});

test('dữ liệu soạn tay của bộ từ: câu ví dụ chứa đúng từ, nghĩa không trùng từ nâng cao, mỗi chủ đề 12 từ nâng cao', async () => {
  const { EXAMPLES, MEANING_VI, DEFINITIONS } = await import('./crawler/curated.ts');
  const { ADVANCED, TOPICS } = await import('./crawler/topics.config.ts');
  for (const [w, [en, vi]] of Object.entries(EXAMPLES)) {
    assert.ok(inflectionRegex(w).test(en), `câu ví dụ của "${w}" không chứa từ này`);
    assert.ok(vi.trim().length > 0, `câu ví dụ của "${w}" thiếu bản dịch`);
  }
  const advanced = new Set(Object.values(ADVANCED).flat().map(([w]) => w));
  assert.deepEqual(Object.keys(MEANING_VI).filter((w) => advanced.has(w)), []);
  for (const t of TOPICS) assert.equal(ADVANCED[t.slug]?.length, 12, `chủ đề ${t.slug}`);
  assert.ok(Object.values(DEFINITIONS).every((d) => d.length > 5));
});
