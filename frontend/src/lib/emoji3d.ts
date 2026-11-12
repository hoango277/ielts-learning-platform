/**
 * Ảnh 3D cho emoji (Fluent Emoji của Microsoft, giấy phép MIT — xem public/emoji3d/LICENSE.txt).
 * Tên file là mã Unicode của emoji (bỏ ký tự biến thể FE0F), vd. 🎓 → 1f393.webp.
 * Thêm ảnh mới: đặt file WebP vào public/emoji3d rồi thêm mã vào danh sách dưới đây.
 */
const AVAILABLE = new Set(
  (
    '1f0cf 1f308 1f30b 1f30d 1f310 1f319 1f31f 1f326 1f331 1f33f 1f35c 1f37f 1f381 1f388 1f389 1f38a 1f393 1f396 1f399 1f3a4 ' +
    '1f3a7 1f3a8 1f3ac 1f3ae 1f3af 1f3c1 1f3c5 1f3c6 1f3d9 1f3db 1f3e1 1f422 1f43e 1f44b 1f44d 1f44f 1f451 1f457 1f48e 1f4a1 ' +
    '1f4aa 1f4ac 1f4b0 1f4bb 1f4bc 1f4c8 1f4ca 1f4cc 1f4cd 1f4d2 1f4d6 1f4da 1f4dd 1f4fa 1f501 1f50d 1f50e 1f512 1f514 1f516 ' +
    '1f517 1f524 1f525 1f52c 1f58a 1f5c2 1f5d3 1f5e3 1f5fa 1f605 1f642 1f680 1f687 1f6a9 1f6cd 1f914 1f947 1f948 1f949 1f973 ' +
    '1f989 1f99c 1f9d1-200d-1f393 1f9e0 1f9e9 1f9ec 1f9ed 1fa84 1fab9 23f0 23f1 23f3 2600 2615 2696 2699 26a0 26a1 26bd 2705 ' +
    '2708 270d 2728 2764 2b50'
  ).split(' '),
);

/** Emoji không có bản 3D → dùng ảnh gần nghĩa */
const ALIAS: Record<string, string> = {
  '1f468-200d-1f469-200d-1f467': '1f3e1', // 👨‍👩‍👧 gia đình → 🏡 ngôi nhà
};

export function emojiCode(emoji: string): string {
  return [...emoji.replace(/️/g, '')].map((c) => c.codePointAt(0)!.toString(16)).join('-');
}

/** Đường dẫn ảnh 3D của emoji, hoặc null nếu chưa có ảnh (khi đó hiển thị emoji chữ như thường). */
export function emoji3dUrl(emoji: string): string | null {
  const code = emojiCode(emoji.trim());
  const file = ALIAS[code] ?? code;
  return AVAILABLE.has(file) ? `/emoji3d/${file}.webp` : null;
}
