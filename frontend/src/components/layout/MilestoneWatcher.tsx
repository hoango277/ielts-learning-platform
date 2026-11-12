import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { useEffect, useState } from 'react';
import { useMe } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { CONFETTI_COLORS } from '../../lib/utils';
import { useUi } from '../../store/ui';
import { useNavigate } from 'react-router';
import { Button } from '../ui/Button';
import { Celebration } from '../ui/Celebration';
import { Modal } from '../ui/Modal';

type Milestone = { kind: 'level'; level: number; totalXp: number } | { kind: 'badge'; key: string; icon: string; title: string; desc: string };

interface Seen {
  level: number;
  achieved: string[];
}

/**
 * Chúc mừng khi lên cấp hoặc đạt huy hiệu mới (một khoảnh khắc có cúp/huy chương 3D + pháo giấy).
 * Nhớ những gì đã chúc mừng theo từng tài khoản (localStorage); lần đầu chỉ ghi nhận, không báo dồn các mốc cũ.
 * Đợi hộp "Khởi động nhanh" đóng rồi mới hiện để không chồng hai hộp thoại.
 */
export function MilestoneWatcher() {
  const { data: user } = useMe();
  const { data: o } = useQuery({ queryKey: ['overview'], queryFn: api.overview, staleTime: 30_000, enabled: Boolean(user) });
  const warmupOpen = useUi((s) => s.warmup.open);
  const navigate = useNavigate();
  const [queue, setQueue] = useState<Milestone[]>([]);

  useEffect(() => {
    if (!user || !o) return;
    const key = `milestones:${user.id}`;
    const achieved = o.achievements.filter((a) => a.achieved).map((a) => a.key);
    let seen: Seen | null = null;
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? 'null') as Seen | null;
    } catch {
      seen = null;
    }
    try {
      localStorage.setItem(key, JSON.stringify({ level: Math.max(o.level.level, seen?.level ?? 0), achieved: [...new Set([...(seen?.achieved ?? []), ...achieved])] }));
    } catch {
      return; // không lưu được (trình duyệt chặn) → không chúc mừng để tránh báo lặp mỗi lần tải
    }
    if (!seen) return;
    const fresh: Milestone[] = [];
    if (o.level.level > seen.level) fresh.push({ kind: 'level', level: o.level.level, totalXp: o.level.totalXp });
    for (const a of o.achievements) if (a.achieved && !seen.achieved.includes(a.key)) fresh.push({ kind: 'badge', key: a.key, icon: a.icon, title: a.title, desc: a.desc });
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [user, o]);

  const current = warmupOpen ? undefined : queue[0];
  useEffect(() => {
    if (current) confetti({ particleCount: 110, spread: 75, origin: { y: 0.55 }, colors: CONFETTI_COLORS });
  }, [current]);

  const close = () => setQueue((q) => q.slice(1));
  return (
    <Modal
      open={Boolean(current)}
      onClose={close}
      size="sm"
      footer={
        <div className="flex w-full flex-wrap justify-center gap-2">
          {current?.kind === 'badge' && (
            <Button
              variant="outline"
              onClick={() => {
                close();
                navigate('/progress');
              }}
            >
              Xem huy hiệu
            </Button>
          )}
          <Button variant="primary" onClick={close}>
            Tuyệt vời!
          </Button>
        </div>
      }
    >
      {current?.kind === 'level' && (
        <Celebration emoji="⭐" title={`Lên cấp ${current.level}!`} description={`Bạn đã tích luỹ ${current.totalXp.toLocaleString('vi-VN')} XP. Cứ đều đặn mỗi ngày như thế nhé!`} className="py-2" />
      )}
      {current?.kind === 'badge' && <Celebration emoji={current.icon} title={`Huy hiệu mới: ${current.title}`} description={current.desc} className="py-2" />}
    </Modal>
  );
}
