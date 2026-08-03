import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ProjectsService } from '../../projects/projects.service';
import { TasksService } from '../../tasks/tasks.service';
import { UserRole } from '../../users/schemas/user.schema';

/**
 * ProjectMemberGuard — enforces FR-007.2 project access for task-scoped
 * routes (e.g. /tasks/:taskId/comments) without duplicating the check in
 * every controller handler.
 *
 * Responsibilities (in order):
 *   1. Load the task from the route's `taskId` param (404 if missing).
 *   2. Resolve the authenticated user from the JWT (request.user).
 *   3. Verify the user may access the task's parent project:
 *        - Administrators and Project Managers bypass via BR-001 hierarchy.
 *        - TeamMembers must be the owner or a listed member of the project.
 *   4. Attach the loaded task to `request.task` so handlers don't re-fetch.
 *
 * Must run AFTER JwtAuthGuard so request.user is populated.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private readonly tasksService: TasksService,
    private readonly projectsService: ProjectsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const taskId: string | undefined = request.params?.taskId;

    if (!taskId) {
      throw new ForbiddenException('Task ID is required');
    }

    // Load the parent task — TasksService.findById throws 404 if missing.
    const task = await this.tasksService.findById(taskId);

    const user = request.user as
      | { _id?: { toString(): string }; role?: UserRole }
      | undefined;
    if (!user?._id) {
      throw new ForbiddenException('Authenticated user not found');
    }

    const projectId = task.project?.toString();
    if (!projectId) {
      throw new ForbiddenException('Task has no parent project');
    }

    const isMember = await this.projectsService.isUserMemberOfProject(
      user._id.toString(),
      projectId,
      user.role,
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
