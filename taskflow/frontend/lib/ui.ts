/**
 * Shared UI style helpers.
 *
 * Single source of truth for the status/priority/role color maps that were
 * previously duplicated inline in every page (tasks, projects, users, ...).
 * Keeping them here guarantees every list, badge, and detail view renders
 * the same colors — change one map, all pages follow.
 *
 * Palette (see globals.css): teal = done/success, gold = in progress/accent,
 * ember = overdue/high, sage = neutral metadata.
 */

/** Text color class for a task's lifecycle status (FR-005). */
export function statusColor(status: string): string {
  return status === 'Done'
    ? 'text-teal'
    : status === 'In Progress'
      ? 'text-gold-deep'
      : status === 'Backlog'
        ? 'text-sand'
        : 'text-sage';
}

/** Text color class for a task's priority. */
export function priorityColor(priority: string): string {
  return priority === 'High'
    ? 'text-ember'
    : priority === 'Medium'
      ? 'text-gold-deep'
      : 'text-sage';
}

/** Text color class for a user's role (BR-001 hierarchy). */
export function roleColor(role: string): string {
  return role === 'Administrator'
    ? 'text-gold-deep'
    : role === 'ProjectManager'
      ? 'text-teal'
      : 'text-sage';
}

/** Full badge classes for a project's lifecycle status. */
export function projectStatusBadge(status: string): string {
  return status === 'Active'
    ? 'bg-teal-soft text-teal'
    : 'bg-black/5 text-sage';
}

/** Full badge classes for a user's account status. */
export function userStatusBadge(status: string): string {
  return status === 'Active'
    ? 'bg-teal-soft text-teal'
    : 'bg-ember-soft text-ember';
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
