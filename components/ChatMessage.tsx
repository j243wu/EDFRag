'use client';
import type { Message } from '@/lib/types';

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap leading-6 text-sm p-3 rounded-2xl ${isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-neutral-900 border border-neutral-800 rounded-bl-sm'}`}>
        {message.content}
      </div>
    </div>
  );
}
