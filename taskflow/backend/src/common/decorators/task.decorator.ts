import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  TaskView,
} from '../types/authenticated-request';

/**
 * Custom Parameter Decorator: @Task()
 *
 * Reads the Task document attached to the request by ProjectMemberGuard.
 * The guard loads the task (404 if missing) and verifies the caller is a
 * member of the parent project, so handlers can trust `request.task`
 * without re-fetching or re-checking access.
 *
 * Usage:
 *   @UseGuards(ProjectMemberGuard)
 *   async create(@Task() task: TaskView) { ... task.project.toString() ... }
 */
export const Task = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TaskView | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.task;
  },
);
