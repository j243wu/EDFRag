'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessage } from '@/components/ChatMessage';
import { SourceList } from '@/components/SourceList';
import { createChatIfMissing, getActiveSessionId, getMessages, persistMessage, setActiveSessionId, replaceMessage } from '@/lib/storage';
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
    let typingId: string | null = null;
    try {
      // insert a temporary typing message so the UI shows a typing indicator
      typingId = `typing-${crypto.randomUUID()}`;
      const typingMsg: Message = { id: typingId, role: 'assistant', content: '__typing__', ts: Date.now() };
      persistMessage(sessionId, typingMsg);
      setMessages(prev => [...prev, typingMsg]);

      const res = await askRag({ sessionId, query: userMsg.content });

  // replace typing message with real assistant response
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.text ?? 'No response text returned.',
        ts: Date.now(),
        sources: res.sources ?? [],
      };
      // update persisted messages (replace typing placeholder)
      if (typingId) replaceMessage(sessionId, typingId, assistantMsg);
      setMessages(prev => prev.map(m => (m.id === typingId ? assistantMsg : m)));
    } catch (e: any) {
  // replace typing message with error message
      const errMsg: Message = { id: crypto.randomUUID(), role: 'assistant', content: `Request failed: ${e?.message ?? e}`, ts: Date.now() };
      if (typingId) replaceMessage(sessionId, typingId, errMsg);
      setMessages(prev => prev.map(m => (m.id === typingId ? errMsg : m)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-stretch">
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-neutral-400 mt-24">Start a conversation by asking a query…</div>
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
          <div className="text-xs text-neutral-500 mt-2">Your query will be sent to AWS API Gateway & Lambda. Timeout set to 30s.</div>
        </div>
      </div>
    </div>
  );
}
