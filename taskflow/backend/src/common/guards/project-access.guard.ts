import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ProjectsService } from '../../projects/projects.service';
import { VisibilityPolicyService } from '../../projects/visibility-policy.service';
import { UserRole } from '../../users/schemas/user.schema';

/** Minimal request shape the guard relies on. */
interface GuardRequest {
  params?: { id?: string };
  user?: { _id?: { toString(): string }; role?: UserRole };
  // Attached by this guard so the handler can read it via @Project().
  project?: any;
}

/**
 * ProjectAccessGuard — enforces project-level read access (e.g. the
 * /projects/:id detail route) without duplicating the check in handlers.
 *
 * Responsibilities (in order):
 *   1. Load the project from the route's `id` param (404 if missing).
 *   2. Resolve the authenticated user from the JWT (request.user).
 *   3. Verify the user may access the project via the single
 *      VisibilityPolicyService (BR-001 bypass for Admins/PMs, BR-003
 *      membership for Team Members).
 *   4. Attach the loaded project to `request.project` so handlers don't re-fetch.
 *
 * Must run AFTER JwtAuthGuard so request.user is populated.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly visibilityPolicy: VisibilityPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GuardRequest>();
    const projectId: string | undefined = request.params?.id;

    if (!projectId) {
      throw new ForbiddenException('Project ID is required');
    }

    // Load the project — ProjectsService.findById throws 404 if missing.
    const project = await this.projectsService.findById(projectId);

    const user = request.user;
    if (!user?._id) {
      throw new ForbiddenException('Authenticated user not found');
    }

    // Single shared visibility policy — same rule as the projects/tasks/
    // reports read endpoints. `user` is narrowed above so _id is present.
    const isMember = await this.visibilityPolicy.canReadProject(
      { _id: user._id, role: user.role },
      projectId,
    );

    if (!isMember) {
      throw new ForbiddenException(
        'You must be a member of the project to view it',
      );
    }

    // Expose the loaded project to handlers via a @Project() param decorator.
    request.project = project;
    return true;
  }
}
