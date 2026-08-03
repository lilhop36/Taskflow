'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

  const visibleItems = navItems.filter((item) => item.roles.includes(user?.role ?? 'TeamMember'));

  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold">TaskFlow</h1>
        <p className="text-xs text-gray-400 mt-1">{user?.firstName} {user?.lastName}</p>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {visibleItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded text-sm ${
                active ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-2 pb-4">
        <button onClick={logout} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:text-white">
          Sign out
        </button>
      </div>
    </aside>
  );
}
