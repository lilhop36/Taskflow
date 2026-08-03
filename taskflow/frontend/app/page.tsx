'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { homeForRole } from '@/lib/nav';

/**
 * Root route — redirects to the role-appropriate landing page.
 *
 * - Unauthenticated → /login
 * - Administrator → /users
 * - ProjectManager → /dashboard
 * - TeamMember     → /tasks
 *
 * Auth state lives client-side (HTTP-only cookies on the API origin), so
 * this must be a client component reading useAuth() rather than a server
 * component reading cookies.
 */
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // wait for the session check to finish
    router.replace(user ? homeForRole(user.role) : '/login');
  }, [loading, user, router]);

  // Brief spinner while the session check completes / redirect fires.
  return (
    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
      Loading…
    </div>
  );
}
