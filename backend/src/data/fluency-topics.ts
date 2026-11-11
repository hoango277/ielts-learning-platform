/** Đề nói cho bài 4/3/2 — dạng mô tả có gợi ý (giống IELTS Speaking Part 2), soạn riêng cho app. */
export interface FluencyTopic {
  id: string;
  title: string;
  vi: string;
  category: 'people' | 'places' | 'objects' | 'events' | 'experiences' | 'opinions';
  prompts: string[];
}

const t = (id: string, category: FluencyTopic['category'], title: string, vi: string, prompts: string[]): FluencyTopic => ({ id, title, vi, category, prompts });

export const FLUENCY_TOPICS: FluencyTopic[] = [
  // Người
  t('person-influence', 'people', 'Describe a person who has influenced the way you think', 'Một người ảnh hưởng đến cách bạn suy nghĩ', ['who this person is', 'how you know them', 'what they did or said', 'why their influence matters to you']),
  t('person-teacher', 'people', 'Describe a teacher you remember well', 'Một giáo viên bạn nhớ rõ', ['what subject they taught', 'what their lessons were like', 'something memorable they did', 'why you still remember them']),
  t('person-skill', 'people', 'Describe someone you know who is very good at something', 'Một người bạn biết rất giỏi một việc', ['who the person is', 'what they are good at', 'how they became good at it', 'how you feel about their skill']),
  t('person-old', 'people', 'Describe an older person you enjoy talking to', 'Một người lớn tuổi bạn thích trò chuyện', ['who they are', 'how often you meet', 'what you usually talk about', 'what you have learned from them']),
  t('person-friend', 'people', 'Describe a friend you have known for a long time', 'Một người bạn lâu năm', ['how you met', 'what you do together', 'how your friendship has changed', 'why the friendship has lasted']),
  t('person-online', 'people', 'Describe a person you follow online', 'Một người bạn theo dõi trên mạng', ['who the person is', 'what kind of content they share', 'how you found them', 'why you keep following them']),
  // Địa điểm
  t('place-city', 'places', 'Describe a place in your city where you like to relax', 'Một nơi trong thành phố bạn thích thư giãn', ['where it is', 'how often you go there', 'what you do there', 'why it helps you relax']),
  t('place-trip', 'places', 'Describe a place you visited that was different from what you expected', 'Một nơi bạn đến khác với tưởng tượng', ['where and when you went', 'what you expected', 'what it was actually like', 'how you felt about the difference']),
  t('place-study', 'places', 'Describe a place where you like to study', 'Nơi bạn thích học bài', ['where it is', 'what it looks like', 'when you go there', 'why it helps you concentrate']),
  t('place-future', 'places', 'Describe a country you would like to visit in the future', 'Một đất nước bạn muốn đến', ['which country it is', 'how you learned about it', 'what you would do there', 'why you want to go']),
  t('place-shop', 'places', 'Describe a shop or market you often go to', 'Một cửa hàng hay khu chợ bạn hay ghé', ['where it is', 'what it sells', 'what the atmosphere is like', 'why you keep going back']),
  t('place-nature', 'places', 'Describe a natural place you enjoyed spending time in', 'Một nơi thiên nhiên bạn từng thích ở đó', ['where it is', 'who you went with', 'what you saw and did', 'why it was enjoyable']),
  t('place-childhood', 'places', 'Describe a place you remember from your childhood', 'Một nơi bạn nhớ từ thời thơ ấu', ['where it was', 'what you used to do there', 'how it has changed', 'why it is special to you']),
  // Đồ vật
  t('object-gift', 'objects', 'Describe a gift you gave someone that made them happy', 'Một món quà bạn tặng khiến người nhận vui', ['what the gift was', 'who you gave it to', 'why you chose it', 'how the person reacted']),
  t('object-tech', 'objects', 'Describe a piece of technology you use every day', 'Một thiết bị công nghệ bạn dùng hằng ngày', ['what it is', 'how long you have had it', 'what you use it for', 'how your life would be without it']),
  t('object-book', 'objects', 'Describe a book or film that taught you something', 'Một cuốn sách hoặc bộ phim dạy bạn điều gì đó', ['what it is about', 'when you read or watched it', 'what you learned', 'whether you would recommend it']),
  t('object-photo', 'objects', 'Describe a photo that is important to you', 'Một bức ảnh quan trọng với bạn', ['when and where it was taken', 'who is in it', 'what is happening in it', 'why it matters to you']),
  t('object-clothes', 'objects', 'Describe an item of clothing you enjoy wearing', 'Một món đồ bạn thích mặc', ['what it looks like', 'where you got it', 'when you wear it', 'why you like it']),
  t('object-app', 'objects', 'Describe an app that has made your life easier', 'Một ứng dụng giúp cuộc sống dễ dàng hơn', ['what the app is', 'how you found it', 'how you use it', 'how it has changed your routine']),
  // Sự kiện
  t('event-celebration', 'events', 'Describe a celebration you enjoyed', 'Một dịp ăn mừng bạn thích', ['what was celebrated', 'where it took place', 'who was there', 'why you enjoyed it']),
  t('event-festival', 'events', 'Describe a traditional festival in your country', 'Một lễ hội truyền thống ở nước bạn', ['when it happens', 'how people prepare for it', 'what people do during it', 'what it means to you']),
  t('event-sport', 'events', 'Describe a sports event you watched or took part in', 'Một sự kiện thể thao bạn xem hoặc tham gia', ['what the event was', 'where and when it happened', 'what happened', 'how you felt']),
  t('event-news', 'events', 'Describe a piece of news that surprised you', 'Một tin tức khiến bạn bất ngờ', ['what the news was', 'how you heard about it', 'why it was surprising', 'how people around you reacted']),
  t('event-meal', 'events', 'Describe a memorable meal you had', 'Một bữa ăn đáng nhớ', ['where you had it', 'who you were with', 'what you ate', 'why it was memorable']),
  // Trải nghiệm
  t('exp-skill', 'experiences', 'Describe a skill that took you a long time to learn', 'Một kỹ năng bạn mất nhiều thời gian để học', ['what the skill is', 'when you started learning it', 'why it took so long', 'how you feel about it now']),
  t('exp-decision', 'experiences', 'Describe an important decision you made', 'Một quyết định quan trọng bạn đã đưa ra', ['what the decision was', 'when you made it', 'how you made it', 'how it affected your life']),
  t('exp-mistake', 'experiences', 'Describe a mistake you made and what you learned from it', 'Một lỗi bạn mắc và bài học rút ra', ['what happened', 'why you made the mistake', 'how you fixed it', 'what you learned']),
  t('exp-help', 'experiences', 'Describe a time you helped someone', 'Một lần bạn giúp đỡ ai đó', ['who you helped', 'what the problem was', 'how you helped', 'how you felt afterwards']),
  t('exp-late', 'experiences', 'Describe a time you were late for something important', 'Một lần bạn đến muộn việc quan trọng', ['what you were late for', 'why you were late', 'what happened as a result', 'what you did differently afterwards']),
  t('exp-challenge', 'experiences', 'Describe a challenge you are proud of overcoming', 'Một thử thách bạn tự hào đã vượt qua', ['what the challenge was', 'why it was difficult', 'how you dealt with it', 'why you are proud of it']),
  t('exp-journey', 'experiences', 'Describe a long journey you took', 'Một chuyến đi dài bạn từng đi', ['where you went', 'how you travelled', 'what happened on the way', 'whether you would do it again']),
  t('exp-new', 'experiences', 'Describe the first time you tried something new', 'Lần đầu bạn thử một điều mới', ['what you tried', 'why you decided to try it', 'how it went', 'whether you still do it']),
  t('exp-english', 'experiences', 'Describe a time you used English outside the classroom', 'Một lần bạn dùng tiếng Anh ngoài lớp học', ['where you were', 'who you talked to', 'what was difficult', 'how the experience helped you']),
  // Quan điểm
  t('op-tech-kids', 'opinions', 'Talk about whether children should use smartphones', 'Trẻ em có nên dùng điện thoại thông minh?', ['benefits for children', 'possible dangers', 'what parents can do', 'your own opinion']),
  t('op-online-learning', 'opinions', 'Talk about online learning compared with classroom learning', 'Học trực tuyến so với học trên lớp', ['advantages of online learning', 'what classrooms offer', 'who benefits most from each', 'which you prefer and why']),
  t('op-city-country', 'opinions', 'Talk about living in a city versus the countryside', 'Sống ở thành phố hay nông thôn', ['benefits of city life', 'benefits of country life', 'how young people choose', 'where you would like to live']),
  t('op-environment', 'opinions', 'Talk about something individuals can do to protect the environment', 'Việc mỗi người có thể làm để bảo vệ môi trường', ['what the action is', 'how easy it is to do', 'how much difference it makes', 'whether you do it yourself']),
  t('op-work', 'opinions', 'Talk about what makes a job satisfying', 'Điều gì làm một công việc đáng làm', ['money and security', 'interest and challenge', 'colleagues and environment', 'what matters most to you']),
  t('op-social', 'opinions', 'Talk about how social media has changed friendship', 'Mạng xã hội đã thay đổi tình bạn thế nào', ['how people keep in touch now', 'positive changes', 'negative changes', 'your own experience']),
  t('op-tourism', 'opinions', 'Talk about the effects of tourism on a place', 'Ảnh hưởng của du lịch đến một địa phương', ['economic effects', 'effects on culture', 'effects on the environment', 'how tourism should be managed']),
];
