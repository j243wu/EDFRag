'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage } from '@/components/ChatMessage';
import { SourceList } from '@/components/SourceList';
import { createChatIfMissing, getActiveSessionId, getMessages, persistMessage, setActiveSessionId } from '@/lib/storage';
import { askRag } from '@/lib/api';
import type { Message } from '@/lib/types';

export default function Page() {
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Ensure a session exists
  useEffect(() => {
    let sid = getActiveSessionId();
    if (!sid) {
      sid = crypto.randomUUID();
      createChatIfMissing(sid);
      setActiveSessionId(sid);
    }
    setSessionId(sid);
    setMessages(getMessages(sid));
  }, []);

  // auto-resize textarea
  useEffect(() => {
    const el = textAreaRef.current;
    if (!el) return;
    el.style.height = '24px';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const handleSend = async () => {
    if (!canSend || !sessionId) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: input.trim(), ts: Date.now() };
    persistMessage(sessionId, userMsg);
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await askRag({ sessionId, question: userMsg.content });
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.text ?? 'No response text returned.',
        ts: Date.now(),
        sources: res.sources ?? [],
      };
      persistMessage(sessionId, assistantMsg);
      setMessages(prev => [...prev, assistantMsg]);
    } catch (e: any) {
      const err: Message = { id: crypto.randomUUID(), role: 'assistant', content: `Request failed: ${e?.message ?? e}`, ts: Date.now() };
      persistMessage(sessionId, err);
      setMessages(prev => [...prev, err]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-stretch">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-neutral-400 mt-24">Start a conversation by asking a question…</div>
          )}
          {messages.map(m => (
            <div key={m.id} className="space-y-2">
              <ChatMessage message={m} />
              {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                <SourceList sources={m.sources} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-neutral-800 p-4">
        <div className="max-w-3xl mx-auto">
          <div className={`rounded-2xl bg-neutral-900 border ${loading ? 'opacity-75' : ''} border-neutral-800 p-3 flex items-end gap-3`}>
            <textarea
              ref={textAreaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask anything…"
              className="flex-1 bg-transparent resize-none outline-none text-sm leading-6"
              rows={1}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="px-3 py-2 rounded-xl bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition"
              aria-label="Send"
            >Send</button>
          </div>
          <div className="text-xs text-neutral-500 mt-2">Your question will be sent to AWS API Gateway & Lambda. Timeout set to 30s.</div>
        </div>
      </div>
    </div>
  );
}
