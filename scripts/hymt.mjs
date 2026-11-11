#!/usr/bin/env node
/**
 * Hy-MT (model dịch chạy trên máy) cho môi trường phát triển.
 *   node scripts/hymt.mjs download   → tải model GGUF (~1,1 GB) về tools/llm/ nếu chưa có
 *   node scripts/hymt.mjs serve      → chạy llama-server ở cổng 8080 (bản cài sẵn, hoặc Docker nếu không có)
 * Biến môi trường: HYMT_DIR (thư mục model), HYMT_PORT (mặc định 8080), LLAMA_SERVER (đường dẫn llama-server).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MODEL_FILE = 'HY-MT1.5-1.8B-Q4_K_M.gguf';
export const MODEL_URL = `https://huggingface.co/tencent/HY-MT1.5-1.8B-GGUF/resolve/main/${MODEL_FILE}`;
export const MODEL_SIZE = 1133080512;
/** Bản llama.cpp server chính thức (ghcr.io/ggml-org), cố định để chạy giống nhau ở mọi nơi */
export const LLAMA_IMAGE = 'ghcr.io/ggml-org/llama.cpp:server-b11946';
export const DIR = path.resolve(process.env.HYMT_DIR ?? path.join(ROOT, 'tools', 'llm'));
export const PORT = Number(process.env.HYMT_PORT ?? 8080);
export const MODEL_PATH = path.join(DIR, MODEL_FILE);
const SERVER_ARGS = ['--jinja', '-c', '4096', '-np', '2', '--alias', 'hy-mt'];

const mb = (n) => `${(n / 1048576).toFixed(0)} MB`;

export async function download() {
  if (fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size === MODEL_SIZE) {
    console.log(`[hymt] model đã có: ${MODEL_PATH}`);
    return MODEL_PATH;
  }
  fs.mkdirSync(DIR, { recursive: true });
  const part = `${MODEL_PATH}.part`;
  console.log(`[hymt] đang tải ${MODEL_FILE} (${mb(MODEL_SIZE)}) từ HuggingFace…`);
  const res = await fetch(MODEL_URL, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Tải model lỗi: HTTP ${res.status}`);
  let done = 0;
  let last = 0;
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => {
    done += chunk.length;
    if (Date.now() - last > 2000) {
      last = Date.now();
      process.stdout.write(`\r[hymt] ${mb(done)} / ${mb(MODEL_SIZE)} (${((done / MODEL_SIZE) * 100).toFixed(0)}%)   `);
    }
  });
  await pipeline(body, fs.createWriteStream(part));
  process.stdout.write('\n');
  if (fs.statSync(part).size !== MODEL_SIZE) throw new Error('File model tải về không đủ dung lượng — hãy chạy lại.');
  fs.renameSync(part, MODEL_PATH);
  console.log(`[hymt] đã lưu ${MODEL_PATH}`);
  return MODEL_PATH;
}

function findBinary() {
  const exe = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  const candidates = [process.env.LLAMA_SERVER, path.join(DIR, 'llama', exe), path.join(DIR, exe)].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const onPath = spawnSync(exe, ['--version'], { stdio: 'ignore' });
  return onPath.status === 0 ? exe : null;
}

const hasDocker = () => spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

export async function waitHealthy(timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return true;
    } catch {
      /* chưa sẵn sàng */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/** Chạy llama-server; trả về tiến trình con và hàm dừng. */
export async function serve() {
  await download();
  const bin = findBinary();
  let child;
  let stop;
  if (bin) {
    console.log(`[hymt] chạy ${bin} ở cổng ${PORT}`);
    child = spawn(bin, ['-m', MODEL_PATH, '--host', '127.0.0.1', '--port', String(PORT), ...SERVER_ARGS], { stdio: 'inherit' });
    stop = () => child.kill();
  } else if (hasDocker()) {
    console.log(`[hymt] không thấy llama-server trên máy → chạy bằng Docker (${LLAMA_IMAGE})`);
    const name = 'ielts-hymt-dev';
    spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
    child = spawn(
      'docker',
      ['run', '--rm', '--name', name, '-p', `127.0.0.1:${PORT}:8080`, '-v', `${DIR}:/models:ro`, LLAMA_IMAGE, '-m', `/models/${MODEL_FILE}`, '--host', '0.0.0.0', '--port', '8080', ...SERVER_ARGS],
      { stdio: 'inherit' },
    );
    stop = () => spawnSync('docker', ['stop', name], { stdio: 'ignore' });
  } else {
    throw new Error(
      'Không tìm thấy llama-server và Docker. Cài một trong hai: tải llama.cpp tại https://github.com/ggml-org/llama.cpp/releases ' +
        '(giải nén vào tools/llm/llama/), "brew install llama.cpp" (macOS), hoặc cài Docker.',
    );
  }
  child.on('exit', (code) => code && console.error(`[hymt] llama-server dừng (mã ${code})`));
  if (!(await waitHealthy())) {
    stop();
    throw new Error('llama-server không sẵn sàng sau 3 phút.');
  }
  console.log(`[hymt] sẵn sàng: http://127.0.0.1:${PORT}/v1 (model "hy-mt")`);
  return { child, stop };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] ?? 'serve';
  try {
    if (cmd === 'download') await download();
    else if (cmd === 'serve') {
      const { stop } = await serve();
      for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => (stop(), process.exit(0)));
    } else {
      console.error('Dùng: node scripts/hymt.mjs [download|serve]');
      process.exit(1);
    }
  } catch (err) {
    console.error(`[hymt] ${err.message}`);
    process.exit(1);
  }
}
