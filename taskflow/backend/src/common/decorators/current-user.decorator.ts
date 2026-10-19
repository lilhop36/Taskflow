import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserDocument } from '../../users/schemas/user.schema';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Data (non-method) fields of a user document. Extracting a method such as
 * `save` through a param decorator would hand the caller an unbound function,
 * so only data properties are addressable here.
 */
export type UserField = {
  [K in keyof UserDocument]: UserDocument[K] extends (
    ...args: never[]
  ) => unknown
    ? never
    : K;
}[keyof UserDocument];

/**
 * Custom Parameter Decorator: @CurrentUser()
 *
 * Extracts the authenticated User object attached to req.user by JwtStrategy.
 * Can extract the full User document or a specific field (e.g., @CurrentUser('_id')).
 *
 * Usage in Controllers:
 * - async getProfile(@CurrentUser() user: UserDocument)
 * - async getMyTasks(@CurrentUser('_id') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (data: UserField | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
