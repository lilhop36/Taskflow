/**
 * Shared UI formatting helpers.
 */

/**
 * Formats an ISO date string as e.g. "Aug 3, 2026".
 * Used across list/detail pages so all dates render identically.
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
