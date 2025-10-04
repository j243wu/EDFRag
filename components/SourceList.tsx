'use client';
import type { Source } from '@/lib/types';

export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <div className="pl-6">
      <div className="text-xs text-neutral-400">Sources:</div>
      <ol className="list-decimal pl-6 text-sm space-y-1">
        {sources.map((s, i) => (
          <li key={i}>
            <a href={s.url} target="_blank" className="text-blue-400 hover:underline">{s.title ?? s.url}</a>
          </li>
        ))}
      </ol>
    </div>
  );
}
