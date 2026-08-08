'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';

/**
 * AppShell wraps authenticated pages with a sidebar + content area.
 *
 * There is no login page — the AuthProvider silently signs in with the
 * demo account on first visit, so the app always opens ready to use.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // While checking the session / signing in, show a minimal spinner
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-sage text-sm">
        Loading…
      </div>
    );
  }

  // No session and demo sign-in failed (e.g. backend unreachable)
  if (!user) {
    return (
      <div className="h-full flex items-center justify-center text-sand text-sm">
        Could not connect to the workspace. Please try again.
      </div>
    );
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
