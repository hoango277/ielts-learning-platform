import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useUi } from '../../store/ui';
import { Modal } from '../ui/Modal';
import { Kbd } from '../ui/primitives';
import { LookupCard } from './LookupCard';

/** Hộp tra từ nhanh (Ctrl/⌘ + K) — tra bất kỳ từ/cụm từ nào và lưu vào sổ. */
export function QuickLookup() {
  const { lookup, closeLookup } = useUi();
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');

  useEffect(() => {
    if (lookup.open) {
      setInput(lookup.term);
      setTerm(lookup.term);
    }
  }, [lookup.open, lookup.term]);

  return (
    <Modal open={lookup.open} onClose={closeLookup} size="md" className="sm:mt-[-10vh]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(input.trim());
        }}
        className="relative mb-4"
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tra từ hoặc cụm từ tiếng Anh… (Enter)"
          aria-label="Từ cần tra"
          className="h-12 w-full rounded-2xl border border-line bg-surface-2 pl-11 pr-16 text-base text-ink placeholder:text-muted focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
        />
        <Kbd className="absolute right-3.5 top-1/2 -translate-y-1/2">Enter</Kbd>
      </form>
      {term ? (
        <LookupCard key={term} term={term} />
      ) : (
        <p className="py-6 text-center text-sm text-muted">
          Gõ một từ như <b className="text-ink">resilient</b> hoặc cụm <b className="text-ink">take for granted</b> để xem phiên âm, nghĩa,
          ví dụ và lưu vào sổ.
        </p>
      )}
    </Modal>
  );
}
