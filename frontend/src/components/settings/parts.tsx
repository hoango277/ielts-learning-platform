import type { ReactNode } from 'react';
import { Card } from '../ui/primitives';

/** Khối cài đặt có biểu tượng, tiêu đề, mô tả (dùng ở trang Cài đặt và trang Quản trị) */
export function Section({ icon, title, desc, children, id }: { icon: ReactNode; title: string; desc?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <Card className="scroll-mt-20 p-5 sm:p-6" id={id}>
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface-2 shadow-soft">{icon}</span>
        <div>
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          {desc && <p className="text-sm text-muted">{desc}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

/** Một dòng cài đặt: nhãn + giải thích bên trái, điều khiển bên phải */
export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 max-w-md">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
