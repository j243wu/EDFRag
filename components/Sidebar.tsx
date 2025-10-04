'use client';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import { createChatIfMissing, setActiveSessionId } from '@/lib/storage';

export function Sidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const newChat = () => {
    const id = uuidv4();
    createChatIfMissing(id);
    setActiveSessionId(id);
    window.location.href = '/';
  };

  return (
    <aside className={`h-full bg-neutral-900 border-r border-neutral-800 transition-all duration-200 ${open ? 'w-64' : 'w-0'} overflow-hidden`}> 
      <div className="h-14 flex items-center justify-between px-3 border-b border-neutral-800">
        <span className="font-semibold">EDF Kafkaid</span>
        <button className="text-xs text-neutral-400" onClick={onToggle}>{open ? 'Hide' : 'Show'}</button>
      </div>
      <div className="p-3 space-y-2">
        <Link href="/" className="block px-3 py-2 rounded-xl hover:bg-neutral-800">Home</Link>
        <button onClick={newChat} className="w-full text-left px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">New Chat</button>
        <Link href="/chats" className="block px-3 py-2 rounded-xl hover:bg-neutral-800">Chats</Link>
        <Link href="/knowledge-base" className="block px-3 py-2 rounded-xl hover:bg-neutral-800">Knowledge base</Link>
      </div>
    </aside>
  );
}
