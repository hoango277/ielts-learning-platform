# IELTS Learn — hướng dẫn làm việc với repo

App học tiếng Anh qua video YouTube (shadowing, sổ từ, ôn tập FSRS, luyện nói, bộ từ IELTS theo chủ đề). Monorepo npm workspaces:

- `backend/` — Node 24 + TypeScript, Express 5, SQLite qua `node:sqlite`. Dev chạy bằng `tsx`; production chạy thẳng file `.ts` bằng `node` (strip-types).
- `frontend/` — React 19, Vite 8, Tailwind CSS 4, TanStack Query, react-router 7, zustand.
- Giao diện, chú thích trong code, commit message và README viết bằng **tiếng Việt**.

## Lệnh

| Việc | Lệnh |
|---|---|
| Chạy dev (API :4000, web :5173) | `npm run dev` |
| Dev kèm model dịch Hy-MT | `npm run dev:hymt` |
| Kiểm tra kiểu / unit test / build | `npm run typecheck` · `npm test` · `npm run build` |
| Docker | `npm run docker:build` · `docker compose up -d` (thêm `-f docker-compose.hymt.yml` để kèm Hy-MT) |

## Quy ước code

- **Backend chạy `.ts` trực tiếp bằng Node**: không dùng parameter properties (`constructor(private x: T)`), `enum`, `namespace`; import nội bộ luôn kèm đuôi `.ts`.
- **Migration DB**: thêm phần tử mới vào cuối mảng `MIGRATIONS` trong `backend/src/db/schema.ts` (id tăng dần, không sửa migration đã phát hành). Bảng có cột `user_id` → thêm vào `USER_TABLES`.
- **Thuật ngữ khó trên giao diện** (FSRS, collocation, CEFR, 4/3/2…): bọc bằng `<Term k="...">` hoặc `<Term k="..." icon />` (`frontend/src/components/ui/Term.tsx`) và thêm/cập nhật mục giải thích trong `frontend/src/lib/glossary.ts`. Viết câu chữ tiếng Việt dễ hiểu, không để thuật ngữ trần. Không đặt `Term` bên trong `<button>`/`<a>`.
- **Design system** ở `frontend/src/index.css`: `card`, `card-hover` (chỉ cho thẻ bấm được), `press` + biến `--edge` (nút/khối “nổi”, bấm lún xuống), `icon-tile`, `stagger`, `font-display` (Nunito, tiêu đề/nút), `font-ipa` (phiên âm), `glass`, `shadow-soft/card/lift/glow`. Dùng lại các tiện ích này thay vì tự chế bóng đổ/hiệu ứng mới.
- CSS có tiền tố trình duyệt: **chỉ viết thuộc tính chuẩn** (vd. `backdrop-filter`) — trình build tự thêm `-webkit-`; viết tay cả hai thì bản rút gọn có thể chỉ giữ bản `-webkit-`.
- Lưới responsive phải có cột gốc: `grid grid-cols-1 sm:grid-cols-2 …` (thiếu `grid-cols-1`, nội dung không xuống dòng sẽ làm trang tràn ngang trên điện thoại).
- Phần tử tự xử lý phím Enter/Space phải `stopPropagation` để không kích hoạt phím tắt toàn trang (`useHotkeys`).

## Kiểm thử

- Trước mỗi commit: `npm run typecheck && npm test && npm run build` phải qua hết.
- Thử giao diện / E2E bằng một server riêng với **bản sao DB** (vd. `DB_PATH=<thư mục tạm>/test.db PORT=4100 npx tsx backend/src/index.ts` sau khi `npm run build`). Không tạo tài khoản thử hay dữ liệu rác trong DB thật `backend/data/ielts-learn.db`.
- Kiểm tra cả desktop, điện thoại (390px, không tràn ngang) và giao diện tối.
- Push API không chạy trong trình duyệt ẩn danh → thử Web Push bằng hồ sơ trình duyệt thường (Playwright `launchPersistentContext`).

## Quy trình phát hành — BẮT BUỘC mỗi lần phát hành tính năng mới

Khi hoàn thành một tính năng (hoặc người dùng yêu cầu phát hành), làm **đủ và đúng thứ tự** các bước sau, không bỏ bước nào:

1. **Phiên bản (semver)** — tăng `version` trong `package.json` (gốc), `backend/package.json`, `frontend/package.json`. Có tính năng mới → tăng số giữa (1.1.0 → 1.2.0); chỉ sửa lỗi → tăng số cuối (1.1.0 → 1.1.1). Chạy `npm install` để `package-lock.json` cập nhật theo.
2. **Kiểm tra** — `npm run typecheck && npm test && npm run build` qua hết; chạy thử các trang bị ảnh hưởng (desktop, điện thoại, giao diện tối).
3. **Tài liệu** — cập nhật `README.md` (mục Tính năng, API, Cấu trúc thư mục, biến môi trường, hướng dẫn chạy/deploy); cập nhật `backend/.env.example`, `.env.docker.example` và `docker-compose.yml` nếu thêm/đổi biến môi trường; thêm mục vào `frontend/src/lib/glossary.ts` nếu có thuật ngữ mới.
4. **Commit** lên nhánh `main` (git identity đã đặt sẵn trong repo: `hoango277` / `xuanhoa2772004@gmail.com`), message tiếng Việt tóm tắt thay đổi.
5. **Build & đẩy image đa nền tảng lên Docker Hub**:
   ```bash
   V=X.Y.Z
   docker buildx build --platform linux/amd64,linux/arm64 \
     --build-arg VERSION=$V --build-arg REVISION=$(git rev-parse --short HEAD) \
     -t xuanhoa2772004/ielts-learn:$V -t xuanhoa2772004/ielts-learn:latest --push .
   ```
6. **Chạy thử đúng image vừa đẩy** bằng Docker Compose ở project và cổng riêng (không đụng dữ liệu thật):
   ```bash
   IELTS_TAG=$V IELTS_PORT=4300 docker compose -p ielts-smoke pull app
   IELTS_TAG=$V IELTS_PORT=4300 docker compose -p ielts-smoke up -d --no-build
   curl -s http://localhost:4300/api/health      # phải thấy "version":"X.Y.Z"
   IELTS_TAG=$V IELTS_PORT=4300 docker compose -p ielts-smoke down -v
   ```
7. **Gắn tag và đẩy lên GitHub**: `git tag v$V && git push origin main --tags` (remote: https://github.com/hoango277/ielts-learning-platform).
8. **Báo lại** cho người dùng: phiên bản, tag image trên Docker Hub, commit/tag trên GitHub, những gì đã thay đổi và kết quả kiểm tra.

Lưu ý khi phát hành:

- Không bao giờ tự nhập, đọc hay in mật khẩu/token/file đăng nhập (vd. `~/.docker/config.json`). Docker Hub dùng phiên `docker login` có sẵn (tài khoản `xuanhoa2772004`); GitHub dùng Git Credential Manager. Nếu push báo chưa đăng nhập → dừng lại và nhờ người dùng tự đăng nhập.
- Cách deploy duy nhất được hỗ trợ là **Docker Compose** (repo không dùng Helm/Kubernetes).
