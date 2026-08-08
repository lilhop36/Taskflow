/**
 * Returns the role-appropriate landing page for an authenticated user.
 *
 * Single source of truth used by the root page (app/page.tsx) and any
 * post-sign-in redirect.
 *
 * BR-001 role hierarchy: Administrator > ProjectManager > TeamMember.
 * - Administrator → /users (user management)
 * - ProjectManager → /dashboard (overview + reports)
 * - TeamMember (or unknown role) → /tasks
 */
export function homeForRole(role?: string): string {
  if (role === 'Administrator') return '/users';
  if (role === 'ProjectManager') return '/dashboard';
  return '/tasks';
}
