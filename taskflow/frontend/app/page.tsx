'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { homeForRole } from '@/lib/nav';

/**
 * Root route — opens straight into the workspace.
 *
 * The AuthProvider restores the session (or silently signs in with the
 * demo account), then this page routes to the role's home:
 * Administrator → /users, ProjectManager → /dashboard, TeamMember → /tasks.
 *
 * No login page exists — the app opens ready to use.
 */
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? homeForRole(user.role) : '/dashboard');
  }, [user, loading, router]);

  // Minimal screen while the session is being checked — no flash of chrome.
  return (
    <div className="h-full flex items-center justify-center bg-paper">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-sand/60">
        Opening…
      </p>
    </div>
  );
}
