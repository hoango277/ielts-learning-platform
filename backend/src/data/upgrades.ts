/**
 * "Nâng cấp từ cơ bản": các từ hay bị dùng quá nhiều và từ thay thế, kèm ghi chú sắc thái (soạn tay).
 * Mỗi câu luyện tập đánh dấu từ cơ bản bằng [[...]] và liệt kê những từ thay thế hợp với ngữ cảnh đó.
 * `group` là trường nghĩa: phương án nhiễu chỉ lấy từ nhóm KHÁC, để không vô tình cũng đúng
 * (vd. “a really engaging presentation” cũng hợp với câu của “good”).
 */
export interface Upgrade {
  word: string;
  vi: string;
  note: string;
}

export interface UpgradeEntry {
  basic: string;
  pos: 'adj' | 'verb' | 'noun' | 'adv' | 'quantity' | 'prep';
  group: string;
  upgrades: Upgrade[];
  sentences: { text: string; fits: string[] }[];
}

const u = (word: string, vi: string, note: string): Upgrade => ({ word, vi, note });

export const UPGRADES: UpgradeEntry[] = [
  {
    basic: 'good',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('excellent', 'xuất sắc', 'Khen chung, dùng được ở mọi văn phong.'),
      u('outstanding', 'nổi bật, vượt trội', 'Nhấn mạnh hơn hẳn những cái khác.'),
      u('impressive', 'gây ấn tượng', 'Nói về cảm nhận của người xem/nghe.'),
      u('superb', 'tuyệt hảo', 'Khen rất mạnh, hơi văn chương.'),
      u('beneficial', 'có lợi', 'Dùng cho tác động (beneficial for/to), không dùng để khen người.'),
    ],
    sentences: [
      { text: 'She gave a really [[good]] presentation yesterday.', fits: ['excellent', 'outstanding', 'impressive', 'superb'] },
      { text: 'Regular exercise is [[good]] for your mental health.', fits: ['beneficial'] },
    ],
  },
  {
    basic: 'bad',
    pos: 'adj',
    group: 'negative',
    upgrades: [
      u('poor', 'kém', 'Chất lượng, kết quả, dịch vụ kém — trung tính, hay dùng trong bài viết.'),
      u('terrible', 'rất tệ', 'Cảm xúc mạnh, thiên về khẩu ngữ.'),
      u('awful', 'kinh khủng', 'Khẩu ngữ, mạnh hơn bad.'),
      u('harmful', 'có hại', 'Nói về tác động xấu (harmful to/for).'),
      u('severe', 'nghiêm trọng', 'Dùng cho bệnh, thời tiết, thiệt hại, hậu quả.'),
    ],
    sentences: [
      { text: 'The service at the hotel was really [[bad]].', fits: ['poor', 'terrible', 'awful'] },
      { text: 'Smoking is [[bad]] for your lungs.', fits: ['harmful', 'terrible', 'awful'] },
      { text: 'The storm caused [[bad]] damage to the coast.', fits: ['severe', 'terrible'] },
    ],
  },
  {
    basic: 'big',
    pos: 'adj',
    group: 'size-large',
    upgrades: [
      u('huge', 'rất to', 'Trung tính, dùng cả nói và viết.'),
      u('enormous', 'khổng lồ', 'Mạnh hơn huge một chút.'),
      u('massive', 'đồ sộ', 'Thiên về khẩu ngữ, nhấn mạnh.'),
      u('substantial', 'đáng kể', 'Số lượng, mức tăng, khoản tiền — trang trọng.'),
      u('considerable', 'đáng kể', 'Giống substantial, hay dùng với amount/increase/time.'),
      u('major', 'lớn, chủ yếu', 'Vấn đề, thay đổi, nguyên nhân — đứng trước danh từ.'),
    ],
    sentences: [
      { text: 'They live in a [[big]] house near the beach.', fits: ['huge', 'massive'] },
      { text: 'There has been a [[big]] increase in house prices.', fits: ['substantial', 'considerable', 'huge', 'massive', 'major'] },
      { text: 'Air pollution is a [[big]] problem in many cities.', fits: ['major', 'huge', 'massive'] },
    ],
  },
  {
    basic: 'small',
    pos: 'adj',
    group: 'size-small',
    upgrades: [
      u('tiny', 'tí hon', 'Rất nhỏ, khẩu ngữ hơn.'),
      u('minor', 'nhỏ, không quan trọng', 'Vấn đề, lỗi, thay đổi nhỏ.'),
      u('slight', 'nhẹ', 'Thay đổi, khác biệt, tăng giảm nhẹ.'),
      u('compact', 'nhỏ gọn', 'Đồ vật, căn hộ — nghĩa tích cực (tiện, gọn).'),
      u('modest', 'khiêm tốn', 'Số tiền, mức lương, mức tăng không lớn.'),
    ],
    sentences: [
      { text: 'There is only a [[small]] difference between the two words.', fits: ['slight', 'tiny', 'minor'] },
      { text: 'I live in a [[small]] but comfortable flat.', fits: ['compact', 'tiny'] },
      { text: 'He earns a [[small]] salary but enjoys his job.', fits: ['modest'] },
    ],
  },
  {
    basic: 'important',
    pos: 'adj',
    group: 'size-large',
    upgrades: [
      u('crucial', 'cực kỳ quan trọng', 'Mang tính quyết định đến kết quả.'),
      u('vital', 'sống còn', 'Không thể thiếu, thường với sức khoẻ, sự sống, thành công.'),
      u('essential', 'thiết yếu', 'Bắt buộc phải có.'),
      u('significant', 'có ý nghĩa, đáng kể', 'Hay dùng với role, impact, change.'),
      u('key', 'then chốt', 'Chỉ đứng trước danh từ: a key role, key factors.'),
    ],
    sentences: [
      { text: "Sleep is [[important]] for students' memory.", fits: ['crucial', 'vital', 'essential'] },
      { text: 'Teachers have always played [[important]] roles in society.', fits: ['key', 'crucial', 'vital', 'significant', 'essential'] },
    ],
  },
  {
    basic: 'very',
    pos: 'adv',
    group: 'degree',
    upgrades: [
      u('extremely', 'cực kỳ', 'Dùng với hầu hết tính từ.'),
      u('highly', 'rất', 'Đi với successful, likely, recommended, educated, effective.'),
      u('deeply', 'sâu sắc', 'Đi với cảm xúc: moved, concerned, disappointed.'),
      u('incredibly', 'vô cùng', 'Nhấn mạnh, thiên về khẩu ngữ.'),
      u('remarkably', 'đáng chú ý', 'Ngạc nhiên vì mức độ cao.'),
    ],
    sentences: [
      { text: 'The listening test was [[very]] difficult.', fits: ['extremely', 'incredibly', 'remarkably'] },
      { text: 'Her online business has become [[very]] successful.', fits: ['highly', 'extremely', 'incredibly', 'remarkably'] },
      { text: 'I was [[very]] moved by the film.', fits: ['deeply'] },
    ],
  },
  {
    basic: 'a lot of',
    pos: 'quantity',
    group: 'quantity',
    upgrades: [
      u('numerous', 'nhiều', 'Đi với danh từ đếm được số nhiều, trang trọng.'),
      u('a great deal of', 'rất nhiều', 'Đi với danh từ không đếm được (time, money, effort).'),
      u('a wide range of', 'đủ loại', 'Nhấn mạnh sự đa dạng.'),
      u('plenty of', 'nhiều, dư dả', 'Thân mật, nghĩa là “đủ và hơn thế”.'),
    ],
    sentences: [
      { text: 'There are [[a lot of]] reasons to learn a second language.', fits: ['numerous', 'plenty of'] },
      { text: 'It takes [[a lot of]] time to master pronunciation.', fits: ['a great deal of', 'plenty of'] },
      { text: 'The shop sells [[a lot of]] products, from food to furniture.', fits: ['a wide range of', 'numerous'] },
    ],
  },
  {
    basic: 'many',
    pos: 'quantity',
    group: 'quantity',
    upgrades: [
      u('countless', 'vô số', 'Nhiều đến mức không đếm được — nhấn mạnh.'),
      u('multiple', 'nhiều (hơn một)', 'Trung tính, hay dùng trong văn bản kỹ thuật.'),
      u('a large number of', 'một số lượng lớn', 'Đi với danh từ đếm được, trang trọng.'),
    ],
    sentences: [{ text: 'There are [[many]] benefits of travelling abroad.', fits: ['countless', 'multiple', 'a large number of'] }],
  },
  {
    basic: 'think',
    pos: 'verb',
    group: 'communicate',
    upgrades: [
      u('believe', 'tin rằng', 'Thể hiện quan điểm chắc chắn.'),
      u('argue', 'lập luận rằng', 'Khi đưa ra lý lẽ để bảo vệ quan điểm.'),
      u('reckon', 'nghĩ là', 'Khẩu ngữ (đặc biệt Anh-Anh), tránh trong bài viết trang trọng.'),
      u('consider', 'cân nhắc', 'Không đi với “about”: consider all the options.'),
      u('assume', 'cho rằng', 'Nghĩ là đúng mà chưa có bằng chứng.'),
    ],
    sentences: [
      { text: 'I [[think]] that university education should be free.', fits: ['believe', 'argue', 'reckon'] },
      { text: 'We should [[think about]] all the options before deciding.', fits: ['consider'] },
      { text: 'Many people wrongly [[think]] that learning English is only about grammar.', fits: ['assume', 'believe'] },
    ],
  },
  {
    basic: 'say',
    pos: 'verb',
    group: 'communicate',
    upgrades: [
      u('claim', 'khẳng định', 'Nói điều có thể chưa chắc đúng — người viết giữ khoảng cách.'),
      u('state', 'tuyên bố, nêu rõ', 'Trang trọng, chính thức.'),
      u('mention', 'đề cập', 'Nói qua, không đi sâu.'),
      u('point out', 'chỉ ra', 'Nêu một sự thật mà người khác có thể chưa để ý.'),
    ],
    sentences: [
      { text: 'Some experts [[say]] that robots will replace teachers.', fits: ['claim', 'state', 'point out'] },
      { text: 'He did not even [[say]] the problem in his report.', fits: ['mention'] },
    ],
  },
  {
    basic: 'show',
    pos: 'verb',
    group: 'communicate',
    upgrades: [
      u('demonstrate', 'chứng minh', 'Trang trọng, có bằng chứng rõ ràng.'),
      u('reveal', 'tiết lộ', 'Cho thấy điều trước đó chưa ai biết.'),
      u('indicate', 'cho thấy', 'Số liệu, dấu hiệu gợi ý điều gì đó.'),
      u('illustrate', 'minh hoạ', 'Đưa ví dụ để làm rõ.'),
    ],
    sentences: [
      { text: 'These figures [[show]] that sales rose sharply last year.', fits: ['indicate', 'reveal', 'demonstrate'] },
      { text: 'The following examples [[show]] how the rule works.', fits: ['illustrate', 'demonstrate'] },
    ],
  },
  {
    basic: 'get',
    pos: 'verb',
    group: 'obtain',
    upgrades: [
      u('obtain', 'có được', 'Trang trọng, thường qua thủ tục (visa, permission).'),
      u('receive', 'nhận', 'Được gửi hoặc trao cho (email, award).'),
      u('gain', 'tích luỹ', 'Đạt được dần dần (experience, knowledge).'),
      u('acquire', 'tiếp thu', 'Kỹ năng, ngôn ngữ — trang trọng.'),
      u('earn', 'kiếm được', 'Nhờ công sức (money, respect).'),
    ],
    sentences: [
      { text: 'Students can [[get]] useful experience from part-time jobs.', fits: ['gain', 'acquire'] },
      { text: 'You need to [[get]] permission before filming here.', fits: ['obtain'] },
      { text: 'Most office workers [[get]] dozens of emails every day.', fits: ['receive'] },
      { text: 'Good teachers [[get]] the respect of their students.', fits: ['earn', 'gain'] },
    ],
  },
  {
    basic: 'help',
    pos: 'verb',
    group: 'help',
    upgrades: [
      u('assist', 'hỗ trợ', 'Trang trọng hơn help.'),
      u('support', 'ủng hộ, hỗ trợ', 'Giúp đỡ lâu dài (tài chính, tinh thần).'),
      u('facilitate', 'tạo điều kiện', 'Chủ ngữ thường là sự vật; tân ngữ là quá trình (communication, learning).'),
      u('enable', 'giúp có thể', 'Cấu trúc enable somebody to do something.'),
    ],
    sentences: [
      { text: 'Volunteers [[help]] elderly people with their shopping.', fits: ['assist', 'support'] },
      { text: 'Technology can [[help]] communication between countries.', fits: ['facilitate'] },
      { text: 'Scholarships [[help]] poor students to go to university.', fits: ['enable'] },
    ],
  },
  {
    basic: 'use',
    pos: 'verb',
    group: 'use',
    upgrades: [
      u('employ', 'áp dụng', 'Dùng phương pháp, kỹ thuật — trang trọng.'),
      u('utilise', 'tận dụng', 'Trang trọng; dùng nhiều dễ bị coi là rườm rà.'),
      u('exploit', 'khai thác', 'Tài nguyên; với người thì mang nghĩa xấu “lợi dụng”.'),
      u('take advantage of', 'tận dụng', 'Tận dụng cơ hội; với người cũng mang nghĩa xấu.'),
    ],
    sentences: [
      { text: 'Researchers [[use]] a variety of methods to collect data.', fits: ['employ', 'utilise'] },
      { text: 'Students should [[use]] every opportunity to practise speaking.', fits: ['take advantage of'] },
      { text: 'Some companies [[use]] natural resources without thinking about the future.', fits: ['exploit'] },
    ],
  },
  {
    basic: 'increase',
    pos: 'verb',
    group: 'up',
    upgrades: [
      u('rise', 'tăng', 'Nội động từ — không có tân ngữ (prices rise).'),
      u('soar', 'tăng vọt', 'Tăng rất nhanh và cao.'),
      u('surge', 'tăng đột biến', 'Tăng đột ngột, mạnh.'),
      u('grow', 'tăng dần', 'Tăng theo thời gian.'),
      u('boost', 'thúc đẩy', 'Ngoại động từ — làm cho cái gì tăng (boost sales).'),
    ],
    sentences: [
      { text: 'Experts expect house prices to [[increase]] sharply next year.', fits: ['rise', 'soar', 'surge'] },
      { text: 'The government wants to [[increase]] tourism in rural areas.', fits: ['boost'] },
    ],
  },
  {
    basic: 'decrease',
    pos: 'verb',
    group: 'down',
    upgrades: [
      u('decline', 'suy giảm', 'Giảm dần, trang trọng.'),
      u('drop', 'giảm', 'Giảm (thường nhanh), nội động từ.'),
      u('plummet', 'giảm mạnh', 'Rơi tự do, đột ngột.'),
      u('reduce', 'làm giảm', 'Ngoại động từ — cần tân ngữ (reduce waste).'),
      u('cut', 'cắt giảm', 'Ngoại động từ, khẩu ngữ hơn reduce.'),
    ],
    sentences: [
      { text: 'The number of wild birds is expected to [[decrease]] further.', fits: ['decline', 'drop', 'plummet'] },
      { text: 'We must [[decrease]] our use of plastic bags.', fits: ['reduce', 'cut'] },
    ],
  },
  {
    basic: 'change',
    pos: 'verb',
    group: 'change',
    upgrades: [
      u('transform', 'biến đổi hoàn toàn', 'Thay đổi lớn, theo hướng mới hẳn.'),
      u('alter', 'thay đổi một phần', 'Thay đổi nhỏ, trang trọng.'),
      u('modify', 'điều chỉnh', 'Sửa một chút để tốt hơn.'),
      u('adapt', 'điều chỉnh cho phù hợp', 'Thay đổi để hợp với hoàn cảnh mới.'),
    ],
    sentences: [
      { text: 'Artificial intelligence will [[change]] the way we work completely.', fits: ['transform'] },
      { text: 'You may need to [[change]] the recipe slightly.', fits: ['alter', 'modify', 'adapt'] },
    ],
  },
  {
    basic: 'start',
    pos: 'verb',
    group: 'start',
    upgrades: [
      u('launch', 'phát động, ra mắt', 'Chiến dịch, sản phẩm, dự án.'),
      u('initiate', 'khởi xướng', 'Trang trọng, bắt đầu một quá trình.'),
      u('establish', 'thành lập', 'Tổ chức, công ty, quỹ.'),
      u('commence', 'bắt đầu', 'Rất trang trọng (thông báo, văn bản pháp lý).'),
    ],
    sentences: [
      { text: 'The government plans to [[start]] a new campaign against smoking.', fits: ['launch', 'initiate'] },
      { text: 'They want to [[start]] a charity to help street children.', fits: ['establish', 'launch'] },
    ],
  },
  {
    basic: 'problem',
    pos: 'noun',
    group: 'abstract',
    upgrades: [
      u('issue', 'vấn đề', 'Trung tính, chủ đề đang được thảo luận.'),
      u('challenge', 'thách thức', 'Khó khăn có thể vượt qua — sắc thái tích cực hơn.'),
      u('obstacle', 'trở ngại', 'Thứ cản đường đến mục tiêu.'),
      u('drawback', 'nhược điểm', 'Mặt hạn chế của một thứ (the drawback of/with).'),
    ],
    sentences: [
      { text: 'The main [[problem]] with online learning is the lack of interaction.', fits: ['drawback', 'issue'] },
      { text: 'Language can be a major [[problem]] for international students.', fits: ['obstacle', 'challenge'] },
    ],
  },
  {
    basic: 'thing',
    pos: 'noun',
    group: 'abstract',
    upgrades: [
      u('factor', 'yếu tố', 'Thứ ảnh hưởng đến kết quả hoặc quyết định.'),
      u('aspect', 'khía cạnh', 'Một mặt của vấn đề.'),
      u('item', 'món, mục', 'Một đồ vật hoặc một mục trong danh sách.'),
    ],
    sentences: [
      { text: 'Price is the most important [[thing]] when people buy a car.', fits: ['factor'] },
      { text: 'One [[thing]] of city life I dislike is the noise.', fits: ['aspect'] },
      { text: 'Please check every [[thing]] on the shopping list.', fits: ['item'] },
    ],
  },
  {
    basic: 'people',
    pos: 'noun',
    group: 'people',
    upgrades: [
      u('individuals', 'các cá nhân', 'Nhấn mạnh từng người riêng lẻ — trang trọng.'),
      u('residents', 'cư dân', 'Người sống ở một khu vực.'),
      u('citizens', 'công dân', 'Người mang quốc tịch / thành viên của một thành phố, quốc gia.'),
    ],
    sentences: [
      { text: 'Local [[people]] complained about the new airport.', fits: ['residents'] },
      { text: 'Some [[people]] prefer to work alone.', fits: ['individuals'] },
      { text: 'All [[people]] of the country have the right to vote.', fits: ['citizens'] },
    ],
  },
  {
    basic: 'happy',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('delighted', 'rất vui', 'Vui khi nghe tin tốt (delighted to hear).'),
      u('thrilled', 'vui sướng', 'Phấn khích, mạnh hơn delighted.'),
      u('satisfied', 'hài lòng', 'Hài lòng với kết quả, dịch vụ.'),
      u('content', 'bằng lòng', 'Hài lòng nhẹ nhàng với những gì đang có.'),
      u('cheerful', 'vui vẻ', 'Tính cách hay vẻ mặt vui tươi.'),
    ],
    sentences: [
      { text: 'I was [[happy]] to hear that you passed the exam.', fits: ['delighted', 'thrilled'] },
      { text: 'Most customers are [[happy]] with the new service.', fits: ['satisfied', 'content', 'delighted', 'thrilled'] },
      { text: 'She is always [[happy]] and smiling, even on Mondays.', fits: ['cheerful'] },
    ],
  },
  {
    basic: 'sad',
    pos: 'adj',
    group: 'negative',
    upgrades: [
      u('upset', 'buồn bực', 'Buồn hoặc khó chịu sau một sự việc.'),
      u('disappointed', 'thất vọng', 'Kết quả không như mong đợi.'),
      u('heartbroken', 'đau lòng', 'Rất buồn, thường vì mất mát hoặc tình cảm.'),
      u('miserable', 'khổ sở', 'Rất không vui, kéo dài.'),
      u('depressed', 'chán nản, trầm cảm', 'Buồn kéo dài; cũng là thuật ngữ y khoa.'),
    ],
    sentences: [
      { text: 'He was [[sad]] when his team lost the final.', fits: ['upset', 'disappointed', 'heartbroken'] },
      { text: 'She felt [[sad]] after weeks of living alone in the rain.', fits: ['miserable', 'depressed'] },
    ],
  },
  {
    basic: 'interesting',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('fascinating', 'cuốn hút', 'Rất thú vị, khiến muốn tìm hiểu thêm.'),
      u('engaging', 'lôi cuốn', 'Giữ được sự chú ý (bài giảng, sách, người nói).'),
      u('intriguing', 'gây tò mò', 'Lạ và khiến người ta muốn biết thêm.'),
      u('thought-provoking', 'gợi suy nghĩ', 'Khiến người ta suy ngẫm.'),
    ],
    sentences: [
      { text: 'The documentary about the ocean was really [[interesting]].', fits: ['fascinating', 'engaging'] },
      { text: 'Her talk raised some [[interesting]] questions about education.', fits: ['thought-provoking', 'intriguing', 'fascinating'] },
    ],
  },
  {
    basic: 'boring',
    pos: 'adj',
    group: 'negative',
    upgrades: [
      u('tedious', 'tẻ nhạt', 'Công việc kéo dài, lặp đi lặp lại.'),
      u('dull', 'nhạt nhẽo', 'Thiếu sức sống, không thú vị.'),
      u('monotonous', 'đơn điệu', 'Lặp lại một kiểu, không thay đổi.'),
    ],
    sentences: [{ text: 'Filling in forms all day is a [[boring]] task.', fits: ['tedious', 'dull', 'monotonous'] }],
  },
  {
    basic: 'difficult',
    pos: 'adj',
    group: 'negative',
    upgrades: [
      u('challenging', 'đầy thử thách', 'Khó nhưng thú vị, kích thích cố gắng.'),
      u('demanding', 'đòi hỏi cao', 'Cần nhiều thời gian, công sức.'),
      u('tough', 'khó nhằn', 'Khẩu ngữ.'),
      u('complicated', 'phức tạp', 'Nhiều phần, khó hiểu.'),
      u('complex', 'phức tạp', 'Trung tính, hay dùng trong học thuật.'),
    ],
    sentences: [
      { text: 'Learning a new language can be [[difficult]] but rewarding.', fits: ['challenging', 'demanding', 'tough'] },
      { text: 'The tax system is too [[difficult]] for most people to understand.', fits: ['complicated', 'complex'] },
    ],
  },
  {
    basic: 'easy',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('straightforward', 'đơn giản, rõ ràng', 'Không có gì rắc rối.'),
      u('effortless', 'không tốn sức', 'Làm mà như không cần cố gắng.'),
      u('manageable', 'xoay xở được', 'Không quá khó để xử lý.'),
    ],
    sentences: [
      { text: 'The application process is quite [[easy]].', fits: ['straightforward', 'manageable'] },
      { text: 'With the new app, booking a train ticket is [[easy]].', fits: ['straightforward', 'effortless'] },
    ],
  },
  {
    basic: 'old',
    pos: 'adj',
    group: 'old',
    upgrades: [
      u('elderly', 'cao tuổi', 'Cách nói lịch sự về người già.'),
      u('ancient', 'cổ', 'Rất lâu đời (đền, thành phố, lịch sử).'),
      u('outdated', 'lỗi thời', 'Không còn phù hợp, đã có thứ mới hơn.'),
    ],
    sentences: [
      { text: 'Many [[old]] people in big cities live alone.', fits: ['elderly'] },
      { text: 'The company still uses [[old]] software from the 1990s.', fits: ['outdated'] },
      { text: 'We visited some [[old]] temples built over a thousand years ago.', fits: ['ancient'] },
    ],
  },
  {
    basic: 'new',
    pos: 'adj',
    group: 'new',
    upgrades: [
      u('innovative', 'đổi mới', 'Sáng tạo, khác cách làm cũ.'),
      u('novel', 'mới lạ', 'Ý tưởng, cách tiếp cận chưa từng có.'),
      u('modern', 'hiện đại', 'Thuộc thời nay.'),
      u('cutting-edge', 'tiên tiến nhất', 'Công nghệ mới nhất.'),
    ],
    sentences: [
      { text: 'The company is famous for its [[new]] ideas.', fits: ['innovative', 'novel'] },
      { text: 'Hospitals in rural areas need [[new]] medical equipment.', fits: ['modern', 'cutting-edge'] },
    ],
  },
  {
    basic: 'cheap',
    pos: 'adj',
    group: 'price-',
    upgrades: [
      u('affordable', 'giá phải chăng', 'Tích cực: ai cũng mua được. “cheap” đôi khi mang nghĩa rẻ tiền, kém chất lượng.'),
      u('inexpensive', 'không đắt', 'Trung tính.'),
      u('low-cost', 'chi phí thấp', 'Hay dùng cho dịch vụ: low-cost airlines.'),
    ],
    sentences: [{ text: 'Public transport should be [[cheap]] for everyone.', fits: ['affordable', 'inexpensive'] }],
  },
  {
    basic: 'expensive',
    pos: 'adj',
    group: 'price+',
    upgrades: [
      u('costly', 'tốn kém', 'Hay nói về chi phí hoặc hậu quả (a costly mistake).'),
      u('pricey', 'đắt', 'Khẩu ngữ.'),
      u('overpriced', 'đắt quá mức', 'Giá cao hơn giá trị thật — chê.'),
    ],
    sentences: [
      { text: 'Repairing the old bridge would be [[expensive]].', fits: ['costly', 'pricey'] },
      { text: 'Food at airports is usually [[expensive]] for what you get.', fits: ['overpriced', 'pricey'] },
    ],
  },
  {
    basic: 'nice',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('pleasant', 'dễ chịu', 'Thời tiết, không khí, trải nghiệm.'),
      u('lovely', 'đáng yêu, tuyệt', 'Khẩu ngữ, phổ biến trong Anh-Anh.'),
      u('friendly', 'thân thiện', 'Nói về người, thái độ.'),
      u('kind', 'tốt bụng', 'Nói về người (kind to somebody).'),
    ],
    sentences: [
      { text: 'We had [[nice]] weather during the whole trip.', fits: ['pleasant', 'lovely'] },
      { text: 'The hotel staff were very [[nice]] to us.', fits: ['friendly', 'kind', 'pleasant'] },
    ],
  },
  {
    basic: 'clever',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('brilliant', 'xuất chúng', 'Rất giỏi, khen mạnh.'),
      u('gifted', 'có năng khiếu', 'Tài năng bẩm sinh.'),
      u('intelligent', 'thông minh', 'Trung tính, trang trọng hơn clever.'),
      u('wise', 'khôn ngoan', 'Hiểu biết nhờ kinh nghiệm, đưa ra quyết định đúng.'),
    ],
    sentences: [
      { text: 'My sister has always been [[clever]] at maths.', fits: ['brilliant', 'gifted'] },
      { text: 'Saving money for the future is a [[clever]] decision.', fits: ['wise'] },
    ],
  },
  {
    basic: 'rich',
    pos: 'adj',
    group: 'wealth+',
    upgrades: [
      u('wealthy', 'giàu có', 'Trang trọng hơn rich.'),
      u('affluent', 'sung túc', 'Khu vực, xã hội, gia đình có điều kiện.'),
      u('prosperous', 'thịnh vượng', 'Quốc gia, thành phố, nền kinh tế phát triển.'),
    ],
    sentences: [{ text: 'Many [[rich]] countries give aid to poorer nations.', fits: ['wealthy', 'prosperous', 'affluent'] }],
  },
  {
    basic: 'poor',
    pos: 'adj',
    group: 'wealth-',
    upgrades: [
      u('disadvantaged', 'thiệt thòi', 'Có ít cơ hội hơn người khác — lịch sự.'),
      u('low-income', 'thu nhập thấp', 'Thuật ngữ trung tính.'),
      u('deprived', 'thiếu thốn', 'Thiếu những thứ cơ bản (khu vực, trẻ em).'),
    ],
    sentences: [{ text: 'Children from [[poor]] families often leave school early.', fits: ['disadvantaged', 'low-income', 'deprived'] }],
  },
  {
    basic: 'beautiful',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('stunning', 'đẹp ngỡ ngàng', 'Đẹp đến mức gây ấn tượng mạnh.'),
      u('picturesque', 'đẹp như tranh', 'Phong cảnh, làng quê.'),
      u('breathtaking', 'đẹp nghẹt thở', 'Cảnh quan rất ấn tượng.'),
    ],
    sentences: [{ text: 'The village is surrounded by [[beautiful]] countryside.', fits: ['picturesque', 'stunning', 'breathtaking'] }],
  },
  {
    basic: 'famous',
    pos: 'adj',
    group: 'positive',
    upgrades: [
      u('well-known', 'nổi tiếng', 'Nhiều người biết — trung tính.'),
      u('renowned', 'lừng danh', 'Nổi tiếng nhờ tài năng hay chất lượng — trang trọng, tích cực.'),
      u('notorious', 'khét tiếng', 'Nổi tiếng vì điều XẤU — đừng dùng để khen!'),
    ],
    sentences: [
      { text: 'Paris is [[famous]] for its art museums.', fits: ['renowned', 'well-known'] },
      { text: 'This street is [[famous]] for its high crime rate.', fits: ['notorious'] },
    ],
  },
  {
    basic: 'because of',
    pos: 'prep',
    group: 'cause',
    upgrades: [
      u('due to', 'do', 'Trang trọng hơn; đúng nhất sau động từ be (The delay was due to…).'),
      u('owing to', 'bởi vì', 'Trang trọng.'),
      u('as a result of', 'do hậu quả của', 'Nhấn mạnh quan hệ nhân quả.'),
    ],
    sentences: [{ text: 'All flights were cancelled [[because of]] the storm.', fits: ['due to', 'owing to', 'as a result of'] }],
  },
];
