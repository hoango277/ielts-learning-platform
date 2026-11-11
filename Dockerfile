# syntax=docker/dockerfile:1.7
#
# IELTS Learn — một image chạy cả API lẫn giao diện (Express phục vụ bản build React) trên cổng 4000.
# Dữ liệu (SQLite, ghi âm) nằm trong /data → gắn volume để không mất khi cập nhật image.
#
#   docker build -t xuanhoa2772004/ielts-learn .
#   docker run -d -p 4000:4000 -v ielts-data:/data xuanhoa2772004/ielts-learn
#
# Các bước cài đặt/build chạy trên kiến trúc của máy build ($BUILDPLATFORM): mọi dependency đều là
# JavaScript thuần (SQLite có sẵn trong Node), nên node_modules dùng được cho cả amd64 lẫn arm64.

ARG NODE_IMAGE=node:24-bookworm-slim

# ---------- 1. Cài toàn bộ dependency để build ----------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---------- 2. Build giao diện (kiểm tra kiểu + Vite) ----------
FROM deps AS build
COPY backend backend
COPY frontend frontend
RUN npm run build

# ---------- 3. Chỉ dependency production của backend ----------
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace backend --no-audit --no-fund

# ---------- 4. Image chạy ----------
FROM ${NODE_IMAGE} AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="IELTS Learn" \
      org.opencontainers.image.description="Học tiếng Anh qua video YouTube: shadowing, sổ từ vựng, ôn tập FSRS, luyện nói, bộ từ IELTS theo chủ đề" \
      org.opencontainers.image.source="https://github.com/hoango277/ielts-learning-platform" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DB_PATH=/data/ielts-learn.db \
    TZ=Asia/Ho_Chi_Minh \
    APP_VERSION=${VERSION}

WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node backend/package.json ./backend/
COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node backend/data/seed ./backend/data/seed
COPY --chown=node:node backend/data/ngsl ./backend/data/ngsl
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist
RUN mkdir -p /data && chown node:node /data

USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Node 24 chạy thẳng file TypeScript (bỏ kiểu khi nạp) — không cần bước biên dịch hay tsx
CMD ["node", "--disable-warning=ExperimentalWarning", "backend/src/index.ts"]
