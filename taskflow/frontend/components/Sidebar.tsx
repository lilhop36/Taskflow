'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', roles: ['Administrator', 'ProjectManager', 'TeamMember'] },
  { href: '/projects', label: 'Projects', roles: ['Administrator', 'ProjectManager', 'TeamMember'] },
  { href: '/tasks', label: 'Tasks', roles: ['Administrator', 'ProjectManager', 'TeamMember'] },
  { href: '/notifications', label: 'Notifications', roles: ['Administrator', 'ProjectManager', 'TeamMember'] },
  { href: '/reports', label: 'Reports', roles: ['Administrator', 'ProjectManager'] },
  { href: '/teams', label: 'Teams', roles: ['Administrator'] },
  { href: '/users', label: 'Users', roles: ['Administrator'] },
];

/**
 * Sidebar navigation — renders links based on the user's role.
 * SRS: BR-001 — Role-based authorization is reflected in route visibility.
 */
export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  // Unread notification count for the badge — refetched on every navigation
  // so it reflects reads/dismissals done on the notifications page.
  // Uses the dedicated count endpoint instead of downloading the whole
  // unread list just to render a badge.
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/notifications/unread-count')
      .then((r) => { if (!cancelled && typeof r.data?.count === 'number') setUnread(r.data.count); })
      .catch(() => { /* ignore — badge stays hidden on failure */ });
    return () => { cancelled = true; };
  }, [pathname]);

  const visibleItems = navItems.filter((item) => item.roles.includes(user?.role ?? 'TeamMember'));
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <aside className="w-56 bg-ink text-white flex flex-col shrink-0">
      {/* Wordmark + user readout */}
      <div className="px-5 pt-6 pb-5 border-b border-ink-line">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-card">
          Task<span className="text-gold">Flow</span>
        </h1>
        <span className="thread mt-2 w-10" aria-hidden="true" />
        <div className="mt-4 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/15 font-mono text-xs font-semibold text-gold">
            {initials || '?'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-card">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-sand">
              {user?.role ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-1">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          const showBadge = item.href === '/notifications' && unread > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative block rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-white/5 font-semibold text-gold'
                  : 'text-sand hover:bg-white/5 hover:text-card'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gold" aria-hidden="true" />
              )}
              <span className="flex items-center justify-between">
                {item.label}
                {showBadge && (
                  <span className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-gold font-mono text-[10px] font-semibold text-ink">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-5 border-t border-ink-line pt-4">
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 text-sm text-sand transition-colors hover:text-gold"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
