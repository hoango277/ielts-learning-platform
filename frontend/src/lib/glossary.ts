/**
 * Giải thích các thuật ngữ khó trong app bằng tiếng Việt dễ hiểu.
 * Dùng cho thẻ giải thích (component Term) và trang /glossary.
 */
export type GlossaryCategory = 'memory' | 'listening' | 'vocab' | 'grammar' | 'speaking' | 'level' | 'tech';

export interface GlossaryEntry {
  key: string;
  term: string;
  category: GlossaryCategory;
  /** Một câu ngắn hiện ngay trong thẻ giải thích */
  short: string;
  /** Giải thích đầy đủ hơn */
  long?: string;
  example?: string;
}

export const CATEGORY_LABEL: Record<GlossaryCategory, { label: string; emoji: string }> = {
  memory: { label: 'Ghi nhớ & ôn tập', emoji: '🧠' },
  listening: { label: 'Nghe & phát âm', emoji: '🎧' },
  vocab: { label: 'Từ vựng & cách dùng từ', emoji: '📚' },
  grammar: { label: 'Ngữ pháp & thì', emoji: '⏳' },
  speaking: { label: 'Luyện nói', emoji: '🎙️' },
  level: { label: 'Trình độ & độ khó', emoji: '📊' },
  tech: { label: 'Cài đặt & kỹ thuật', emoji: '⚙️' },
};

const entries: GlossaryEntry[] = [
  // ---------- Ghi nhớ & ôn tập ----------
  {
    key: 'srs',
    term: 'Lặp lại ngắt quãng (SRS)',
    category: 'memory',
    short: 'Ôn lại một từ với khoảng cách tăng dần, đúng lúc bạn sắp quên nó.',
    long: 'Trí nhớ phai dần theo thời gian (đường cong quên). Nếu ôn đúng lúc sắp quên, lần sau bạn sẽ nhớ lâu hơn: 10 phút → 1 ngày → 3 ngày → 1 tuần → 1 tháng… Nhờ vậy bạn ôn ít lần hơn mà vẫn nhớ chắc.',
    example: 'Từ “decision” hôm nay ôn xong, app hẹn 3 ngày sau mới hỏi lại.',
  },
  {
    key: 'fsrs',
    term: 'FSRS',
    category: 'memory',
    short: 'Thuật toán tính ngày ôn tiếp theo cho từng thẻ, dựa trên việc bạn nhớ nó tốt đến đâu.',
    long: 'FSRS (Free Spaced Repetition Scheduler) là thuật toán lặp lại ngắt quãng thế hệ mới, cũng được Anki sử dụng. Mỗi lần bạn chấm Quên / Khó / Nhớ / Dễ, nó ước lượng độ “bền” trí nhớ của thẻ rồi hẹn lần ôn tiếp theo đúng lúc bạn sắp quên.',
  },
  {
    key: 'ratings',
    term: 'Quên / Khó / Nhớ / Dễ',
    category: 'memory',
    short: 'Bốn mức tự chấm sau khi lật thẻ — hãy chấm thật lòng để lịch ôn chính xác.',
    long: 'Quên: không nhớ ra → ôn lại ngay trong buổi. Khó: nhớ ra nhưng rất vất vả → hẹn sớm. Nhớ: nhớ được bình thường → hẹn theo lịch. Dễ: nhớ ngay lập tức → hẹn xa hơn. Thời gian dưới mỗi nút là lúc thẻ quay lại.',
  },
  {
    key: 'retention',
    term: 'Tỉ lệ nhớ mong muốn',
    category: 'memory',
    short: 'Bạn muốn chắc chắn bao nhiêu % sẽ nhớ được thẻ khi đến hạn ôn (thường 90%).',
    long: 'Đặt cao (95%) thì nhớ chắc hơn nhưng phải ôn dày hơn; đặt thấp (85%) thì ôn ít hơn nhưng dễ quên hơn. 90% là mức cân bằng được khuyên dùng.',
  },
  {
    key: 'retrievability',
    term: 'Còn nhớ ~%',
    category: 'memory',
    short: 'Ước tính khả năng bạn còn nhớ thẻ này ngay lúc này. Càng thấp càng cần ôn gấp.',
    long: 'Con số do FSRS tính từ lịch sử ôn của thẻ. Khi nó tụt xuống dưới tỉ lệ nhớ mong muốn, thẻ “đến hạn” — app sẽ đưa thẻ đó vào phần Ôn tập hoặc hộp Khởi động.',
  },
  {
    key: 'new_cards',
    term: 'Thẻ mới mỗi ngày',
    category: 'memory',
    short: 'Số từ mới được đưa vào ôn mỗi ngày.',
    long: 'Mỗi từ mới sẽ quay lại nhiều lần trong những ngày sau. Học quá nhiều từ mới một ngày sẽ làm số thẻ cần ôn các ngày sau tăng vọt — 10–20 từ/ngày là vừa.',
  },
  {
    key: 'statuses',
    term: 'Trạng thái của từ',
    category: 'memory',
    short: 'Mới → Đang học → Đang ôn → Thành thạo; hoặc Đã thuộc nếu bạn tự đánh dấu.',
    long: 'Mới: chưa ôn lần nào. Đang học: vừa học, sẽ quay lại sau vài phút. Đang ôn: đã nhớ được vài ngày. Thành thạo: nhớ bền trên 3 tuần. Đã thuộc: bạn tự đánh dấu là biết rồi, app không hỏi lại nữa.',
  },
  {
    key: 'retrieval',
    term: 'Tự nhớ lại (retrieval practice)',
    category: 'memory',
    short: 'Cố tự nhớ ra câu trả lời trước khi xem đáp án — hiệu quả hơn hẳn đọc lại.',
    long: 'Mỗi lần não phải “lục lại” một từ, đường dẫn tới từ đó được củng cố. Vì vậy app luôn che đáp án, bắt bạn nghĩ hoặc nói trước rồi mới cho xem.',
  },
  {
    key: 'warmup',
    term: 'Khởi động',
    category: 'memory',
    short: 'Lượt ôn khoảng 1 phút những thẻ sắp quên, hiện ra khi bạn mở app.',
    long: 'App chọn các thẻ có khả năng nhớ thấp nhất (tối đa ~90 giây). Thẻ chấm “Quên” sẽ được hỏi lại một lần ở cuối lượt.',
  },
  {
    key: 'morning_review',
    term: 'Ôn buổi sáng',
    category: 'memory',
    short: 'Buổi sáng, app ưu tiên cho bạn nhớ lại những từ học tối hôm qua.',
    long: 'Trong lúc ngủ, não củng cố những gì vừa học. Nghiên cứu (Mazza và cộng sự, 2016) cho thấy học tối rồi ôn lại sáng hôm sau giúp nhớ lâu hơn và tốn ít công ôn hơn.',
  },
  {
    key: 'streak',
    term: 'Chuỗi ngày học',
    category: 'memory',
    short: 'Số ngày liên tiếp bạn có học. Bỏ một ngày là chuỗi bắt đầu lại từ đầu.',
  },
  {
    key: 'xp',
    term: 'XP (điểm kinh nghiệm)',
    category: 'memory',
    short: 'Điểm cộng cho mỗi hoạt động học, dùng để tính cấp độ và mục tiêu mỗi ngày.',
    long: 'Ví dụ: ôn một thẻ +2, lưu từ mới +3, nói đuổi một câu +3, một lượt 4/3/2 +8. Đạt mục tiêu XP trong ngày để giữ chuỗi ngày học.',
  },
  {
    key: 'four_strands',
    term: 'Bốn mảng học (Nation)',
    category: 'memory',
    short: 'Một chương trình học tốt nên chia đều thời gian cho 4 mảng.',
    long: 'Theo nhà ngôn ngữ học Paul Nation: (1) nghe/đọc hiểu nội dung, (2) nói/viết để diễn đạt ý, (3) học có chủ đích về từ vựng, phát âm, ngữ pháp, (4) luyện cho trôi chảy với những gì đã biết. Kế hoạch “Hôm nay học gì” có đủ 4 mảng này.',
  },

  // ---------- Nghe & phát âm ----------
  {
    key: 'shadowing',
    term: 'Shadowing (nói đuổi)',
    category: 'listening',
    short: 'Nghe một câu của người bản xứ rồi nhại lại ngay, bắt chước cả nhịp và ngữ điệu.',
    long: 'Như “cái bóng” bám theo người nói. Shadowing luyện phát âm, nối âm, trọng âm và giúp tai quen tốc độ nói thật. App nhận giọng nói của bạn và tô màu từ đúng/sai.',
  },
  {
    key: 'dictation',
    term: 'Chép chính tả (dictation)',
    category: 'listening',
    short: 'Nghe câu và gõ lại từng chữ — rèn nghe chi tiết từng âm.',
    long: 'App so câu bạn gõ với câu gốc: chữ đúng màu xanh, sai màu đỏ, thiếu thì gạch ngang. Rất tốt để phát hiện những âm bạn hay nghe nhầm.',
  },
  {
    key: 'transcript',
    term: 'Phụ đề / transcript',
    category: 'listening',
    short: 'Toàn bộ lời thoại của video, chia theo câu và có mốc thời gian.',
  },
  {
    key: 'bilingual',
    term: 'Song ngữ',
    category: 'listening',
    short: 'Hiện thêm bản dịch tiếng Việt bên dưới phụ đề tiếng Anh.',
  },
  {
    key: 'autopause',
    term: 'Tự dừng',
    category: 'listening',
    short: 'Video tự tạm dừng sau mỗi câu để bạn kịp nhắc lại hoặc ghi chú.',
  },
  {
    key: 'ipa',
    term: 'IPA (phiên âm quốc tế)',
    category: 'listening',
    short: 'Bộ ký hiệu ghi cách phát âm một từ; dấu ˈ đứng trước âm tiết được nhấn.',
    example: 'decision /dɪˈsɪʒ.ən/ — nhấn vào âm “si”.',
  },

  // ---------- Từ vựng & cách dùng từ ----------
  {
    key: 'collocation',
    term: 'Collocation (cụm từ hay đi cùng)',
    category: 'vocab',
    short: 'Những từ người bản xứ hay dùng chung với nhau theo thói quen.',
    long: 'Dịch từng chữ từ tiếng Việt dễ ra cụm nghe “lạ tai”. Học theo collocation giúp nói tự nhiên hơn.',
    example: 'make a decision (không nói do a decision), heavy rain (không nói strong rain).',
  },
  {
    key: 'chunk',
    term: 'Cụm từ (chunk)',
    category: 'vocab',
    short: 'Một nhóm từ được học nguyên khối, như take responsibility, as a result of.',
    long: 'Người bản xứ nói theo cụm có sẵn chứ không ghép từng từ. Nhớ cụm giúp bạn nói nhanh và đúng hơn.',
  },
  {
    key: 'phrase',
    term: 'Mẫu câu',
    category: 'vocab',
    short: 'Câu hay bạn lưu từ video, kèm cụm cần học — khi ôn sẽ nghe lại đúng giọng gốc.',
  },
  {
    key: 'word_family',
    term: 'Họ từ (word family)',
    category: 'vocab',
    short: 'Các dạng khác nhau của cùng một gốc từ.',
    example: 'decide (động từ) → decision (danh từ) → decisive (tính từ) → decisively (trạng từ).',
  },
  {
    key: 'synonym',
    term: 'Từ đồng nghĩa & sắc thái',
    category: 'vocab',
    short: 'Các từ nghĩa gần giống nhau nhưng khác mức độ, văn phong hoặc ngữ cảnh dùng.',
    example: 'big / huge / enormous / substantial — “a substantial increase” hợp văn viết hơn “a big increase”.',
  },
  {
    key: 'register',
    term: 'Văn phong (trang trọng / thân mật)',
    category: 'vocab',
    short: 'Mức độ trang trọng của từ: dùng trong bài viết học thuật hay khi nói chuyện thân mật.',
    example: 'utilise (trang trọng) · use (trung tính) · reckon (thân mật).',
  },
  {
    key: 'cloze',
    term: 'Điền chỗ trống (cloze)',
    category: 'vocab',
    short: 'Câu bị che một từ hoặc cụm, bạn phải tự điền hoặc nói ra phần bị che.',
  },
  {
    key: 'upgrade',
    term: 'Nâng cấp từ',
    category: 'vocab',
    short: 'Thay những từ quá cơ bản (good, big, very…) bằng từ chính xác, giàu sắc thái hơn.',
    example: 'a big problem → a major problem; very important → crucial.',
  },
  {
    key: 'lexicon',
    term: 'Bộ từ chủ đề',
    category: 'vocab',
    short: 'Từ vựng IELTS chia theo 26 chủ đề (giáo dục, môi trường…), có nghĩa, phiên âm và ví dụ.',
  },

  // ---------- Ngữ pháp & thì ----------
  {
    key: 'tense',
    term: 'Thì (tense)',
    category: 'grammar',
    short: 'Cách động từ cho biết việc xảy ra khi nào và người nói nhìn nó thế nào.',
    long: 'Tiếng Việt chỉ thời gian bằng từ (đã, đang, sẽ) và hay bỏ đi khi đã rõ; tiếng Anh bắt buộc thể hiện ngay trên động từ. 12 “thì” thực ra là tổ hợp của 2 trục: thời điểm (quá khứ / hiện tại / tương lai) × cách nhìn (đơn: cả việc · tiếp diễn: đang ở giữa việc · hoàn thành: nhìn lại từ một mốc). App dạy theo 6 ý nghĩa thay vì 12 công thức.',
    example: 'I work / I am working / I have worked — cùng một việc, ba cách nhìn khác nhau.',
  },
  {
    key: 'continuous',
    term: 'Tiếp diễn (be + V-ing)',
    category: 'grammar',
    short: 'Nhìn việc khi nó đang ở giữa chừng: chưa xong, đang diễn ra quanh một mốc thời gian.',
    long: 'Dùng được ở mọi thời: hiện tại (I am cooking — bây giờ), quá khứ (I was cooking when she called — lúc cô ấy gọi), tương lai (I will be cooking at 7). Động từ chỉ trạng thái như know, like, want thường không dùng tiếp diễn.',
    example: 'She is working from home this week. (tạm thời, đang diễn ra)',
  },
  {
    key: 'perfect',
    term: 'Hoàn thành (have + V3)',
    category: 'grammar',
    short: 'Nhìn lại từ một mốc: việc xảy ra trước đó còn liên quan tới mốc này.',
    long: 'Hiện tại hoàn thành nhìn lại từ bây giờ: kinh nghiệm (Have you ever…?), kết quả còn đó (I have lost my keys), khoảng thời gian kéo dài tới giờ (since / for). Có mốc đã kết thúc như yesterday, last year, ago thì dùng quá khứ đơn. Quá khứ hoàn thành (had + V3) nhìn lại từ một mốc trong quá khứ.',
    example: 'I have lived here since 2020. (vẫn đang sống ở đây)',
  },
  {
    key: 'auxiliary',
    term: 'Trợ động từ',
    category: 'grammar',
    short: 'Từ nhỏ đứng trước động từ chính để tạo thì, câu hỏi, câu phủ định: do / does / did, am / is / are, have / has / had, will…',
    long: 'Người Việt hay quên trợ động từ (“I going”, “She not like”) vì tiếng Việt không có. Trong câu hỏi, trợ động từ đứng lên trước chủ ngữ: Do you…? Did she…? Have they…?',
    example: 'She doesn’t like coffee. · Are you coming?',
  },
  {
    key: 'v2_v3',
    term: 'V2 / V3',
    category: 'grammar',
    short: 'V2: dạng quá khứ (went); V3: quá khứ phân từ (gone) dùng sau have / has / had và trong câu bị động.',
    long: 'Động từ có quy tắc thì V2 và V3 giống nhau (worked – worked). Động từ bất quy tắc phải nhớ riêng: go – went – gone, see – saw – seen. Lỗi hay gặp: “I have went” (phải là have gone).',
  },
  {
    key: 'ccq',
    term: 'Câu hỏi kiểm tra khái niệm (CCQ)',
    category: 'grammar',
    short: 'Câu hỏi Có/Không về Ý NGHĨA của câu, để chắc bạn hiểu thật — thay cho câu “bạn hiểu chưa?”.',
    long: 'Ví dụ với “I have lived in Hue for 5 years”: “Bây giờ người nói còn sống ở Huế không?” — Có. Trả lời đúng nghĩa là bạn hiểu thì, không cần thuộc công thức. Giáo viên tiếng Anh dùng cách này vì người học hay trả lời “hiểu rồi” cho có.',
  },
  {
    key: 'timeline',
    term: 'Trục thời gian',
    category: 'grammar',
    short: 'Hình vẽ một đường từ quá khứ sang tương lai, có mốc “bây giờ”, cho thấy mỗi thì “nhìn” sự việc thế nào.',
    long: 'Dấu × là một việc xảy ra tại một lúc; đoạn thẳng là việc kéo dài; đường lượn sóng là việc đang diễn ra; mũi tên cong nối một việc trong quá khứ tới mốc khác (thì hoàn thành); vạch đứt là mốc tham chiếu như “lúc tôi đến”.',
  },
  {
    key: 'reflex',
    term: 'Phản xạ (thời gian phản hồi)',
    category: 'grammar',
    short: 'Thời gian từ lúc thấy đề tới lúc bạn bắt đầu nói đúng — càng ngắn càng gần với nói tự nhiên.',
    long: 'Hiểu thì là bước đầu; nói được nhanh cần luyện nhiều, có ý nghĩa và đúng kỹ năng (muốn nói nhanh thì phải luyện nói). App đặt mục tiêu 6 giây rồi giảm dần còn 4 và 3 giây khi bạn trả lời nhanh và đúng liên tiếp, và lưu thời gian trung bình gần đây của từng thì để bạn thấy mình tiến bộ.',
  },
  {
    key: 'tense_lens',
    term: 'Kính thì',
    category: 'grammar',
    short: 'Nút “Thì” ở trang xem video: tô màu động từ trong phụ đề theo thì, bấm vào để xem vì sao người nói dùng thì đó.',
    long: 'Thì được nhận diện tự động (thư viện xử lý ngôn ngữ compromise, chạy trên máy chủ của app) nên đôi khi nhầm, nhất là phụ đề tự động không dấu câu — gặp chỗ sai, bấm “Nhận sai?” để báo. Bấm vào một màu ở thanh chú thích để chỉ xem các câu có thì đó, rồi lưu câu hay làm mẫu câu có nhãn thì.',
  },
  {
    key: 'interleaving',
    term: 'Học xen kẽ (trộn thì)',
    category: 'grammar',
    short: 'Trộn nhiều thì trong một lượt luyện thay vì luyện riêng từng thì — khó hơn lúc tập nhưng nhớ lâu hơn.',
    long: 'Khi luyện riêng một thì, bạn biết trước đáp án sẽ là thì đó. Lúc nói thật thì không ai báo trước — bạn phải tự chọn. Trộn thì luyện đúng việc “chọn thì” này. Nghiên cứu về luyện ngữ pháp cho thấy trộn bài tập giúp nhớ lâu hơn.',
  },
  {
    key: 'structured_input',
    term: 'Bài “nhận ra” (đầu vào có cấu trúc)',
    category: 'grammar',
    short: 'Câu nghe / đọc không có từ chỉ thời gian, buộc bạn nhìn vào động từ mới hiểu được nghĩa.',
    long: 'Người học thường dựa vào “yesterday”, “now” để đoán thời gian rồi bỏ qua đuôi động từ. Bỏ các từ đó đi, bạn phải để ý -ed, -s, have, ’ll… — chính là những thứ cần nghe ra và nói ra khi giao tiếp.',
  },
  {
    key: 'ending_sounds',
    term: 'Âm cuối -s / -ed',
    category: 'grammar',
    short: 'Đuôi -s đọc /s/ /z/ /ɪz/, đuôi -ed đọc /t/ /d/ /ɪd/ — bỏ âm cuối là người nghe không biết bạn nói thì nào.',
    long: 'Tiếng Việt không có phụ âm đôi ở cuối từ nên người Việt hay nuốt âm cuối: “He work”, “I walk yesterday”. Nói rõ âm cuối cũng quan trọng như chia đúng thì. Ví dụ: works /s/, plays /z/, watches /ɪz/; worked /t/, played /d/, wanted /ɪd/.',
  },
  // ---------- Luyện nói ----------
  {
    key: 'delayed_repeat',
    term: 'Nghe – chờ – nói',
    category: 'speaking',
    short: 'Nghe câu gốc, chờ vài giây rồi mới nói lại theo trí nhớ.',
    long: 'Khoảng chờ buộc não phải nhớ câu chứ không chỉ nhại theo âm thanh vừa nghe, nên nhớ cụm từ lâu hơn.',
  },
  {
    key: 'fluency_432',
    term: 'Bài 4/3/2',
    category: 'speaking',
    short: 'Nói cùng một đề 3 lần với thời gian giảm dần: 4 phút → 3 phút → 2 phút.',
    long: 'Vì nội dung đã quen, lần sau bạn không phải nghĩ “nói gì” mà tập trung nói nhanh và liền mạch hơn. Đây là kỹ thuật luyện trôi chảy của Maurice (1983) và Paul Nation (1989).',
  },
  {
    key: 'wpm',
    term: 'Từ/phút (tốc độ nói)',
    category: 'speaking',
    short: 'Số từ bạn nói được trong một phút.',
    long: 'Người bản xứ nói chuyện thường khoảng 120–160 từ/phút. Trong bài 4/3/2, chỉ số này nên tăng dần qua các lượt.',
  },
  {
    key: 'long_pause',
    term: 'Ngừng dài',
    category: 'speaking',
    short: 'Những lần im lặng từ 1 giây trở lên giữa lúc nói — thường là lúc đang bí từ hoặc bí ý.',
  },
  {
    key: 'mean_run',
    term: 'Đoạn nói liền',
    category: 'speaking',
    short: 'Số từ trung bình bạn nói được giữa hai lần ngừng. Càng dài càng trôi chảy.',
  },
  {
    key: 'filler',
    term: 'Từ đệm',
    category: 'speaking',
    short: 'Những từ “lấp chỗ trống” khi đang nghĩ: um, uh, you know, I mean, kind of…',
    long: 'Dùng thỉnh thoảng thì tự nhiên, dùng quá nhiều thì nghe ngập ngừng. Lưu ý: nhận dạng giọng nói của trình duyệt hay bỏ sót “um/uh”, nên số đếm thường thấp hơn thực tế.',
  },
  {
    key: 'speech_recognition',
    term: 'Nhận dạng giọng nói',
    category: 'speaking',
    short: 'Trình duyệt nghe micro và chuyển lời bạn nói thành chữ để app chấm.',
    long: 'Chạy tốt nhất trên Chrome hoặc Edge và cần kết nối mạng. App chỉ kiểm tra những gì chắc chắn (có nói đúng cụm/từ hay không, nhắc lại đúng bao nhiêu % từ), không chấm điểm ngữ pháp.',
  },

  // ---------- Trình độ & độ khó ----------
  {
    key: 'cefr',
    term: 'Cấp độ CEFR (A1–C2)',
    category: 'level',
    short: 'Khung trình độ ngoại ngữ châu Âu: A1–A2 cơ bản, B1–B2 trung cấp, C1–C2 thành thạo.',
    long: 'Trong app, cấp độ của mỗi từ được ước lượng từ độ phổ biến của nó: từ càng hay gặp thì cấp càng thấp. Chỉ mang tính tham khảo.',
  },
  {
    key: 'ielts_band',
    term: 'Band IELTS',
    category: 'level',
    short: 'Thang điểm IELTS từ 0 đến 9.',
    long: 'Tương ứng gần đúng: B1 ≈ band 4–5, B2 ≈ band 5.5–6.5, C1 ≈ band 7–8, C2 ≈ band 8.5–9.',
  },
  {
    key: 'coverage',
    term: 'Độ phủ từ vựng',
    category: 'level',
    short: 'Bạn đã biết bao nhiêu % số từ trong video (tính cả từ lặp lại).',
    long: 'Từ 98% trở lên: dễ, xem thoải mái. 95–98%: vừa sức — hiểu ý chính và vẫn có từ mới để học (lý tưởng). Dưới 95%: khó — nên học trước các từ mới hoặc chọn video dễ hơn.',
  },
  {
    key: 'ngsl',
    term: 'NGSL',
    category: 'level',
    short: 'Danh sách ~2.800 từ phổ biến nhất tiếng Anh, chiếm khoảng 90% văn bản thông thường.',
    long: 'New General Service List (Browne, Culligan & Phillips). App dùng danh sách này để đoán những từ bạn đã biết theo trình độ, từ đó tính độ khó của video.',
  },
  {
    key: 'vocab_level',
    term: 'Trình độ nền',
    category: 'level',
    short: 'Mức vốn từ bạn chọn (A2/B1/B2/C1) — app coi những từ phổ biến thuộc mức này là bạn đã biết.',
  },
  {
    key: 'placement',
    term: 'Bài test vốn từ',
    category: 'level',
    short: 'Chọn “Biết / Không biết” cho 52 từ để app ước lượng vốn từ của bạn trong ~3 phút.',
    long: 'Từ được chọn theo 5 nhóm độ khó. Bài có lẫn từ giả để trừ phần đoán mò (phương pháp “Yes/No test”).',
  },
  {
    key: 'pseudoword',
    term: 'Từ giả',
    category: 'level',
    short: 'Từ không có thật (như “grastle”) trộn vào bài test.',
    long: 'Nếu bạn chọn “Biết” cho từ giả, app hiểu là bạn đang đoán và trừ điểm tương ứng — vì vậy hãy chỉ chọn “Biết” khi chắc chắn hiểu nghĩa.',
  },

  // ---------- Cài đặt & kỹ thuật ----------
  {
    key: 'web_push',
    term: 'Thông báo đẩy (Web Push)',
    category: 'tech',
    short: 'Thông báo từ máy chủ hiện trên máy bạn, kể cả khi đã đóng tab (trình duyệt vẫn đang chạy).',
  },
  {
    key: 'hymt',
    term: 'Hy-MT',
    category: 'tech',
    short: 'Model dịch máy của Tencent chạy ngay trên máy tính của bạn, dịch được theo ngữ cảnh câu.',
    long: 'Không gửi văn bản ra dịch vụ bên ngoài và không bị giới hạn lượt dịch. Cần bật kèm khi chạy app (xem README: “npm run dev:hymt” hoặc Docker Compose kèm Hy-MT).',
  },
  {
    key: 'provider',
    term: 'Nguồn dịch',
    category: 'tech',
    short: 'Dịch vụ dùng để dịch: Hy-MT (chạy trên máy), Google, hoặc MyMemory (dự phòng khi Google bị chặn).',
  },
  {
    key: 'base_url',
    term: 'Base URL & Model',
    category: 'tech',
    short: 'Địa chỉ của máy chủ model dịch (vd. http://localhost:8080/v1) và tên model được gọi.',
  },
  {
    key: 'prompt_style',
    term: 'Mẫu prompt',
    category: 'tech',
    short: 'Cách viết câu lệnh gửi cho model dịch — chọn đúng theo phiên bản model (HY-MT1.5 hoặc Hy-MT2).',
  },
  {
    key: 'pwa',
    term: 'Cài app (PWA)',
    category: 'tech',
    short: 'Cài trang web thành ứng dụng trên máy tính/điện thoại (biểu tượng cài đặt trên thanh địa chỉ).',
  },
];

export const GLOSSARY: Record<string, GlossaryEntry> = Object.fromEntries(entries.map((e) => [e.key, e]));
export const GLOSSARY_LIST = entries;
