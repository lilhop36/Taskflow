import type { Request } from 'express';
import type { TasksService } from '../../tasks/tasks.service';
import type { UserDocument } from '../../users/schemas/user.schema';

/**
 * The plain task object returned by TasksService.findById — the exact shape
 * ProjectMemberGuard attaches and @Task() hands to a handler.
 */
export type TaskView = Awaited<ReturnType<TasksService['findById']>>;

/**
 * The Express request as seen after JwtAuthGuard/JwtStrategy have run.
 *
 * Nest's `ExecutionContext.switchToHttp().getRequest()` is typed `any`, which
 * forced guards and param decorators to re-cast `request.user` (and tripped
 * `@typescript-eslint/no-unsafe-*`). Passing this type as the generic keeps
 * the request reads typed at the single trust boundary where Passport
 * attaches the user.
 */
export interface AuthenticatedRequest extends Request {
  user?: UserDocument;
  /** Attached by ProjectMemberGuard once the task-access check passes. */
  task?: TaskView;
}
