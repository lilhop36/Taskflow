import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Decorator to mark endpoints as public (bypassing JwtAuthGuard when applied globally).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Authentication Guard enforcing JWT token verification on protected routes.
 *
 * Extends NestJS Passport AuthGuard('jwt') which triggers JwtStrategy.
 * Checks for @Public() metadata to allow unauthenticated access to public endpoints.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException(
          info?.message || 'Authentication required to access this resource',
        )
      );
    }
    return user;
  }
}
