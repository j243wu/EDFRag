import type { RagResponse } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL as string;
const UPLOAD_INIT_URL = process.env.NEXT_PUBLIC_UPLOAD_INIT_URL as string; // returns presigned URLs
const PROCESS_KB_URL = process.env.NEXT_PUBLIC_PROCESS_KB_URL as string;   // triggers processing lambda

if (!API_URL) console.warn('NEXT_PUBLIC_API_GATEWAY_URL is not set.');
if (!UPLOAD_INIT_URL) console.warn('NEXT_PUBLIC_UPLOAD_INIT_URL is not set.');
if (!PROCESS_KB_URL) console.warn('NEXT_PUBLIC_PROCESS_KB_URL is not set.');

export async function askRag({ sessionId, query }: { sessionId: string; query: string }): Promise<RagResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, query }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { text: data.answer ?? '', sources: Array.isArray(data.sources) ? data.sources : [] };
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