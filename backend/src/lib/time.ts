/** Ngày theo giờ địa phương của máy chủ (YYYY-MM-DD) — app chạy trên máy người học. */
export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfLocalDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Nhãn khoảng thời gian ngắn gọn bằng tiếng Việt: "10 phút", "3 ngày", "2,5 tháng". */
export function formatInterval(ms: number): string {
  const minutes = ms / 60000;
  if (minutes < 1) return '<1 phút';
  if (minutes < 60) return `${Math.round(minutes)} phút`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} giờ`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)} ngày`;
  const months = days / 30;
  if (months < 12) return `${months.toFixed(months < 10 ? 1 : 0).replace('.', ',').replace(',0', '')} tháng`;
  const years = days / 365;
  return `${years.toFixed(1).replace('.', ',').replace(',0', '')} năm`;
}
