# IELTS Learn — học tiếng Anh qua video YouTube

Ứng dụng web cá nhân để học tiếng Anh theo hướng IELTS: **shadowing / chép chính tả với video YouTube**, bấm vào từ để tra nghĩa (Google Dịch hoặc **Tencent Hunyuan Hy-MT** dịch theo ngữ cảnh), lưu vào **sổ từ vựng**, ôn bằng **flashcard lặp lại ngắt quãng (FSRS)**, luyện tập nhiều dạng bài và học **26 bộ từ vựng IELTS theo chủ đề** (đã crawl sẵn vào database).

- **Backend**: Node.js 24 + TypeScript + Express 5 + SQLite (`node:sqlite`, không cần build native) — thư mục [backend/](backend/)
- **Frontend**: React 19 + Vite 8 + Tailwind CSS 4 + TanStack Query — thư mục [frontend/](frontend/)

---

## Chạy nhanh

Yêu cầu: **Node.js ≥ 24** (đang dùng `node:sqlite` có sẵn trong Node).

```bash
npm install          # cài cho cả backend và frontend (npm workspaces)
npm run dev          # API: http://127.0.0.1:4000/api  ·  Giao diện: http://localhost:5173
```

Lần chạy đầu, backend tự tạo `backend/data/ielts-learn.db` và nạp bộ từ chủ đề từ `backend/data/seed/topics.json`. Mở trang web → **Tạo tài khoản** (xem mục *Tài khoản & đăng nhập*).

Chạy bản production (một cổng duy nhất):

```bash
npm run build        # build frontend → frontend/dist
npm start            # backend phục vụ cả API lẫn giao diện tại http://127.0.0.1:4000
```

Các lệnh khác: `npm run crawl` (crawl lại bộ từ chủ đề), `npm run seed` (nạp lại seed vào DB), `npm test` (unit test backend), `npm run typecheck`.

Cấu hình tuỳ chọn: sao chép [backend/.env.example](backend/.env.example) thành `backend/.env`. Hầu hết cài đặt (nhà cung cấp dịch, Hy-MT, mục tiêu học…) chỉnh được ngay trong trang **Cài đặt**.

---

## Tài khoản & đăng nhập

- Mọi trang và API (trừ `/api/auth/*`, `/api/health`) đều cần đăng nhập. Mỗi tài khoản có **sổ từ, lịch ôn FSRS, XP/chuỗi ngày, video đã xem, ghi chú và cài đặt riêng**. Bộ từ chủ đề, phụ đề và cache dịch/từ điển dùng chung.
- **Tài khoản đầu tiên** đăng ký sẽ nhận toàn bộ dữ liệu học tạo trước khi có tính năng đăng nhập.
- Mật khẩu băm bằng **scrypt** (salt ngẫu nhiên, so sánh chống timing attack). Phiên đăng nhập là cookie `HttpOnly` + `SameSite=Lax` (thêm `Secure` khi chạy HTTPS); DB chỉ lưu SHA-256 của token. “Ghi nhớ đăng nhập” giữ 30 ngày và tự gia hạn khi còn dùng; không chọn thì là cookie phiên, hết hạn sau 12 giờ không hoạt động.
- Chống CSRF bằng SameSite + kiểm tra header `Origin`; sai mật khẩu 8 lần trong 15 phút sẽ bị khoá 15 phút.
- Đổi tên, đổi mật khẩu (tự đăng xuất các thiết bị khác) và đăng xuất trong **Cài đặt → Tài khoản** hoặc menu avatar.
- Chỉ mình bạn dùng? Đặt `ALLOW_REGISTRATION=false` trong `backend/.env` để khoá đăng ký sau khi tạo tài khoản.

## Cơ sở dữ liệu

**SQLite** — một file `backend/data/ielts-learn.db`, truy cập qua `node:sqlite` có sẵn trong Node 24 (không ORM, SQL thuần, chế độ WAL). Migration đánh số trong [backend/src/db/schema.ts](backend/src/db/schema.ts), tự chạy khi khởi động.

| Nhóm | Bảng |
|---|---|
| Tài khoản | `users`, `sessions` |
| Dữ liệu riêng từng người (`user_id`) | `words`, `review_logs`, `activity`, `practice_sessions`, `user_videos`, `video_notes`, `user_settings` |
| Dùng chung | `topics`, `lexicon`, `topic_words`, `videos` (metadata), `transcripts`, `transcript_sentences`, `translation_cache`, `dictionary_cache` |

Sao lưu: chép file `.db` khi server đã dừng, hoặc chạy `VACUUM INTO` khi đang chạy. Bản sao lưu trước khi nâng cấp lên đăng nhập nằm ở `backend/data/backups/`.

---

## Tính năng

### 1. Khám phá & lướt video như YouTube
- Trang chủ video với **chip danh mục** (IELTS, TED & TED-Ed, Tin tức dễ nghe, Phát âm, Hội thoại, Phim & TV, Khoa học, Diễn thuyết, Podcast…), **cuộn vô hạn**, 17 kênh học tiếng Anh tuyển chọn (BBC Learning English, VOA, TED-Ed, English with Lucy, IELTS Advantage, IELTS Liz, E2 IELTS, Rachel's English…).
- Tìm kiếm có **gợi ý từ khoá**, lọc độ dài, chỉ hiện video có **phụ đề CC chuẩn**; dán link YouTube bất kỳ để mở ngay (hỗ trợ `watch`, `youtu.be`, `shorts`, tham số `t=`).
- Trang kênh, cột **“Tiếp theo”** (video liên quan, tải thêm khi cuộn) để lướt từ video này sang video khác.

### 2. Trang học video (shadowing)
- **Phụ đề karaoke**: từ đang đọc đổi màu theo thời gian thực (timing từng từ với phụ đề tự động của YouTube), phụ đề **song ngữ** Anh–Việt.
- **Transcript** tự cuộn theo video, tìm kiếm trong phụ đề, bấm mốc thời gian để nhảy tới câu; **từ đã lưu được tô màu theo trạng thái** (kiểu LingQ).
- **Bấm vào từ** → popover: phiên âm IPA Anh-Anh/Anh-Mỹ + audio người thật, **nghĩa trong câu** (Hy-MT dịch theo ngữ cảnh, hoặc khớp nghĩa từ điển với bản dịch cả câu), nghĩa theo từ loại, định nghĩa tiếng Anh phù hợp ngữ cảnh, đồng nghĩa → **“Lưu vào sổ từ”** kèm câu gốc + bản dịch + mốc thời gian video. **Bôi đen nhiều từ** để tra cụm từ.
- 3 chế độ:
  - **Xem & tra từ**: tự dừng sau mỗi câu, lặp câu, che phụ đề để luyện nghe, chỉnh tốc độ 0.5×–1.5×.
  - **Shadowing**: nghe câu (lặp N lần) → **ghi âm** → nhận dạng giọng nói (Web Speech API) → **chấm điểm từng từ** (đúng / sai / thiếu), nghe lại giọng mình và bản gốc; chế độ tự động nghe → ghi âm → qua câu khi ≥ 80%; “nói cùng lúc” khi đeo tai nghe.
  - **Chép chính tả** (giống Daily Dictation): nghe câu, gõ lại, gợi ý từng từ, nghe chậm, so khớp có tô màu lỗi; transcript phía sau được làm mờ để không lộ đáp án.
- Ghi chú theo mốc thời gian, lưu video, theo dõi tiến độ xem / số câu shadowing / chính tả; tải lên phụ đề **.srt/.vtt** cho video không có phụ đề.
- Phím tắt: `Space` phát/dừng · `←/→` câu trước/sau · `↑` nghe lại · `A` tự dừng · `L` lặp · `T` song ngữ · `H` che phụ đề · `[ ]` tốc độ · `1/2/3` chế độ · `R` ghi âm · `Ctrl` nghe lại khi đang gõ · `Ctrl+K` tra từ nhanh.

### 3. Sổ từ vựng
- Lọc theo trạng thái (Mới / Đang học / Đang ôn / Thành thạo / **Đã thuộc** / Đến hạn / ⭐), nguồn (video / chủ đề / tự thêm), tag; tìm kiếm, sắp xếp (mới thêm, A→Z, sắp đến hạn, **hay sai nhất**).
- Chi tiết từ: sửa nghĩa, ghi chú/mẹo nhớ, tag; câu ví dụ có **link quay lại đúng giây trong video**; collocation, đồng nghĩa; **“Xuất hiện trong các video bạn đã học”** (giống YouGlish); thống kê ôn tập.
- Thao tác hàng loạt (đã thuộc, đưa lại vào ôn, gắn sao, học lại, xoá); **xuất CSV** và **file nhập cho Anki**.
- Thêm từ thủ công: tự điền IPA, audio, nghĩa, định nghĩa và câu ví dụ có dịch.

### 4. Ôn tập (flashcard FSRS)
- Thuật toán **FSRS** (thế hệ mới của Anki, thư viện `ts-fsrs`): bốn lựa chọn **Quên / Khó / Nhớ / Dễ** hiển thị trước khoảng thời gian ôn tiếp theo; thẻ “Quên” quay lại ngay trong phiên.
- **“Tôi đã thuộc từ này”** → đưa từ ra khỏi lịch ôn; **hoàn tác** (`Z`); chiều thẻ Anh→Việt, Việt→Anh hoặc trộn; tự phát âm; giới hạn số thẻ mới/ngày; tỉ lệ nhớ mong muốn chỉnh được.

### 5. Luyện tập
- Dạng bài: **trắc nghiệm** (chọn nghĩa / chọn từ / theo định nghĩa), **điền từ vào câu ví dụ thật**, **nghe & gõ**, **chính tả từ**, **ghép cặp tính giờ**, **tổng hợp**.
- Nguồn từ: đang học, đến hạn, **hay sai**, mới thêm, gần đây, có sao, theo chủ đề, theo video. Trả lời đúng một từ **đang đến hạn** được tính luôn như một lượt ôn.
- Combo 🔥, màn hình kết quả, danh sách từ sai cần xem lại.

### 6. Bộ từ vựng IELTS theo chủ đề
- 26 chủ đề (Education, Environment, Technology, Health, Work, Crime, Media, Travel, Economy, Society, Family, Cities, Transport, Food, Science, Culture, Sport, Energy, Animals, Business, Space, Language, Shopping, Weather, Personality, Fashion) — **1.163 mục từ** gồm **cụm từ cốt lõi** (collocation hay dùng trong Speaking/Writing) và **từ liên quan** crawl tự động.
- Mỗi từ: IPA (77%), audio người thật, cấp độ CEFR ước lượng (kèm band IELTS tương ứng), nghĩa tiếng Việt theo từ loại, định nghĩa, **câu ví dụ song ngữ** (88%), collocation, đồng/trái nghĩa.
- **Lướt thẻ kiểu Quizlet**: “Đã biết” (đánh dấu đã thuộc) / “Chưa biết” (thêm vào sổ để ôn); thêm từng từ hoặc cả chủ đề; luyện tập theo chủ đề.

### 7. Hôm nay học gì (buổi học có hướng dẫn)
- Mỗi ngày một kế hoạch 5 bước theo khung **“bốn mảng”** (Paul Nation): ôn thẻ đến hạn → nghe một **video vừa sức** → **nói đuổi** 10 câu → **nói lại câu đã lưu** → một lượt **4/3/2**.
- Tiến độ tự đánh dấu từ hoạt động thật trong ngày; bỏ qua từng bước; đổi video (gợi ý theo độ khó); chế độ **ngắn ~20 phút** / **chuẩn ~40 phút**.

### 8. Sổ mẫu câu (học theo cụm)
- Lưu câu hay từ phụ đề (nút dấu trang trên mỗi dòng, phím `B`, hoặc “Lưu câu làm mẫu câu” trong popover tra từ), **chọn cụm cần học** bằng cách bấm từ đầu – từ cuối; gợi ý cụm từ sổ từ, bộ chủ đề và danh sách collocation soạn sẵn.
- Câu và cụm được dịch tự động; thẻ mẫu câu **ôn chung hàng đợi FSRS** với thẻ từ (lọc Tất cả / Từ vựng / Mẫu câu). Mặt trước **phát lại đúng đoạn video gốc** (giọng thật) và che cụm cần học.

### 9. Luyện nói lại (không cần AI chấm)
- **Câu có chỗ trống**: nói cả câu đã lưu, app kiểm tra có nói đúng cụm (chấp nhận dạng chia và động từ bất quy tắc).
- **Nghe – chờ – nói**: nghe đoạn gốc, đếm ngược vài giây rồi nói lại theo trí nhớ, chấm % từ khớp.
- **Tự đặt câu** với từ trong sổ: kiểm tra có dùng từ đó; câu ổn được **lưu làm ví dụ riêng** của từ.
- **Gợi ý tiếng Việt** (tuỳ chọn, cụm ngắn): không so từng chữ, nghe câu gốc rồi tự chấm.
- Mỗi lượt ghi âm để nghe giọng mình cạnh giọng gốc; tự chấm Quên/Khó/Nhớ/Dễ cập nhật lịch ôn của mẫu câu.

### 10. Hồ sơ từ & dùng từ tự nhiên
- Trang `/profile/:từ` (và trong chi tiết từ của sổ): **họ từ** (decide → decision → decisive → decisively), các nghĩa chính, **từ đồng nghĩa kèm định nghĩa chung, độ phổ biến, nhãn văn phong** (trang trọng / thân mật / Anh-Anh…), collocation, câu chứa từ trong video đã xem.
- 4 dạng bài mới: **Collocation** (make/do/take…, phương án sai được chọn tay để chắc chắn sai), **Điền dạng từ** (dùng họ từ WordNet), **Ghép đồng nghĩa**, **Nâng cấp từ cơ bản** (good, big, very, think… → từ thay thế kèm ghi chú sắc thái soạn tay).

### 11. Nói trôi chảy 4/3/2
- Nói cùng một đề 3 lần trong 4 → 3 → 2 phút (hoặc 2 → 1,5 → 1). 40 đề kiểu IELTS Part 2 hoặc tự nhập; 1 phút chuẩn bị, ghi chú.
- Mỗi lượt: ghi âm (lưu ở `backend/data/recordings/`), phụ đề trực tiếp, **tốc độ nói (từ/phút)**, **số lần ngừng dài ≥ 1 giây** (đo từ âm lượng micro), **độ dài đoạn nói liền**, **từ đệm** (um, you know, I mean, kind of…); so sánh các lượt và xu hướng qua các buổi.

### 12. Độ khó video
- Tab **Độ khó** trên trang xem + nhãn trên thẻ video: % số từ bạn đã biết (**Dễ ≥ 98% · Vừa sức 95–98% · Khó < 95%**), số từ mới, **10 từ mới đáng học trước** (Học / Biết rồi).
- “Đã biết” = từ trong danh sách **NGSL** theo trình độ bạn chọn (A2/B1/B2/C1) + từ đã thuộc/đang ôn trong sổ. Mục **“Vừa sức với bạn”** ở trang Khám phá phân tích dần video từ lịch sử và các kênh tuyển chọn.

### 13. Động lực học
- Trang chủ: **chuỗi ngày học (streak)**, XP & cấp độ, **mục tiêu XP mỗi ngày**, biểu đồ XP 7 ngày, **bản đồ nhiệt cả năm**, phân bố trạng thái từ, **dự báo lịch ôn 7 ngày**, **từ của ngày**, video đang xem dở, 10 huy hiệu thành tích.
- XP: ôn thẻ +2 (Quên +1), lưu từ mới +3, câu luyện tập đúng +3 (+5/+10 khi xong phiên), câu shadowing +3, câu chính tả đúng +4, mỗi phút xem video +1.
- Giao diện sáng/tối, responsive (sidebar trên desktop, thanh điều hướng dưới trên mobile), focus ring rõ ràng, điều hướng bằng bàn phím, nhãn ARIA, tôn trọng `prefers-reduced-motion`.

---

## Giải pháp truy cập YouTube

| Việc | Cách làm |
|---|---|
| Tìm kiếm, gợi ý, kênh, video liên quan, phân trang | **InnerTube** — API nội bộ mà chính youtube.com dùng — qua thư viện [`youtubei.js`](https://github.com/LuanRT/YouTube.js). Không cần API key, không bị giới hạn 10.000 đơn vị/ngày như YouTube Data API v3. |
| Phụ đề | Lấy danh sách caption track bằng **client ANDROID/IOS** (URL phụ đề của client WEB hiện yêu cầu PO token nên trả rỗng), tải định dạng `json3` → tách câu: theo dấu câu với phụ đề chuẩn, theo khoảng lặng với phụ đề tự động (giữ timing từng từ). Kết quả được cache trong SQLite. |
| Phát video | **YouTube IFrame Player API** chính thức (nhúng hợp lệ, vẫn tính lượt xem cho tác giả). Phụ đề gốc của YouTube được tắt để app hiển thị phụ đề riêng. |
| Dự phòng | Video không có phụ đề → tải file `.srt/.vtt`. Video bị chủ sở hữu chặn nhúng → hiện nút mở trên YouTube (vẫn đọc phụ đề, tra từ được). |

Lưu ý: InnerTube không phải API công khai nên YouTube có thể thay đổi; khi đó chỉ cần cập nhật `youtubei.js` (`npm update youtubei.js -w backend`). Mọi request đi từ máy bạn, phục vụ học tập cá nhân.

---

## Dịch thuật

| Nguồn | Dùng khi | Ghi chú |
|---|---|---|
| **Tencent Hunyuan Hy-MT** (HY-MT1.5 / Hy-MT2) | Chọn “Hy-MT” hoặc “Tự động” khi đã cấu hình | Dịch **theo ngữ cảnh**: gửi cả câu trong video làm *background*, nên “major” trong “a government major” được dịch là “chuyên ngành”. Prompt theo đúng template trên model card, tham số khuyến nghị (temperature 0.7, top_p 0.6, top_k 20, repetition_penalty 1.05). |
| **Google Dịch** (endpoint `gtx` miễn phí) | Mặc định | Có nghĩa theo từ loại, định nghĩa, ví dụ, đồng nghĩa. Với từ trong câu, app dịch cả câu rồi chọn nghĩa từ điển khớp với bản dịch. |
| **MyMemory** | Tự động khi Google tạm chặn (HTTP 429) | Miễn phí, không cần key (~5.000 ký tự/ngày/IP). |

Mọi bản dịch được cache trong SQLite nên mỗi câu/từ chỉ dịch một lần. Nếu Hy-MT lỗi, app tự chuyển sang dịch máy trong 60 giây.

### Chạy Hy-MT trên máy

Bất kỳ server tương thích OpenAI (`/v1/chat/completions`) đều dùng được — điền **Base URL** và **Model** trong trang Cài đặt rồi bấm **Kiểm tra kết nối**:

```bash
# llama.cpp (khuyến nghị cho HY-MT1.5 GGUF, chạy được trên CPU) → Base URL: http://localhost:8080/v1
llama-server -hf tencent/HY-MT1.5-1.8B-GGUF:Q8_0 --port 8080 --jinja

# Ollama → Base URL: http://localhost:11434/v1, Model: hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0
ollama pull hf.co/tencent/HY-MT1.5-1.8B-GGUF:Q8_0

# vLLM (GPU) với Hy-MT2 → Base URL: http://localhost:8000/v1, Model: tencent/Hy-MT2-7B, mẫu prompt: Hy-MT2
vllm serve tencent/Hy-MT2-7B --port 8000
```

Chọn **mẫu prompt** đúng phiên bản: *HY-MT1.5* cho các bản 1.5, *Hy-MT2* cho các bản 2. Theo model card, bản GGUF của Hy-MT2 cần kernel STQ (PR #22836 của llama.cpp), nên với llama.cpp/Ollama thông thường hãy dùng bản HY-MT1.5 GGUF. Nếu Ollama không nạp được kiến trúc của model, hãy dùng llama.cpp.

---

## Bộ từ chủ đề: crawl & lưu vào database

```bash
npm run crawl                                    # crawl 26 chủ đề → backend/data/seed/topics.json → nạp vào SQLite
npm run crawl -- --topics=education,environment  # chỉ một số chủ đề (gộp vào file seed hiện có)
npm run crawl -- --per-topic=40 --refresh        # nhiều từ liên quan hơn, bỏ qua cache
```

Quy trình ([backend/src/crawler/](backend/src/crawler/)):
1. Mỗi chủ đề có các từ khoá gốc và danh sách cụm từ cốt lõi ([topics.config.ts](backend/src/crawler/topics.config.ts)).
2. **Datamuse API** tìm từ liên quan (`rel_trg` — từ hay xuất hiện cùng chủ đề, `ml` — từ gần nghĩa), lọc theo tần suất và từ loại, gộp biến thể (sciences → science).
3. Làm giàu từng mục: **Free Dictionary API** (IPA, audio, định nghĩa, ví dụ — dữ liệu Wiktionary, CC BY-SA), **Google Dịch** (nghĩa tiếng Việt theo từ loại), **Datamuse** (collocation: tính từ đi với danh từ, danh từ đi với động từ…), **Wikipedia** (câu ví dụ cho cụm từ học thuật). IPA của cụm từ được ghép từ IPA từng từ.
4. Dịch câu ví dụ sang tiếng Việt theo lô; mọi phản hồi được cache trên đĩa (`backend/data/crawl-cache/`) và có giới hạn tốc độ để lịch sự với các API miễn phí.

Trang *The IELTS Dictionary* là sản phẩm có đăng nhập nên không crawl trực tiếp; app tái tạo mô hình “từ vựng theo chủ đề” của họ từ các nguồn mở trên. Oxford Learner's Dictionaries chặn rõ ràng các bot AI trong `robots.txt` nên cũng không dùng.

---

## Cấu trúc thư mục

```
backend/
  src/
    index.ts                 Express app, phục vụ /api và bản build frontend
    config.ts                cấu hình (.env tuỳ chọn)
    db/                      SQLite: schema, migration, seed
    routes/index.ts          REST API (cần đăng nhập)
    routes/auth.ts           đăng ký / đăng nhập / phiên, chống CSRF
    lib/context.ts           người dùng của request hiện tại (AsyncLocalStorage)
    services/
      auth.service.ts        mật khẩu scrypt, phiên, khoá khi sai nhiều lần
      youtube.service.ts     feed / tìm kiếm / kênh / liên quan (youtubei.js, phân trang)
      transcript.service.ts  phụ đề json3 → câu + timing từng từ, SRT/VTT, tìm câu chứa từ
      translate/             google.ts · hymt.ts · mymemory.ts · index.ts (chọn nguồn, cache, fallback)
      lookup.service.ts      tra từ: từ điển + dịch + nghĩa theo ngữ cảnh
      words.service.ts       sổ từ vựng
      review.service.ts      FSRS: hàng đợi, chấm điểm, hoàn tác, dự báo
      practice.service.ts    sinh câu hỏi luyện tập
      practice-extra.service.ts  collocation, dạng từ, đồng nghĩa, nâng cấp từ
      phrases.service.ts     sổ mẫu câu + FSRS + gợi ý cụm
      speaking.service.ts    luyện nói lại (kiểm tra cụm / từ trong câu nói)
      fluency.service.ts     4/3/2: buổi luyện, lượt nói, ghi âm
      profile.service.ts     hồ sơ từ (WordNet + Datamuse + Wiktionary)
      difficulty.service.ts  độ khó video, hàng đợi phân tích nền, gợi ý video vừa sức
      today.service.ts       kế hoạch “Hôm nay học gì”
      topics.service.ts      bộ từ chủ đề
      stats.service.ts       streak, XP, heatmap, thành tích
    lib/wordnet.ts           đọc WordNet offline: nghĩa, đồng nghĩa, họ từ
    lib/ngsl.ts, coverage.ts danh sách NGSL, tính độ phủ từ vựng
    lib/fluency.ts           đếm từ đệm, chỉ số trôi chảy
    data/                    collocation, nâng cấp từ, đề nói 4/3/2 (soạn tay)
    crawler/                 crawler bộ từ chủ đề
  data/seed/topics.json      dữ liệu chủ đề đã crawl (nạp tự động lần đầu)
  data/ngsl/                 New General Service List 1.2 (CC BY-SA 4.0)
frontend/
  src/
    pages/                   Dashboard, Today, Explore, Channel, Library, Notebook, Phrases, Review, Topics, TopicDetail, WordProfilePage, Settings
    pages/speaking/          luyện nói lại
    pages/fluency/           4/3/2
    pages/watch/             trang học video: player, phụ đề, transcript, shadowing, chép chính tả
    pages/practice/          hub, phiên luyện tập, trò ghép cặp
    components/              UI cơ bản, layout, thẻ video, popover tra từ, biểu đồ
    hooks/                   YouTube player, nhận dạng giọng nói, ghi âm, phím tắt
    lib/                     API client, kiểu dữ liệu, so khớp từ (diff), phát âm
```

## API chính

| Nhóm | Endpoint |
|---|---|
| Tài khoản | `GET /api/auth/status` · `GET /auth/me` · `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `PATCH /auth/me` · `POST /auth/password` |
| YouTube | `GET /api/youtube/feed?chip=` · `/search?q=&duration=&captions=` · `/suggest` · `/channels` · `/channels/:id/videos` · `/videos/:id` · `/related?cursor=` · `GET/POST/DELETE /videos/:id/transcript` |
| Video của tôi | `GET /api/videos?filter=history|saved` · `POST /videos/:id/progress` · `PUT /videos/:id/saved` · `POST /videos/:id/practice` · `GET/POST/DELETE /videos/:id/notes` |
| Dịch & tra | `GET /api/lookup?term=&context=` · `POST /translate` · `POST /translate/batch` · `GET /translate/providers` · `POST /translate/hymt/test` |
| Sổ từ | `GET/POST /api/words` · `GET /words/keys` · `GET/PATCH/DELETE /words/:id` · `POST /words/:id/reset` · `POST /words/bulk` · `GET /words/:id/occurrences` · `GET /words/export?format=csv|anki` |
| Ôn tập | `GET /api/review/queue` · `POST /review/:id {rating}` · `POST /review/undo` · `GET /review/summary` |
| Luyện tập | `GET /api/practice/session?mode=&source=&count=` · `POST /practice/answer` · `POST /practice/complete` |
| Chủ đề | `GET /api/topics` · `GET /topics/:slug` · `POST /topics/:slug/words` · `GET /lexicon/:id` |
| Mẫu câu | `GET/POST /api/phrases` · `GET /phrases/suggest?sentence=` · `GET /phrases/video/:videoId` · `PATCH/DELETE /phrases/:id` · `POST /phrases/:id/review` |
| Luyện nói | `GET /api/speaking/session?mode=cloze|delayed|own|vi` · `POST /speaking/attempts` · `POST /speaking/own-example` · `GET /speaking/stats` |
| 4/3/2 | `GET /api/fluency/topics` · `GET/POST /fluency/sessions` · `GET/PATCH/DELETE /fluency/sessions/:id` · `POST /fluency/sessions/:id/rounds` · `PUT/GET /fluency/rounds/:id/audio` |
| Hồ sơ từ | `GET /api/words/profile/:term` · `GET /practice/upgrades` |
| Độ khó video | `GET /api/videos/:id/difficulty` · `POST /videos/difficulty {ids}` · `GET /videos/recommended` |
| Hôm nay | `GET /api/today` · `POST /today/skip` · `PUT /today/video` |
| Khác | `GET /api/stats/overview` · `GET/PUT /api/settings` · `GET /api/health` |

## Ghi chú

- Dữ liệu của mọi tài khoản nằm trong `backend/data/ielts-learn.db` (SQLite); sao lưu file này là đủ.
- Nhận dạng giọng nói để chấm shadowing cần **Chrome hoặc Edge**; trình duyệt khác vẫn ghi âm để tự nghe lại.
- Cấp độ CEFR của từ được ước lượng từ tần suất xuất hiện (Google Books Ngram qua Datamuse) — mang tính tham khảo.
- Nguồn dữ liệu cho phần cách dùng từ: **WordNet 3.1** (Princeton, gói `wordnet-db`, chạy offline), **Datamuse API**, **Wiktionary** (CC BY-SA, nhãn văn phong), **NGSL 1.2** (Browne, Culligan & Phillips, CC BY-SA 4.0 — xem `backend/data/ngsl/README.md`). Danh sách collocation, nâng cấp từ và đề nói 4/3/2 do app tự soạn.
- Ghi âm 4/3/2 nằm trong `backend/data/recordings/<id người dùng>/` (không commit); xoá buổi luyện sẽ xoá luôn file ghi âm.
