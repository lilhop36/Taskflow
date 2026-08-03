/**
 * Shared UI style helpers.
 *
 * Single source of truth for the status/priority/role color maps that were
 * previously duplicated inline in every page (tasks, projects, users, ...).
 * Keeping them here guarantees every list, badge, and detail view renders
 * the same colors — change one map, all pages follow.
 */

/** Text color class for a task's lifecycle status (FR-005). */
export function statusColor(status: string): string {
  return status === 'Done'
    ? 'text-green-600'
    : status === 'In Progress'
      ? 'text-blue-600'
      : 'text-gray-500';
}

/** Text color class for a task's priority. */
export function priorityColor(priority: string): string {
  return priority === 'High'
    ? 'text-red-600'
    : priority === 'Medium'
      ? 'text-yellow-600'
      : 'text-gray-500';
}

/** Text color class for a user's role (BR-001 hierarchy). */
export function roleColor(role: string): string {
  return role === 'Administrator'
    ? 'text-purple-600'
    : role === 'ProjectManager'
      ? 'text-blue-600'
      : 'text-gray-600';
}

/** Full badge classes for a project's lifecycle status. */
export function projectStatusBadge(status: string): string {
  return status === 'Active'
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-500';
}

/** Full badge classes for a user's account status. */
export function userStatusBadge(status: string): string {
  return status === 'Active'
    ? 'bg-green-100 text-green-700'
    : 'bg-red-100 text-red-700';
}

/**
 * Role check for write actions guarded by @Roles(PROJECT_MANAGER, ADMIN)
 * on the backend (task/project creation, reports, archive, ...).
 * BR-001: Administrators sit above ProjectManagers, so both pass.
 */
export function canManage(role?: string): boolean {
  return role === 'ProjectManager' || role === 'Administrator';
}

/**
 * Normalizes a backend error payload into a displayable string.
 * NestJS validation errors arrive as an array of messages; the global
 * filter can also pass through `{ message: string | string[] }`.
 */
export function errorMessage(err: any, fallback: string): string {
  const msg = err?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return typeof msg === 'string' && msg ? msg : fallback;
}
