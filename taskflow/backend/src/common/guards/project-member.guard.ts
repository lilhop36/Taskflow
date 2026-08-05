import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { VisibilityPolicyService } from '../../projects/visibility-policy.service';
import { TasksService } from '../../tasks/tasks.service';
import { UserRole } from '../../users/schemas/user.schema';

/**
 * ProjectMemberGuard — enforces project access for task-scoped routes
 * (e.g. /tasks/:taskId/comments, /tasks/:id) without duplicating the check
 * in every controller handler.
 *
 * Responsibilities (in order):
 *   1. Load the task from the route's `taskId` or `id` param (404 if missing).
 *   2. Resolve the authenticated user from the JWT (request.user).
 *   3. Verify the user may access the task's parent project via the single
 *      VisibilityPolicyService (BR-001 bypass for Admins/PMs, BR-003
 *      membership for Team Members).
 *   4. Attach the loaded task to `request.task` so handlers don't re-fetch.
 *
 * Must run AFTER JwtAuthGuard so request.user is populated.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private readonly tasksService: TasksService,
    private readonly visibilityPolicy: VisibilityPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    // Comments nest under :taskId (/tasks/:taskId/comments); the task's own
    // detail route uses :id (/tasks/:id). Accept both param names.
    const taskId: string | undefined =
      request.params?.taskId ?? request.params?.id;

    if (!taskId) {
      throw new ForbiddenException('Task ID is required');
    }

    // Load the parent task — TasksService.findById throws 404 if missing.
    const task = await this.tasksService.findById(taskId);

    const user = request.user as
      { _id?: { toString(): string }; role?: UserRole } | undefined;
    if (!user?._id) {
      throw new ForbiddenException('Authenticated user not found');
    }

    if (!task.project) {
      throw new ForbiddenException('Task has no parent project');
    }

    // Single shared visibility policy — same rule as the projects/tasks/
    // reports read endpoints. canReadTask resolves the parent project via
    // the stable refId shape (raw ObjectId or populated doc). `user` is
    // narrowed above so _id is present.
    const isMember = await this.visibilityPolicy.canReadTask(
      { _id: user._id, role: user.role },
      task,
    );

    if (!isMember) {
      throw new ForbiddenException(
        'You must be a member of the project to access this task',
      );
    }

    // Expose the loaded task to handlers via a @Task() param decorator.
    request.task = task;
    return true;
  }
}
