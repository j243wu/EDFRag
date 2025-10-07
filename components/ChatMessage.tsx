'use client';
import type { Message } from '@/lib/types';

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isTyping = message.content === '__typing__' || message.id?.startsWith?.('typing-');
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap leading-6 text-sm p-3 rounded-2xl ${isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-neutral-900 border border-neutral-800 rounded-bl-sm'}`}>
        {isTyping ? (
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">Assistant is typing</span>
            <span className="flex gap-1 items-center">
              <span className="inline-block w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
              <span className="inline-block w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
              <span className="inline-block w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
            </span>
          </div>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}
