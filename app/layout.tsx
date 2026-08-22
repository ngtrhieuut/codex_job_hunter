import type { Metadata } from 'next';
import Link from 'next/link';
import { ownerAuthEnabled } from '@/src/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Codex Job Hunter',
  description: 'Human-gated opportunity intelligence and job operations.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              <span className="brand-mark">CJ</span>
              <span>Codex Job Hunter</span>
            </Link>
            <nav className="nav" aria-label="Primary navigation">
              <Link href="/">Dashboard</Link>
              <Link href="/opportunities/new">Add opportunity</Link>
              <Link href="/opportunities/import">Import</Link>
              <Link href="/jobs">Jobs</Link>
              <Link href="/analytics">Analytics</Link>
              <Link href="/settings">Settings</Link>
              {ownerAuthEnabled() && <Link href="/login">Owner login</Link>}
            </nav>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
