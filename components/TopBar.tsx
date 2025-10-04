'use client';
export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <div className="h-14 border-b border-neutral-800 px-4 flex items-center gap-3">
      <button onClick={onToggleSidebar} className="px-3 py-1 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800">☰</button>
      <div className="text-sm text-neutral-400">EDF SmartOperation Tool</div>
    </div>
  );
}
