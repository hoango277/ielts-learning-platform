/**
 * Cảnh 3D "4 kỹ năng IELTS" cho trang đăng nhập: sách (Đọc), tai nghe (Nghe), bong bóng thoại (Nói), bút chì (Viết),
 * khối chữ cái và mũ tốt nghiệp bay nhẹ, nghiêng theo con trỏ. Dựng hoàn toàn bằng hình khối của three.js (không tải model).
 *
 * Tiết kiệm tài nguyên:
 * - Chỉ vẽ khi khung hình đang hiển thị (IntersectionObserver) và tab đang mở; tối đa 60 khung hình/giây.
 * - Không tương tác 8 giây → còn ~30 khung hình/giây; 20 giây → dừng hẳn (rê chuột lại thì chạy tiếp). Máy chậm thì tự hạ độ phân giải.
 * - Người dùng bật "giảm chuyển động": chỉ vẽ một khung tĩnh.
 */
import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TorusGeometry,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Bảng màu "Mực ngọc" (khớp token trong index.css)
const C = {
  teal300: '#86d3c2',
  teal400: '#4bb3a5',
  teal600: '#227f77',
  teal700: '#1d6f68',
  orange400: '#f09455',
  orange500: '#e68240',
  amber300: '#f1d67d',
  amber400: '#e7c351',
  rose400: '#ed7d6c',
  sky400: '#7fb5d2',
  paper: '#fffdf7',
  paperShade: '#efe9da',
  ink: '#2a2928',
  inkSoft: '#9f9d96',
  wood: '#f1d6ad',
  metal: '#c9c6bd',
};

export interface StudySceneOptions {
  /** Bản gọn cho màn hình nhỏ: ít vật thể hơn */
  compact?: boolean;
  /** Bật "giảm chuyển động": vẽ một khung tĩnh */
  reducedMotion?: boolean;
  /** Gọi khi khung hình đầu tiên đã vẽ xong (để làm hiện dần canvas) */
  onReady?: () => void;
}

export interface StudySceneHandle {
  dispose: () => void;
}

const mat = (color: string, roughness = 0.55, metalness = 0) => new MeshStandardMaterial({ color, roughness, metalness });

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const DISPLAY_FONT = '"Nunito Variable", Nunito, "Be Vietnam Pro", system-ui, sans-serif';

function makeBook() {
  const g = new Group();
  g.add(new Mesh(new RoundedBoxGeometry(2.3, 0.1, 1.6, 3, 0.04), mat(C.teal600)));
  const spine = new Mesh(new CylinderGeometry(0.07, 0.07, 1.58, 16), mat(C.teal700));
  spine.rotation.x = Math.PI / 2;
  spine.position.y = 0.05;
  g.add(spine);
  for (const side of [-1, 1]) {
    const pages = new Mesh(new RoundedBoxGeometry(1.08, 0.16, 1.48, 3, 0.05), mat(C.paper, 0.85));
    pages.position.set(side * 0.56, 0.13, 0);
    pages.rotation.z = side * -0.09;
    // Các dòng chữ trên trang
    for (let i = 0; i < 5; i++) {
      const len = i === 4 ? 0.42 : 0.74;
      const line = new Mesh(new BoxGeometry(len, 0.01, 0.055), mat(i === 0 ? C.teal400 : C.inkSoft, 0.9));
      line.position.set(-0.37 + len / 2 - 0.0, 0.082, -0.5 + i * 0.24);
      pages.add(line);
    }
    g.add(pages);
  }
  return g;
}

function makeHeadphones() {
  const g = new Group();
  g.add(new Mesh(new TorusGeometry(0.72, 0.085, 16, 48, Math.PI), mat(C.orange500, 0.45)));
  for (const side of [-1, 1]) {
    const cup = new Mesh(new CylinderGeometry(0.3, 0.3, 0.26, 32), mat(C.teal700, 0.5));
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * 0.76, -0.04, 0);
    const pad = new Mesh(new TorusGeometry(0.21, 0.075, 12, 32), mat(C.ink, 0.9));
    pad.rotation.y = Math.PI / 2;
    pad.position.set(side * 0.6, -0.04, 0);
    g.add(cup, pad);
  }
  return g;
}

function makeBubble(textTexture: Texture) {
  const g = new Group();
  const m = mat(C.paper, 0.7);
  g.add(new Mesh(new RoundedBoxGeometry(1.75, 1.05, 0.34, 4, 0.16), m));
  const tail = new Mesh(new ConeGeometry(0.17, 0.46, 24), m);
  tail.rotation.z = Math.PI - 0.55;
  tail.position.set(-0.46, -0.62, 0);
  g.add(tail);
  const label = new Mesh(new PlaneGeometry(1.5, 0.75), new MeshStandardMaterial({ map: textTexture, transparent: true, roughness: 0.8 }));
  label.position.z = 0.172;
  g.add(label);
  return g;
}

function makePencil() {
  const g = new Group();
  g.add(new Mesh(new CylinderGeometry(0.13, 0.13, 1.9, 6), mat(C.amber400, 0.45)));
  const wood = new Mesh(new ConeGeometry(0.13, 0.36, 6), mat(C.wood, 0.85));
  wood.rotation.x = Math.PI;
  wood.position.y = -1.13;
  const lead = new Mesh(new ConeGeometry(0.046, 0.12, 12), mat(C.ink, 0.6));
  lead.rotation.x = Math.PI;
  lead.position.y = -1.25;
  const ferrule = new Mesh(new CylinderGeometry(0.136, 0.136, 0.16, 24), mat(C.metal, 0.35, 0.6));
  ferrule.position.y = 1.03;
  const eraser = new Mesh(new CylinderGeometry(0.13, 0.13, 0.18, 24), mat(C.rose400, 0.7));
  eraser.position.y = 1.2;
  g.add(wood, lead, ferrule, eraser);
  return g;
}

function letterTexture(letter: string, bg: string, fg: string) {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(26, 26, 204, 204, 30);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = `900 150px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 128, 140);
  });
}

function makeBlock(letter: string, bg: string, fg: string, size = 0.8) {
  return new Mesh(new RoundedBoxGeometry(size, size, size, 4, size * 0.12), new MeshStandardMaterial({ map: letterTexture(letter, bg, fg), roughness: 0.55 }));
}

function makeCap() {
  const g = new Group();
  const ink = mat(C.ink, 0.6);
  const board = new Mesh(new RoundedBoxGeometry(1.5, 0.08, 1.5, 2, 0.03), ink);
  board.rotation.y = Math.PI / 4;
  const base = new Mesh(new CylinderGeometry(0.5, 0.58, 0.42, 32), ink);
  base.position.y = -0.24;
  const button = new Mesh(new SphereGeometry(0.07, 16, 12), mat(C.orange400, 0.5));
  button.position.y = 0.06;
  const cord = new Mesh(new CylinderGeometry(0.02, 0.02, 0.62, 8), mat(C.orange400, 0.6));
  cord.rotation.z = Math.PI / 2;
  cord.position.set(0.31, 0.06, 0);
  const tassel = new Mesh(new CylinderGeometry(0.035, 0.06, 0.42, 12), mat(C.orange500, 0.7));
  tassel.position.set(0.62, -0.15, 0);
  g.add(board, base, button, cord, tassel);
  return g;
}

interface Floater {
  obj: Group | Mesh;
  base: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  phase: number;
  amp: number;
  spin: number;
}

export function createStudyScene(container: HTMLElement, opts: StudySceneOptions = {}): StudySceneHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity .8s ease';
  container.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.add(new HemisphereLight('#fff8ec', '#9fc9c2', 1.5));
  const sun = new DirectionalLight('#ffffff', 2.1);
  sun.position.set(-3, 5, 6);
  scene.add(sun);

  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  const root = new Group();
  scene.add(root);

  const bubbleText = canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = C.teal700;
    ctx.font = `900 132px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Hello!', 256, 136);
  });

  const floaters: Floater[] = [];
  const place = (obj: Group | Mesh, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, scale = 1) => {
    obj.position.set(x, y, z);
    obj.rotation.set(rx, ry, rz);
    obj.scale.setScalar(scale);
    root.add(obj);
    floaters.push({ obj, base: { x, y, z, rx, ry, rz }, phase: floaters.length * 1.7, amp: 0.06 + (floaters.length % 3) * 0.025, spin: 0.08 + (floaters.length % 2) * 0.05 });
  };

  if (opts.compact) {
    place(makeBook(), 0, -0.35, 0, 0.6, -0.25, 0, 0.9);
    place(makeBubble(bubbleText), -2.05, 0.55, -0.2, 0.05, 0.3, 0.06, 0.85);
    place(makePencil(), 2.3, -0.15, 0.2, 0.25, 0, 0.95, 0.85);
    place(makeBlock('A', C.orange400, C.paper, 0.62), 0.95, 1.1, -0.5, 0.45, 0.6, 0.1);
  } else {
    place(makeBook(), 0.1, -0.25, 0, 0.62, -0.3, 0);
    place(makeBubble(bubbleText), -2.05, 1.35, -0.3, 0.05, 0.28, 0.06);
    place(makeHeadphones(), 2.25, 1.15, -0.2, 0.2, -0.45, -0.22);
    place(makePencil(), 2.35, -1.25, 0.3, 0.2, 0, 0.92, 0.9);
    place(makeBlock('A', C.orange400, C.paper), -2.4, -1.25, 0.25, 0.42, 0.62, 0.05);
    place(makeBlock('B', C.teal400, C.paper, 0.66), -1.45, -1.75, 0.7, 0.3, -0.5, 0.12);
    place(makeBlock('C', C.amber400, C.teal700, 0.56), -3.15, -0.15, -0.6, -0.3, 0.4, -0.2);
    place(makeCap(), 0.35, 1.85, -0.7, 0.38, 0.2, -0.08, 0.9);
  }
  // Vài ngôi sao nhỏ lấp lánh
  const sparkleGeo = new OctahedronGeometry(0.075, 0);
  const sparkleMats = [mat(C.amber300, 0.3), mat(C.teal300, 0.3), mat(C.paper, 0.3)];
  const SPARKLES = opts.compact
    ? [[-0.9, 1.1, 0.4], [1.0, -1.0, 0.5], [-1.2, -1.0, 0.6]]
    : [[-0.85, 2.0, 0.3], [1.35, 0.35, 0.9], [-1.2, 0.2, 0.9], [3.1, 0.2, 0.2], [1.1, -2.0, 0.4], [-3.3, 1.5, -0.4]];
  for (const [i, [x, y, z]] of SPARKLES.entries()) place(new Mesh(sparkleGeo, sparkleMats[i % 3]), x, y, z, 0.4, 0.4, 0);

  // ---- Kích thước & camera: luôn vừa cụm vật thể (rộng ~7.6 đơn vị, cao ~4.8) ----
  const fit = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const halfV = (camera.fov * Math.PI) / 360;
    const needW = opts.compact ? 6.4 : 7.4;
    const needH = opts.compact ? 3.2 : 4.6;
    const distW = needW / 2 / (Math.tan(halfV) * camera.aspect);
    const distH = needH / 2 / Math.tan(halfV);
    camera.position.set(0, 0, Math.max(distW, distH) + 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  fit();

  // ---- Con trỏ: cả cụm nghiêng nhẹ theo chuột ----
  const pointer = { x: 0, y: 0 };
  let lastInteract = performance.now();
  const onPointer = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    pointer.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    lastInteract = performance.now();
    wake();
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const start = performance.now();
  const pose = (now: number) => {
    const t = (now - start) / 1000;
    // Xuất hiện: phóng to nhẹ từ 0.86 → 1 trong 0.9 giây (easeOutBack)
    const k = Math.min(1, t / 0.9);
    const ease = opts.reducedMotion ? 1 : 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    root.scale.setScalar(0.86 + 0.14 * ease);
    root.rotation.y += (pointer.x * 0.28 - root.rotation.y) * 0.06;
    root.rotation.x += (pointer.y * 0.16 - root.rotation.x) * 0.06;
    for (const f of floaters) {
      const s = Math.sin(t * 0.9 + f.phase);
      f.obj.position.y = f.base.y + s * f.amp;
      f.obj.rotation.y = f.base.ry + Math.sin(t * 0.55 + f.phase) * f.spin;
      f.obj.rotation.z = f.base.rz + Math.cos(t * 0.45 + f.phase) * f.spin * 0.5;
    }
  };

  // ---- Vòng lặp vẽ có tiết chế ----
  let raf = 0;
  let visible = true;
  let last = 0;
  let ready = false;
  const slowFrames: number[] = [];
  const frame = (now: number) => {
    raf = 0;
    if (!visible || document.hidden) return;
    const idle = now - lastInteract > 8000;
    const minGap = idle ? 32 : 15.5; // ~30 fps khi để yên, ~60 fps khi đang rê chuột
    if (now - last >= minGap) {
      const dt = last ? now - last : 16;
      last = now;
      pose(now);
      renderer.render(scene, camera);
      if (!ready) {
        ready = true;
        canvas.style.opacity = '1';
        opts.onReady?.();
      }
      // Máy chậm (khung hình > 40ms liên tục) → hạ độ phân giải một lần
      slowFrames.push(dt);
      if (slowFrames.length > 45) slowFrames.shift();
      if (dpr > 1 && slowFrames.length === 45 && slowFrames.reduce((a, b) => a + b, 0) / 45 > 40) {
        dpr = 1;
        renderer.setPixelRatio(1);
        fit();
        slowFrames.length = 0;
      }
    }
    // Để yên đủ lâu: dừng vẽ hẳn, cảnh đứng yên ở khung cuối (pointermove sẽ đánh thức)
    if (now - lastInteract > 20000) return;
    raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (!raf && !opts.reducedMotion && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  });
  io.observe(container);
  const onVisibility = () => !document.hidden && wake();
  document.addEventListener('visibilitychange', onVisibility);
  const ro = new ResizeObserver(() => {
    fit();
    if (opts.reducedMotion || !raf) {
      pose(performance.now());
      renderer.render(scene, camera);
    }
  });
  ro.observe(container);

  if (opts.reducedMotion) {
    pose(start + 5000);
    renderer.render(scene, camera);
    ready = true;
    canvas.style.opacity = '1';
    opts.onReady?.();
  } else {
    wake();
  }

  return {
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      const mats = new Set<Material>();
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mats.add(m);
        }
      });
      for (const m of mats) {
        (m as MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
      envTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
