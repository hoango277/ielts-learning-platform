/** Câu có cụm cần học bị che (mặt trước thẻ) hoặc tô màu (mặt sau). */
export function ChunkSentence({ sentence, chunk, hidden, className }: { sentence: string; chunk: string; hidden: boolean; className?: string }) {
  const i = chunk ? sentence.toLowerCase().indexOf(chunk.toLowerCase()) : -1;
  if (i < 0) return <span className={className}>{sentence}</span>;
  return (
    <span className={className}>
      {sentence.slice(0, i)}
      {hidden ? (
        <span className="mx-0.5 inline-block min-w-20 rounded-md border-b-4 border-violet-400 bg-violet-100/60 px-2 text-center text-violet-500 dark:bg-violet-500/15">
          {chunk.split(' ').map((w) => w[0] + '…').join(' ')}
        </span>
      ) : (
        <span className="rounded-md bg-violet-100 px-1 font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">{sentence.slice(i, i + chunk.length)}</span>
      )}
      {sentence.slice(i + chunk.length)}
    </span>
  );
}
