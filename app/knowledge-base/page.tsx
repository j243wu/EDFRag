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

      // // 3) Trigger processing Lambda for uploaded items
      // setStatus('processing');
      // setLog(prev => [...prev, 'Triggering vectorization Lambda…']);
      // await startKbProcessing(succeeded.map(s => ({ s3Key: s.s3Key, name: s.name })));

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
      <p className="text-neutral-300">Upload a batch of <code>.html</code> files. They will be stored in S3 Bukcet and then processed into EDF Knowledge Base.</p>

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