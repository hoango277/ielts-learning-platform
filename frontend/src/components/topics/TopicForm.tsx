import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { Topic, TopicInput } from '../../lib/types';
import { cn, colorOf } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Emoji3D } from '../ui/Emoji3D';
import { Modal } from '../ui/Modal';
import { Field, Input, Textarea } from '../ui/primitives';

/** Biểu tượng có sẵn ảnh 3D (xem lib/emoji3d.ts) */
const ICONS = ['📚', '📝', '🎓', '📖', '💡', '🎯', '🌍', '✈️', '💼', '📈', '💰', '🏛️', '🔬', '🌱', '🍜', '🏡', '🎬', '🎧', '🎤', '🎨', '🎮', '🏆', '🚀', '💎', '🔥', '⭐', '💬', '🐾'];
const COLORS = ['teal', 'emerald', 'sky', 'indigo', 'violet', 'rose', 'orange', 'amber', 'slate'];

/**
 * Tạo / sửa bộ từ. Mặc định là "Bộ từ của tôi" (chỉ mình thấy);
 * `shared` = bộ chung cho mọi người (chỉ quản trị viên — máy chủ cũng kiểm tra).
 */
export function TopicForm({
  open,
  onClose,
  topic,
  shared = false,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Có → sửa bộ này; không → tạo mới */
  topic?: Topic;
  shared?: boolean;
  onSaved?: (t: Topic) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<TopicInput>(() => ({
    name: topic?.name ?? '',
    description: topic?.description ?? '',
    icon: topic?.icon ?? '📚',
    color: topic?.color ?? 'teal',
  }));
  const save = useMutation({
    mutationFn: () => (topic ? api.updateTopic(topic.slug, form) : api.createTopic({ ...form, shared })),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['topics'] });
      if (topic) qc.invalidateQueries({ queryKey: ['topic', topic.slug] });
      toast.success(topic ? 'Đã lưu bộ từ' : `Đã tạo bộ từ “${t.name}”`);
      onSaved?.(t);
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const set = (patch: Partial<TopicInput>) => setForm((f) => ({ ...f, ...patch }));
  const c = colorOf(form.color ?? 'teal');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={topic ? 'Sửa bộ từ' : shared ? 'Tạo chủ đề chung' : 'Tạo bộ từ của tôi'}
      description={
        topic ? undefined : shared ? 'Mọi học viên đều thấy và học được chủ đề này.' : 'Chỉ mình bạn thấy. Thêm từ bất kỳ — app tự điền nghĩa, phiên âm và câu ví dụ.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>
            {topic ? 'Lưu' : 'Tạo bộ từ'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim()) save.mutate();
        }}
      >
        <div className={cn('flex items-center gap-3 rounded-2xl bg-linear-to-br p-4 text-white', c.hero)}>
          <Emoji3D emoji={form.icon ?? '📚'} size={52} className="shrink-0 drop-shadow-[0_8px_10px_rgb(0_0_0/0.35)]" />
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold">{form.name.trim() || 'Tên bộ từ'}</p>
            <p className="line-clamp-1 text-sm text-white/85">{form.description?.trim() || 'Mô tả ngắn (không bắt buộc)'}</p>
          </div>
        </div>
        <Field label="Tên bộ từ" htmlFor="topic-name">
          <Input id="topic-name" value={form.name} maxLength={60} autoFocus placeholder="VD: Từ vựng Writing Task 2" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Mô tả" htmlFor="topic-desc">
          <Textarea id="topic-desc" rows={2} maxLength={200} value={form.description} placeholder="Bộ từ này dùng để làm gì?" onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Biểu tượng</p>
          <div role="radiogroup" aria-label="Biểu tượng" className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
            {ICONS.map((icon) => (
              <button
                key={icon}
                type="button"
                role="radio"
                aria-checked={form.icon === icon}
                aria-label={icon}
                onClick={() => set({ icon })}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-xl border-2 transition',
                  form.icon === icon ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/15' : 'border-transparent hover:bg-surface-2',
                )}
              >
                <Emoji3D emoji={icon} size={26} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Màu</p>
          <div role="radiogroup" aria-label="Màu" className="flex flex-wrap gap-2">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={form.color === color}
                aria-label={color}
                onClick={() => set({ color })}
                className={cn(
                  'h-8 w-8 rounded-full bg-linear-to-br ring-offset-2 ring-offset-surface transition',
                  colorOf(color).gradient,
                  form.color === color ? 'ring-2 ring-ink' : 'hover:scale-110',
                )}
              />
            ))}
          </div>
        </div>
      </form>
    </Modal>
  );
}
