# AWS RAG ChatApp – Next.js Starter

A production‑ready, **static** Next.js (App Router) front end that talks to your **API Gateway → Lambda** RAG backend. No SSR required, so you can host on **S3 + CloudFront** or **AWS Amplify Hosting**. The UI mimics ChatGPT: a left sidebar with **New Chat / Chats / Knowledge Base**, and a main chat panel with messages and source citations.

> Replace `NEXT_PUBLIC_API_GATEWAY_URL` in `.env.local` with your API Gateway HTTPS endpoint.

---

## File Tree

```
aws-rag-chatapp-nextjs-starter/
├─ app/
│  ├─ globals.css
│  ├─ layout.tsx
│  ├─ page.tsx                 # Chat (Home)
│  ├─ chats/
│  │  └─ page.tsx              # Chat sessions list
│  └─ knowledge-base/
│     └─ page.tsx              # Placeholder (link to your KB admin)
├─ components/
│  ├─ Sidebar.tsx
│  ├─ ChatMessage.tsx
│  ├─ SourceList.tsx
│  └─ TopBar.tsx
├─ lib/
│  ├─ api.ts                   # API Gateway client
│  ├─ storage.ts               # localStorage helpers for sessions/chats
│  └─ types.ts
├─ public/
│  └─ favicon.ico
├─ .env.local.example
├─ next.config.mjs
├─ package.json
├─ postcss.config.mjs
├─ README.md
├─ tailwind.config.js
└─ tsconfig.json
```

---

## app/layout.tsx
```tsx
'use client';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { useEffect, useState } from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-open');
    if (saved !== null) setIsSidebarOpen(saved === 'true');
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebar-open', String(isSidebarOpen));
  }, [isSidebarOpen]);

  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
        <div className="flex h-full">
          <Sidebar open={isSidebarOpen} onToggle={() => setIsSidebarOpen(!isSidebarOpen)} />
          <main className="flex-1 flex flex-col min-w-0">
            <TopBar onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
            <div className="flex-1 overflow-auto">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
```

---

## app/page.tsx (Chat Home)
```tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
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
      sid = uuidv4();
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
```

---

## app/chats/page.tsx
```tsx
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
          const last = getMessages(c.id).at(-1);
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
```

---

## app/knowledge-base/page.tsx
```tsx
'use client';
import { useMemo, useRef, useState } from 'react';
import { getUploadUrls, startKbProcessing } from '@/lib/api';

export default function KnowledgeBasePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<'idle'|'uploading'|'processing'|'done'|'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [log, setLog] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const htmlFiles = useMemo(() => files.filter(f => f.type === 'text/html' || f.name.toLowerCase().endsWith('.html')), [files]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    setProgress(0);
    setStatus('idle');
    setLog([]);
  };

  const onSubmit = async () => {
    if (htmlFiles.length === 0) return;
    setStatus('uploading');
    setProgress(0);
    setLog([`Preparing presigned URLs for ${htmlFiles.length} file(s)…`]);

    try {
      // 1) Ask backend for presigned upload URLs
      const uploads = await getUploadUrls(htmlFiles.map(f => ({ name: f.name, type: f.type || 'text/html', size: f.size })));
      if (!uploads || uploads.length !== htmlFiles.length) {
        throw new Error('Upload URL count mismatch.');
      }

      // 2) Upload to S3 (parallel with progress)
      let completed = 0;
      const total = htmlFiles.length;
      const results = await Promise.allSettled(uploads.map(async (u) => {
        const file = htmlFiles.find(f => f.name === u.name);
        if (!file) throw new Error(`Missing File for ${u.name}`);
        const res = await fetch(u.url, { method: u.method || 'PUT', body: file, headers: { 'Content-Type': file.type || 'text/html' } });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`S3 upload failed (${res.status}): ${text}`);
        }
        completed += 1;
        setProgress(Math.round((completed / total) * 100));
        setLog(prev => [...prev, `Uploaded: ${u.name}`]);
        return { name: u.name, s3Key: u.s3Key };
      }));

      const succeeded = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<{name:string;s3Key:string}>).value);

      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        setLog(prev => [...prev, `⚠️ ${failed.length} file(s) failed to upload.`]);
      }

      // 3) Trigger processing Lambda for uploaded items
      setStatus('processing');
      setLog(prev => [...prev, 'Triggering vectorization Lambda…']);
      await startKbProcessing(succeeded.map(s => ({ s3Key: s.s3Key, name: s.name })));

      setStatus('done');
      setLog(prev => [...prev, '✅ Processing complete. You can use the app now.']);
    } catch (err: any) {
      setStatus('error');
      setLog(prev => [...prev, `❌ ${err?.message || String(err)}`]);
    }
  };

  const disabled = status === 'uploading' || status === 'processing';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Knowledge Base</h1>
      <p className="text-neutral-300">Upload a batch of <code>.html</code> files. They will be stored in S3 and then processed into your vector database by a Lambda.</p>

      <div className="border border-neutral-800 rounded-2xl p-4 space-y-3 bg-neutral-900">
        <input
          ref={inputRef}
          type="file"
          accept=".html,text/html"
          multiple
          onChange={onPickFiles}
          disabled={disabled}
          className="block w-full text-sm text-neutral-200 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500"
        />
        {htmlFiles.length > 0 && (
          <div className="text-xs text-neutral-400">Selected {htmlFiles.length} HTML file(s).</div>
        )}
        <button
          onClick={onSubmit}
          disabled={htmlFiles.length === 0 || disabled}
          className="px-4 py-2 rounded-xl bg-blue-600 disabled:opacity-40 hover:bg-blue-500"
        >Submit</button>

        {/* Progress */}
        {(status === 'uploading' || status === 'processing') && (
          <div className="space-y-2">
            <div className="text-sm text-neutral-300">{status === 'uploading' ? 'Uploading to S3…' : 'Processing with Lambda…'}</div>
            {status === 'uploading' && (
              <div className="h-2 w-full bg-neutral-800 rounded-xl overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: `${progress}%` }} />
              </div>
            )}
            {status === 'processing' && (
              <div className="flex items-center gap-2 text-neutral-400">
                <span className="animate-spin inline-block">⏳</span>
                <span>Waiting for Lambda (HTTP 200)…</span>
              </div>
            )}
          </div>
        )}

        {/* Logs */}
        {log.length > 0 && (
          <div className="text-xs text-neutral-400 max-h-40 overflow-auto border border-neutral-800 rounded-xl p-2 bg-neutral-950">
            {log.map((l, i) => (<div key={i}>{l}</div>))}
          </div>
        )}

        {status === 'done' && (
          <div className="text-green-400 text-sm">Done! You can use the app again.</div>
        )}
        {status === 'error' && (
          <div className="text-red-400 text-sm">Something went wrong. Check the log above.</div>
        )}
      </div>
    </div>
  );
}
```

---

## components/Sidebar.tsx
```tsx
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
        <span className="font-semibold">RAG Chat</span>
        <button className="text-xs text-neutral-400" onClick={onToggle}>{open ? 'Hide' : 'Show'}</button>
      </div>
      <div className="p-3 space-y-2">
        <button onClick={newChat} className="w-full text-left px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">New Chat</button>
        <Link href="/" className="block px-3 py-2 rounded-xl hover:bg-neutral-800">Home</Link>
        <Link href="/chats" className="block px-3 py-2 rounded-xl hover:bg-neutral-800">Chats</Link>
        <Link href="/knowledge-base" className="block px-3 py-2 rounded-xl hover:bg-neutral-800">Knowledge base</Link>
      </div>
    </aside>
  );
}
```

---

## components/TopBar.tsx
```tsx
'use client';
export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <div className="h-14 border-b border-neutral-800 px-4 flex items-center gap-3">
      <button onClick={onToggleSidebar} className="px-3 py-1 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800">☰</button>
      <div className="text-sm text-neutral-400">AWS RAG Chat – Next.js</div>
    </div>
  );
}
```

---

## components/ChatMessage.tsx
```tsx
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
```

---

## components/SourceList.tsx
```tsx
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
```

---

## lib/types.ts
```ts
export type Source = { title?: string; url: string };
export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  sources?: Source[];
};

export type RagResponse = {
  text: string;
  sources: Source[];
};
```

---

## lib/api.ts
```ts
import type { RagResponse } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL as string;
const UPLOAD_INIT_URL = process.env.NEXT_PUBLIC_UPLOAD_INIT_URL as string; // returns presigned URLs
const PROCESS_KB_URL = process.env.NEXT_PUBLIC_PROCESS_KB_URL as string;   // triggers processing lambda

if (!API_URL) console.warn('NEXT_PUBLIC_API_GATEWAY_URL is not set.');
if (!UPLOAD_INIT_URL) console.warn('NEXT_PUBLIC_UPLOAD_INIT_URL is not set.');
if (!PROCESS_KB_URL) console.warn('NEXT_PUBLIC_PROCESS_KB_URL is not set.');

export async function askRag({ sessionId, question }: { sessionId: string; question: string }): Promise<RagResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, question }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { text: data.text ?? '', sources: Array.isArray(data.sources) ? data.sources : [] };
  } finally { clearTimeout(timeout); }
}

// === Knowledge Base APIs ===
export type UploadInitItem = { name: string; type: string; size: number };
export type PresignedUpload = { name: string; url: string; s3Key: string; method?: 'PUT'|'POST' };

export async function getUploadUrls(files: UploadInitItem[]): Promise<PresignedUpload[]> {
  const res = await fetch(UPLOAD_INIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  if (!res.ok) throw new Error(`Upload init failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.uploads as PresignedUpload[];
}

export async function startKbProcessing(items: { s3Key: string; name: string }[]): Promise<void> {
  const res = await fetch(PROCESS_KB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Processing start failed ${res.status}: ${await res.text()}`);
}
```

---

## lib/storage.ts
```ts
import type { Message } from './types';

const CHATS_KEY = 'rag-chats-index';

export function createChatIfMissing(id: string) {
  const index = getAllChats();
  if (!index.find(x => x.id === id)) {
    index.unshift({ id, createdAt: Date.now() });
    localStorage.setItem(CHATS_KEY, JSON.stringify(index));
    localStorage.setItem(messagesKey(id), JSON.stringify([]));
  }
}

export function getAllChats(): { id: string; createdAt: number }[] {
  const raw = localStorage.getItem(CHATS_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function messagesKey(id: string) { return `rag-chat:${id}:messages`; }

export function getMessages(id: string): Message[] {
  const raw = localStorage.getItem(messagesKey(id));
  return raw ? JSON.parse(raw) : [];
}

export function persistMessage(id: string, msg: Message) {
  const cur = getMessages(id);
  cur.push(msg);
  localStorage.setItem(messagesKey(id), JSON.stringify(cur));
}

const ACTIVE_KEY = 'rag-active-session-id';
export function getActiveSessionId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}
export function setActiveSessionId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}
```

---

## app/globals.css
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body { height: 100%; }
* { box-sizing: border-box; }
```

---

## next.config.mjs
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export', // enables `next export` for static hosting
  images: { unoptimized: true },
};
export default nextConfig;
```

---

## tailwind.config.js
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

---

## postcss.config.mjs
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

## package.json
```json
{
  "name": "aws-rag-chatapp-nextjs-starter",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build && next export",
    "start": "npx serve -s out -l 3000"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "uuid": "9.0.1"
  },
  "devDependencies": {
    "autoprefixer": "10.4.19",
    "postcss": "8.4.38",
    "tailwindcss": "3.4.4",
    "typescript": "5.4.5"
  }
}
```

---

## tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2021"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

---

## .env.local.example
```
NEXT_PUBLIC_API_GATEWAY_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/ask
# Endpoint that returns presigned URLs for batch HTML uploads
NEXT_PUBLIC_UPLOAD_INIT_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/kb/upload-init
# Endpoint that triggers the processing Lambda (ingest to vector DB)
NEXT_PUBLIC_PROCESS_KB_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/kb/process
```

---

## README.md (Deployment Notes)
```md
# AWS RAG ChatApp – Next.js Starter

This is a static Next.js front end that calls your API Gateway → Lambda RAG backend.

## 0) Prereqs
- Your Lambda already deployed and integrated with **POST** on API Gateway.
- **CORS** enabled on API Gateway for your web origin (e.g., https://app.example.com). Methods: OPTIONS, POST, PUT.
- For Knowledge Base uploads you also need two endpoints:
  - `NEXT_PUBLIC_UPLOAD_INIT_URL` – returns presigned S3 URLs for each file `{ name, type, size }`.
  - `NEXT_PUBLIC_PROCESS_KB_URL` – triggers the processing Lambda with `{ items: [{ s3Key, name }] }`.

## 1) Local Dev
```bash
cp .env.local.example .env.local
# edit the three URLs
npm i
npm run dev
```

## 2) Build & Export Static Site
```bash
npm run build
```
This creates an `out/` folder you can host anywhere.

## 3A) Host on AWS Amplify Hosting (simplest)
- Create new Amplify app → connect Git repo.
- Build command: `npm ci && npm run build`
- Artifact directory: `out`
- Set env vars: `NEXT_PUBLIC_API_GATEWAY_URL`, `NEXT_PUBLIC_UPLOAD_INIT_URL`, `NEXT_PUBLIC_PROCESS_KB_URL`.

## 3B) Host on S3 + CloudFront
- Create S3 bucket for static website hosting.
- Upload `out/` to S3 (or use Amplify).
- CloudFront: Default root object `index.html`; SPA 404 → `/index.html`.

## 4) Security & Prod Tips
- **Auth**: Add Cognito; send ID token when requesting presigned URLs & processing.
- **S3 Policy**: Client never needs S3 credentials; it uploads via **presigned URLs** only.
- **CORS**: On both API endpoints, set `Access-Control-Allow-Origin` to your site.
- **Uploads**: Presigned `PUT` should require `Content-Type` and restrict key prefix.
- **Timeouts**: API Gateway 29–30s; keep Lambda under this. For long jobs use async + polling or WebSocket.
```md
# AWS RAG ChatApp – Next.js Starter

This is a static Next.js front end that calls your API Gateway → Lambda RAG backend.

## 0) Prereqs
- Your Lambda already deployed and integrated with **POST** on API Gateway.
- **CORS** enabled on API Gateway for your web origin (e.g., https://app.example.com). Methods: OPTIONS, POST. Headers: Content-Type, Authorization (if used).

## 1) Local Dev
```bash
cp .env.local.example .env.local
# edit NEXT_PUBLIC_API_GATEWAY_URL
npm i
npm run dev
```

## 2) Build & Export Static Site
```bash
npm run build
```
This creates an `out/` folder you can host anywhere.

## 3A) Host on AWS Amplify Hosting (simplest)
- Create new Amplify app → connect your Git repo.
- Build settings:
  - Build command: `npm ci && npm run build`
  - Artifact directory: `out`
- Set env var `NEXT_PUBLIC_API_GATEWAY_URL` in Amplify.

## 3B) Host on S3 + CloudFront
- Create S3 bucket for static website hosting.
- Upload `out/` to S3 (enable **Block Public Access off** or use OAC via CloudFront).
- Create CloudFront distribution → Origin = S3 bucket.
- Default root object = `index.html`.
- Error responses → 404 → respond with `/index.html` (for SPA routing).
- (Optional) Route 53 → your domain → CloudFront alias.

## 4) Security & Prod Tips
- **Auth**: add Cognito Hosted UI or Amazon Identity Center; send ID token with requests.
- **Rate limiting**: use WAF on CloudFront and throttling on API Gateway.
- **Observability**: instrument `x-request-id` and log it end-to-end (front-end → API GW → Lambda → RAG).
- **Timeouts**: API Gateway has a 29s limit (HTTP API) / 30s (REST). Ensure Lambda <= 28s. Consider **async WebSocket** or **EventBridge + polling** for longer generations.
- **Streaming**: if your Lambda can stream (e.g., via API GW WebSocket or Amazon Interactive Query), you can modify `askRag` to consume a stream and progressively render tokens.
- **CORS**: allow only your domain; use `Access-Control-Allow-Origin: https://app.example.com`.
- **Headers**: include `Cache-Control: no-store` on dynamic responses.

## 5) Lambda Response Contract
```json
{
  "text": "Answer text...",
  "sources": [ { "title": "Doc A", "url": "https://..." } ]
}
```
Adjust `lib/api.ts` if your schema differs.

## 6) Extending the App
- Replace `localStorage` with DynamoDB for persistent chats; key = sessionId. Add an API endpoint to list sessions.
- Add **Knowledge Base** uploader: S3 upload → SQS → Lambda → embed → OpenSearch Serverless / Bedrock KNN / Pinecone.
- Add **Cognito** to scope chats per user and enable RBAC.
- Add **shadcn/ui** for richer UI; add syntax highlighting for markdown answers.
