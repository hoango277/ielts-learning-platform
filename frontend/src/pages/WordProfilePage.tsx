import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Card, Input } from '../components/ui/primitives';
import { WordProfileView } from '../components/word/WordProfileView';

/** Trang hồ sơ từ: /profile/:term */
export default function WordProfilePage() {
  const { term = '' } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/profile/${encodeURIComponent(q.trim().toLowerCase())}`);
          setQ('');
        }}
        className="relative max-w-sm"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Xem hồ sơ từ khác…" className="pl-9" aria-label="Tra hồ sơ từ" />
      </form>
      <Card className="p-5 sm:p-7">
        {/* react-router đã giải mã tham số đường dẫn; giải mã lần nữa sẽ lỗi với từ có dấu "%" */}
        <WordProfileView key={term} term={term} />
      </Card>
    </div>
  );
}
