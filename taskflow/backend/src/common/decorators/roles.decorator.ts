import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../users/schemas/user.schema';

/**
 * Metadata key used to attach required user roles to controller classes or route handlers.
 */
export const ROLES_KEY = 'roles';

/**
 * Custom Method/Class Decorator: @Roles(...)
 *
 * Attaches role-based permission metadata to route handlers or controllers.
 * Read by RolesGuard at runtime via Reflector to enforce BR-001 (RBAC Hierarchy).
 *
 * Example Usage:
 * - @Roles(UserRole.ADMIN)
 * - @Roles(UserRole.ADMIN, UserRole.PROJECT_MANAGER)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
