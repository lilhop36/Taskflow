/**
 * Returns the role-appropriate landing page for an authenticated user.
 *
 * Mirrors the login redirect logic (app/login/page.tsx) so the root page
 * and login page share a single source of truth.
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
