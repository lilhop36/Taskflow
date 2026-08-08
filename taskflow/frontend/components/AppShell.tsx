'use client';

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';

/**
 * AppShell wraps authenticated pages with a sidebar + content area.
 *
 * The login page renders without the sidebar chrome. Elsewhere, the
 * AuthProvider restores the session (or silently signs in with the demo
 * account on first visit), so the app opens straight into the workspace.
 * A logged-out user (deliberate sign-out, or demo sign-in failed) is
 * sent to the login page instead of a dead-end screen.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // No session (deliberate sign-out, or demo sign-in failed e.g. backend
  // unreachable) — send the user to the login page. Without this, a
  // logged-out reload of a protected page would sit on a dead-end screen
  // because the page's own redirect never mounts.
  useEffect(() => {
    if (!loading && !user && pathname !== '/login') {
      router.replace('/login');
    }
  }, [loading, user, pathname, router]);

  // Login page gets no chrome — no sidebar while entering credentials.
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // While checking the session / signing in, show a minimal spinner
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sage text-sm">
        Loading…
      </div>
    );
  }

  // Logged out — the effect above redirects to /login; render nothing
  // while that navigation is in flight.
  if (!user) {
    return null;
  }

  return (
    <div className="h-full flex">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-paper p-8">
        {children}
      </main>
    </div>
  );
}
