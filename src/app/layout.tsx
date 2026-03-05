import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ReactNode } from 'react';
import { Activity, Layers, Clock } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PRISM Strategic Intelligence',
  description: 'Parallel multi-agent intelligence pipeline',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        <header className="fixed top-0 w-full h-16 border-b border-white/5 bg-prism-bg/80 backdrop-blur-md z-50 flex items-center px-6 justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-prism-sky to-prism-cerulean flex items-center justify-center shadow-[0_0_15px_rgba(89,221,253,0.3)]">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg tracking-wide text-white">PRISM</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-prism-panel text-prism-sky border border-prism-sky/20 ml-2">
              v3.0
            </span>
          </div>

          <nav className="flex items-center gap-6">
            <a href="/history" className="flex items-center gap-1.5 text-sm text-prism-muted hover:text-white transition-colors">
              <Clock className="w-3.5 h-3.5" />
              <span className="hidden md:inline">History</span>
            </a>
            <div className="flex items-center gap-2 text-sm text-prism-muted">
              <Activity className="w-4 h-4 text-prism-jade" />
              <span>System Online</span>
            </div>
          </nav>
        </header>

        <main className="flex-1 pt-16 flex flex-col">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </body>
    </html>
  );
}
