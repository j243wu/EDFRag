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
