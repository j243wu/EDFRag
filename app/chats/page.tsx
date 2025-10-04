'use client';
import { useEffect, useState } from 'react';
import { getAllChats, getMessages, setActiveSessionId } from '@/lib/storage';
import Link from 'next/link';

export default function ChatsPage() {
  const [chats, setChats] = useState<{ id: string; createdAt: number }[]>([]);

  useEffect(() => setChats(getAllChats()), []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-4">Chats</h1>
      <div className="space-y-3">
        {chats.length === 0 && <div className="text-neutral-400">No chats yet.</div>}
        {chats.map(c => {
          const msgs = getMessages(c.id);
          const last = msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
          return (
            <div key={c.id} className="p-3 rounded-xl border border-neutral-800 hover:border-neutral-700">
              <div className="text-sm text-neutral-400 mb-2">{new Date(c.createdAt).toLocaleString()}</div>
              <div className="text-neutral-200 line-clamp-2 mb-2">{last?.content ?? 'Empty chat'}</div>
              <Link href="/" onClick={() => setActiveSessionId(c.id)} className="text-blue-400 text-sm">Open</Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
