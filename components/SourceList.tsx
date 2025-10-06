'use client';

export function SourceList({ sources }: { sources: string[] }) {
  return (
    <div className="pl-6">
      <div className="text-xs text-neutral-400">Sources:</div>
      <ol className="list-decimal pl-6 text-sm space-y-1">
        {sources.map((s, i) => (
          <li key={i}>
            <a
              href={s}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:underline"
            >
              {s}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}