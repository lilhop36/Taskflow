'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from './Sidebar';

/**
 * AppShell wraps authenticated pages with a sidebar + content area.
 * On the /login page the sidebar is hidden.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  // Login page gets no chrome
  if (pathname === '/login') return <>{children}</>;

  // While checking the session, show a minimal spinner
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  // Not authenticated and not on login — redirect happens in AuthContext interceptor
  if (!user) {
    return (
      <div className="h-full flex items-center justify-center">
        <a href="/login" className="text-blue-600 underline">Go to login</a>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50 p-6">
        {children}
      </main>
    </div>
  );
}
