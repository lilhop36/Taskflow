import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../users/schemas/user.schema';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Authorization Guard — enforces Role-Based Access Control (RBAC).
 *
 * SRS: BR-001 — Role-Based Authorization Hierarchy
 *   Admin > Project Manager > Employee
 *
 * This guard always runs AFTER JwtAuthGuard.
 * By the time this guard executes, request.user is already populated
 * by JwtStrategy with the authenticated user's payload (id, email, role).
 *
 * How it works:
 *   1. Use Reflector to read the @Roles(...) metadata attached to the
 *      route handler or controller class.
 *   2. If no roles are required → route is not role-restricted → allow.
 *   3. If roles are required → check request.user.role against them.
 *   4. Match → allow.  No match → ForbiddenException (403).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  /**
   * Reflector is NestJS's metadata reader.
   * It reads metadata attached by decorators like @Roles(...) which
   * internally calls SetMetadata(ROLES_KEY, roles).
   */
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Step 1: Read the @Roles(...) metadata from the handler or class.
    //
    // getAllAndOverride checks two targets in priority order:
    //   [1] context.getHandler()  → the specific route method
    //   [2] context.getClass()    → the entire controller class
    //
    // If both define @Roles(...), the method-level decorator wins.
    // This allows a controller to set a default role and individual
    // methods to override it — the most specific rule takes precedence.
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Step 2: If no @Roles(...) metadata exists on this route,
    // the route is not role-restricted. Any authenticated user may proceed.
    // Note: JwtAuthGuard has already verified authentication at this point.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // Step 3: Extract the authenticated user from the request.
    // request.user is populated by JwtStrategy.validate() during JwtAuthGuard.
    // Its shape: { userId: string, email: string, role: UserRole }
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId: string; email: string; role: UserRole };

    // Step 4: Check if the user's role satisfies the required roles.
    // BR-001: Role hierarchy — Administrator > ProjectManager > TeamMember.
    // - Administrator can access any route regardless of @Roles().
    // - ProjectManager can access @Roles(ProjectManager) and @Roles(TeamMember).
    // - TeamMember can only access @Roles(TeamMember) or unguarded routes.
    if (user?.role === UserRole.ADMIN) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => {
      if (role === UserRole.TEAM_MEMBER) {
        return user?.role === UserRole.TEAM_MEMBER || user?.role === UserRole.PROJECT_MANAGER;
      }
      if (role === UserRole.PROJECT_MANAGER) {
        return user?.role === UserRole.PROJECT_MANAGER;
      }
      return user?.role === role;
    });

    if (!hasRole) {
      throw new ForbiddenException(
        'Forbidden resource: insufficient role permissions',
      );
    }

    return true;
  }
}
