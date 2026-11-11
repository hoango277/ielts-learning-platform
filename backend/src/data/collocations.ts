/**
 * Collocation hay dùng sai (đặc biệt với người Việt): động từ + danh từ, tính từ + danh từ.
 * Mỗi mục: từ đúng, phần đi kèm, các phương án SAI (đã chọn để chắc chắn sai trong câu ví dụ),
 * nghĩa tiếng Việt và câu ví dụ. Câu ví dụ dùng dạng nguyên mẫu của từ đúng để các phương án cùng dạng.
 */
export interface Collocation {
  /** Từ đúng (dạng nguyên mẫu) */
  answer: string;
  /** Các cách nói khác cũng đúng (không bao giờ dùng làm phương án sai) */
  also?: string[];
  /** Phần đi kèm, ví dụ "a decision" */
  partner: string;
  wrong: [string, string, string];
  vi: string;
  /** Câu ví dụ, từ đúng nằm trong {…} */
  example: string;
  note?: string;
}

const c = (answer: string, partner: string, wrong: [string, string, string], vi: string, example: string, extra: Partial<Collocation> = {}): Collocation => ({
  answer,
  partner,
  wrong,
  vi,
  example,
  ...extra,
});

export const COLLOCATIONS: Collocation[] = [
  // make
  c('make', 'a decision', ['do', 'give', 'keep'], 'đưa ra quyết định', 'We need to {make} a decision by Friday.', { also: ['take'], note: '“take a decision” cũng dùng trong Anh-Anh.' }),
  c('make', 'a mistake', ['do', 'take', 'give'], 'mắc lỗi', 'Everyone needs to {make} mistakes in order to learn.'),
  c('make', 'progress', ['do', 'take', 'give'], 'tiến bộ', 'If you practise every day, you will {make} progress quickly.'),
  c('make', 'an effort', ['do', 'take', 'keep'], 'cố gắng', 'Try to {make} an effort to speak English at home.'),
  c('make', 'a profit', ['do', 'take', 'give'], 'có lãi', 'Small shops find it hard to {make} a profit.'),
  c('make', 'an excuse', ['do', 'take', 'have'], 'viện cớ', "Don't {make} excuses for being late."),
  c('make', 'a complaint', ['do', 'take', 'give'], 'khiếu nại', 'You can {make} a complaint to the manager.'),
  c('make', 'a difference', ['do', 'take', 'give'], 'tạo ra sự khác biệt', 'Small changes can {make} a big difference.'),
  c('make', 'friends', ['do', 'take', 'give'], 'kết bạn', 'It is easy to {make} friends at university.'),
  c('make', 'money', ['do', 'take', 'give'], 'kiếm tiền', 'Many students {make} money by tutoring.'),
  c('make', 'a suggestion', ['do', 'take', 'keep'], 'đưa ra gợi ý', 'Can I {make} a suggestion?'),
  c('make', 'an appointment', ['do', 'take', 'give'], 'đặt lịch hẹn', 'You should {make} an appointment with the dentist.'),
  c('make', 'plans', ['do', 'take', 'give'], 'lên kế hoạch', "Let's {make} plans for the weekend."),
  c('make', 'a choice', ['do', 'keep', 'pay'], 'lựa chọn', 'Sooner or later you have to {make} a choice.'),
  c('make', 'noise', ['do', 'take', 'give'], 'gây ồn', 'Please try not to {make} so much noise.'),
  // do
  c('do', 'homework', ['make', 'take', 'give'], 'làm bài tập về nhà', 'I usually {do} my homework after dinner.'),
  c('do', 'research', ['make', 'take', 'give'], 'nghiên cứu', 'Scientists {do} research to find new medicines.'),
  c('do', 'business', ['make', 'take', 'give'], 'kinh doanh, làm ăn', 'It is difficult to {do} business without the internet.'),
  c('do', 'the housework', ['make', 'take', 'give'], 'làm việc nhà', 'Who should {do} the housework in a family?'),
  c('do', 'your best', ['make', 'take', 'have'], 'cố gắng hết sức', 'Just {do} your best in the exam.'),
  c('do', 'a favour', ['make', 'take', 'give'], 'giúp ai một việc', 'Could you {do} me a favour?'),
  c('do', 'the shopping', ['make', 'take', 'give'], 'đi mua sắm (đồ dùng hằng ngày)', 'I {do} the shopping on Saturday mornings.'),
  c('do', 'harm', ['make', 'take', 'give'], 'gây hại', 'Too much screen time can {do} more harm than good.'),
  c('do', 'damage', ['make', 'give', 'pay'], 'gây thiệt hại', 'Strong winds can {do} serious damage to old buildings.'),
  // take
  c('take', 'a photo', ['make', 'do', 'give'], 'chụp ảnh', 'Can you {take} a photo of us?', { note: '“make a photo” là lỗi hay gặp do dịch từ tiếng mẹ đẻ.' }),
  c('take', 'responsibility', ['make', 'do', 'give'], 'chịu trách nhiệm', 'Parents should {take} responsibility for their children.'),
  c('take', 'a break', ['make', 'do', 'give'], 'nghỉ giải lao', "Let's {take} a short break.", { also: ['have'] }),
  c('take', 'an exam', ['make', 'give', 'keep'], 'dự thi', 'I am going to {take} the IELTS exam next month.', { also: ['sit', 'do'] }),
  c('take', 'notes', ['do', 'give', 'pay'], 'ghi chép', 'Students should {take} notes during lectures.', { also: ['make'] }),
  c('take', 'action', ['make', 'do', 'give'], 'hành động', 'The government must {take} action on pollution.'),
  c('take', 'a risk', ['make', 'do', 'give'], 'mạo hiểm', 'Sometimes you have to {take} a risk.'),
  c('take', 'advantage of', ['make', 'do', 'give'], 'tận dụng', 'You should {take} advantage of every chance to speak English.'),
  c('take', 'part in', ['make', 'do', 'give'], 'tham gia', 'Students are encouraged to {take} part in clubs.'),
  c('take', 'place', ['make', 'do', 'give'], 'diễn ra', 'The festival will {take} place in July.'),
  c('take', 'care of', ['make', 'do', 'give'], 'chăm sóc', 'Who will {take} care of your dog while you are away?'),
  c('take', 'medicine', ['make', 'do', 'pay'], 'uống thuốc', 'You should {take} this medicine twice a day.'),
  // pay
  c('pay', 'attention', ['make', 'do', 'take'], 'chú ý', 'Please {pay} attention to the instructions.'),
  c('pay', 'a visit', ['do', 'take', 'keep'], 'ghé thăm', 'We plan to {pay} a visit to our grandparents.', { also: ['make'] }),
  c('pay', 'a compliment', ['make', 'do', 'take'], 'khen', 'It is nice to {pay} someone a compliment.'),
  // keep / catch / break / give
  c('keep', 'a secret', ['make', 'do', 'take'], 'giữ bí mật', 'Can you {keep} a secret?'),
  c('keep', 'in touch', ['make', 'do', 'take'], 'giữ liên lạc', "Let's {keep} in touch after the course.", { also: ['stay'] }),
  c('keep', 'a diary', ['make', 'do', 'take'], 'viết nhật ký', 'Some learners {keep} a diary in English.'),
  c('catch', 'a cold', ['make', 'do', 'take'], 'bị cảm lạnh', 'Wear a coat or you will {catch} a cold.', { also: ['get', 'have'] }),
  c('catch', 'the bus', ['make', 'do', 'keep'], 'bắt xe buýt', 'I have to {catch} the bus at seven.', { also: ['take', 'get'] }),
  c('break', 'the law', ['make', 'do', 'take'], 'phạm luật', 'People who drive without a licence {break} the law.'),
  c('give', 'advice', ['make', 'do', 'take'], 'cho lời khuyên', 'Teachers often {give} students useful advice.'),
  c('give', 'permission', ['make', 'do', 'take'], 'cho phép', 'Only the teacher can {give} permission to leave early.'),
  // các động từ khác
  c('raise', 'awareness', ['make', 'do', 'take'], 'nâng cao nhận thức', 'The campaign aims to {raise} awareness of climate change.'),
  c('reach', 'a goal', ['make', 'do', 'take'], 'đạt mục tiêu', 'With hard work, you will {reach} your goal of band 7.', { also: ['achieve'] }),
  c('meet', 'a deadline', ['do', 'take', 'keep'], 'kịp hạn chót', 'I had to work all night to {meet} the deadline.', { also: ['make'] }),
  c('meet', 'the needs', ['make', 'do', 'take'], 'đáp ứng nhu cầu', 'Schools must {meet} the needs of all students.'),
  c('commit', 'a crime', ['make', 'take', 'give'], 'phạm tội', 'Young people who {commit} a crime need support, not just punishment.'),
  c('draw', 'a conclusion', ['do', 'take', 'give'], 'rút ra kết luận', 'It is too early to {draw} a conclusion.', { also: ['reach', 'come to'] }),
  c('hold', 'a meeting', ['make', 'do', 'give'], 'tổ chức cuộc họp', 'The manager will {hold} a meeting on Monday.', { also: ['have'] }),
  c('set', 'a goal', ['make', 'do', 'take'], 'đặt mục tiêu', 'You should {set} a clear goal for each week.'),
  c('run', 'a business', ['make', 'do', 'take'], 'điều hành doanh nghiệp', 'My parents {run} a small business.'),
  c('tell', 'the truth', ['say', 'talk', 'do'], 'nói sự thật', 'Children should always {tell} the truth.', { also: ['speak'] }),
  c('tell', 'a lie', ['say', 'talk', 'do'], 'nói dối', 'It is wrong to {tell} a lie.'),
  c('tell', 'a story', ['say', 'talk', 'speak'], 'kể chuyện', 'My grandmother loves to {tell} stories.'),
  c('say', 'goodbye', ['tell', 'talk', 'speak'], 'chào tạm biệt', 'It is hard to {say} goodbye to old friends.'),
  c('play', 'an important role', ['do', 'make', 'take'], 'đóng vai trò quan trọng', 'Technology will {play} an important role in education.'),
  c('pose', 'a threat', ['make', 'do', 'take'], 'gây ra mối đe doạ', 'Plastic waste can {pose} a threat to sea life.'),
  c('face', 'challenges', ['make', 'do', 'take'], 'đối mặt với thử thách', 'Many graduates {face} challenges when looking for work.'),
  c('solve', 'a problem', ['make', 'do', 'take'], 'giải quyết vấn đề', 'We need to work together to {solve} this problem.'),
  c('achieve', 'success', ['make', 'do', 'take'], 'đạt được thành công', 'Hard work helps people {achieve} success.', { note: '“make success” là lỗi phổ biến.' }),
  c('gain', 'experience', ['make', 'take', 'do'], 'tích luỹ kinh nghiệm', 'Part-time jobs help students {gain} experience.', { also: ['get'] }),
  c('have', 'an impact', ['do', 'take', 'give'], 'có ảnh hưởng', 'Social media can {have} a huge impact on young people.', { also: ['make'] }),
  c('conduct', 'a survey', ['give', 'pay', 'keep'], 'tiến hành khảo sát', 'Researchers plan to {conduct} a survey of 500 students.', { also: ['carry out', 'do'] }),
  c('spend', 'time', ['take', 'cost', 'make'], 'dành thời gian', 'I {spend} two hours on my homework every day.'),
  c('save', 'time', ['keep', 'win', 'earn'], 'tiết kiệm thời gian', 'Online shopping can {save} time.'),
  c('earn', 'a living', ['win', 'take', 'do'], 'kiếm sống', 'It is hard to {earn} a living as an artist.', { also: ['make'] }),
  c('lose', 'weight', ['miss', 'low', 'fall'], 'giảm cân', 'Many people want to {lose} weight before summer.'),
  c('attend', 'a lecture', ['participate', 'assist', 'visit'], 'dự buổi giảng', 'All students must {attend} the first lecture.', { note: '“assist a lecture” là lỗi do nhầm với tiếng Pháp.' }),
  // tính từ + danh từ
  c('heavy', 'rain', ['strong', 'big', 'high'], 'mưa to', 'The match was cancelled because of {heavy} rain.'),
  c('heavy', 'traffic', ['strong', 'big', 'crowded'], 'giao thông đông đúc', 'There is always {heavy} traffic in the city centre.', { note: '“crowded traffic” là lỗi dịch từ “giao thông đông đúc”.' }),
  c('strong', 'coffee', ['heavy', 'powerful', 'hard'], 'cà phê đậm', 'I need a cup of {strong} coffee in the morning.'),
  c('high', 'temperatures', ['tall', 'big', 'strong'], 'nhiệt độ cao', 'Some plants cannot survive {high} temperatures.'),
  c('high', 'salaries', ['tall', 'expensive', 'heavy'], 'lương cao', 'Doctors usually earn {high} salaries.'),
  c('fast', 'food', ['quick', 'rapid', 'speedy'], 'đồ ăn nhanh', 'Eating {fast} food every day is unhealthy.'),
  c('close', 'friends', ['near', 'nearby', 'short'], 'bạn thân', 'I have a few {close} friends from school.'),
  c('strong', 'accent', ['big', 'high', 'hard'], 'giọng địa phương nặng', 'He speaks English with a {strong} accent.', { also: ['heavy', 'thick'] }),
  c('heavy', 'smoker', ['strong', 'hard', 'thick'], 'người hút thuốc nhiều', 'My uncle used to be a {heavy} smoker.'),
];
