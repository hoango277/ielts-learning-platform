import type { WritingPrompt } from './types.ts';

/** Đề viết trộn nhiều thì, theo dạng IELTS (Speaking Part 2, Writing Task 1/2). */
export const MIXED_PROMPTS: WritingPrompt[] = [
  {
    id: 'mx-w-skill',
    lesson: 'mixed',
    title: 'Một kỹ năng bạn đã học',
    prompt: 'Kể về một kỹ năng bạn đã học (bơi, nấu ăn, lập trình…): học khi nào, đã học được bao lâu, bây giờ dùng nó ra sao và sắp tới định làm gì với nó. Viết 6–8 câu.',
    guide: ['When did you start learning it?', 'How long have you been doing it?', 'How do you use it now?', 'What are you going to do with it next?'],
    targets: ['past-simple', 'present-perfect', 'present-simple', 'future-going-to'],
    minSentences: 6,
    model:
      'I started learning to cook when I moved to Hanoi for university. At first, I burned almost everything. I have cooked for myself for three years now, and I have learned about twenty simple dishes. These days I cook dinner most evenings because it is cheaper and healthier. Next month I am going to take a short course on Vietnamese desserts.',
    ielts: 'speaking',
  },
  {
    id: 'mx-w-trend',
    lesson: 'mixed',
    title: 'Mô tả xu hướng (IELTS Task 1)',
    prompt:
      'Mô tả số người dùng xe buýt ở một thành phố: năm 2015 là 2 triệu lượt/tháng, năm 2020 giảm còn 1,5 triệu, từ 2020 đến nay tăng lên 3 triệu, dự báo năm 2030 đạt 4 triệu. Viết 5–7 câu, dùng đúng thì cho từng giai đoạn.',
    guide: ['What happened between 2015 and 2020?', 'What has happened since 2020?', 'What is the forecast for 2030?'],
    targets: ['past-simple', 'present-perfect', 'future-will'],
    minSentences: 5,
    model:
      'In 2015, people made about two million bus trips per month. This figure fell to 1.5 million in 2020. Since 2020, the number of trips has doubled to three million. It is predicted that the figure will reach four million by 2030. Overall, bus use has grown significantly over the period.',
    ielts: 'task1',
  },
  {
    id: 'mx-w-tech-study',
    lesson: 'mixed',
    title: 'Công nghệ đã thay đổi cách học (IELTS Task 2)',
    prompt:
      'Viết một đoạn ý kiến: công nghệ đã thay đổi cách học sinh học như thế nào? So sánh với trước đây, nói về hiện tại và dự đoán tương lai. Viết 6–8 câu.',
    guide: ['How did students study in the past?', 'How has technology changed this?', 'How do students study now?', 'What will happen in the future?'],
    targets: ['past-simple', 'present-perfect', 'present-simple', 'future-will'],
    minSentences: 6,
    model:
      'Twenty years ago, most students learned only from textbooks and teachers. Technology has changed this situation completely. Today, students watch online lectures and use apps to practise every day. As a result, learning has become more flexible and personal. However, some students spend too much time on their phones. In the future, I think artificial intelligence will make lessons even more personal.',
    ielts: 'task2',
  },
  {
    id: 'mx-w-year',
    lesson: 'mixed',
    title: 'Năm nay của bạn',
    prompt: 'Kể về năm nay của bạn: đã làm được gì, điều gì đáng nhớ đã xảy ra, dạo này đang tập trung vào việc gì và kế hoạch tới. Viết 6–8 câu.',
    guide: ['What have you achieved this year?', 'What happened that you remember well?', 'What are you working on these days?', 'What are you going to do next?'],
    targets: ['present-perfect', 'past-simple', 'present-continuous', 'future-going-to'],
    minSentences: 6,
    model:
      'This year has been busy but exciting. I have finished my second year at university and I have saved some money from my part-time job. In March, my family travelled to Da Nang, and we had a wonderful time by the sea. These days I am preparing for the IELTS test. I am practising speaking every evening with a friend. After the test, I am going to apply for a summer internship.',
    ielts: 'speaking',
  },
];
