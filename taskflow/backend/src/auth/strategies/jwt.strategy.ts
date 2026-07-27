import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserStatus } from '../../users/schemas/user.schema';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Passport Strategy for verifying JWT Access Tokens.
 *
 * Responsibilities:
 * - Extract JWT from HTTP Authorization Bearer header or HTTP-only cookies.
 * - Verify the token signature using the secret configured in ConfigService.
 * - Validate the payload and ensure the associated user exists and is Active.
 * - Return the authenticated user object, which Passport attaches to req.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Extract from HTTP-Only cookie 'access_token' (Primary for Web UI)
        (request) => {
          return request?.cookies?.access_token;
        },
        // 2. Fallback: Extract from Authorization Bearer header (For API clients/Postman)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'taskflow_access_secret_change_in_production',
    });
  }

  /**
   * Called automatically by Passport after the JWT signature & expiration are verified.
   *
   * @param payload The decoded JWT payload { sub, email, role }
   * @returns User document object attached to req.user
   */
  async validate(payload: JwtPayload) {
    const { sub: userId } = payload;
    const user = await this.usersService.findById(userId);

    // Guard: Reject if user no longer exists
    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    // BR-004 / FR-002.3: Deactivated users must be blocked from authenticating
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException(
        'Your user account has been deactivated. Please contact an administrator.',
      );
    }

    return user;
  }
}
