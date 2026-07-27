import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserDocument } from '../../users/schemas/user.schema';

/**
 * Custom Parameter Decorator: @CurrentUser()
 *
 * Extracts the authenticated User object attached to req.user by JwtStrategy.
 * Can extract the full User document or a specific property (e.g., @CurrentUser('id')).
 *
 * Usage in Controllers:
 * - async getProfile(@CurrentUser() user: UserDocument)
 * - async getMyTasks(@CurrentUser('_id') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (data: keyof UserDocument | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
