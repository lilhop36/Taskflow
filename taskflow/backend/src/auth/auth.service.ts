import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import jwtConfig from '../config/jwt.config';
import { UserDocument, UserStatus } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) {}

  /**
   * Validates user credentials during login.
   *
   * @param loginDto Contains user email and plain-text password
   * @returns User document (without password hash) on successful authentication
   */
  async validateUser(loginDto: LoginDto): Promise<UserDocument> {
    const user = await this.usersService
      .findByEmailWithPassword(loginDto.email)
      .catch(() => null);

    if (!user) {
      throw new UnauthorizedException('Invalid email address or password');
    }

    // BR-004 / FR-002.3: Deactivated users cannot log in
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException(
        'Your user account has been deactivated. Please contact an administrator.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email address or password');
    }

    return user;
  }

  /**
   * Generates JWT Access Token (30m) and Refresh Token (7d).
   * Sets HTTP-only cookies on the response object for browser clients.
   *
   * @param user Authenticated user document
   * @param res Optional Express response object to attach HTTP-only cookies
   */
  async login(user: UserDocument, res?: Response) {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      version: user.refreshTokenVersion ?? 0,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.jwtConfiguration.accessSecret,
      expiresIn: this.jwtConfiguration.accessExpiresIn as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.jwtConfiguration.refreshSecret,
      expiresIn: this.jwtConfiguration.refreshExpiresIn as any,
    });

    // Attach HTTP-Only Cookies if Response object is provided (XSS Defense)
    if (res) {
      this.setAuthCookies(res, accessToken, refreshToken);
    }

    const userObject = user.toObject();
    const { passwordHash: _, ...userWithoutPassword } = userObject;

    return {
      accessToken,
      refreshToken,
      user: userWithoutPassword,
    };
  }

  /**
   * Re-issues new Access + Refresh tokens using a valid Refresh Token.
   *
   * Rotates AND revokes: the user's refresh-token version is incremented,
   * so the presented token (and every earlier one) can never be used again.
   * When a Response object is provided, the HTTP-only cookies are
   * overwritten so the browser session continues without forcing re-login.
   *
   * @param refreshToken Current refresh token string
   * @param res Optional Express response object to attach updated cookies
   */
  async refreshAccessToken(refreshToken: string, res?: Response) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.jwtConfiguration.refreshSecret,
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || user.status === UserStatus.INACTIVE) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Rotation check: only the latest refresh token is valid. Any token
      // issued before the most recent rotation is rejected (revoked).
      if (payload.version !== (user.refreshTokenVersion ?? 0)) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Revoke the presented token before issuing a new pair, so a
      // reused/stolen refresh token cannot extend the session.
      await this.usersService.bumpRefreshTokenVersion(user._id.toString());

      const newPayload: JwtPayload = {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        version: (user.refreshTokenVersion ?? 0) + 1,
      };

      const accessToken = this.jwtService.sign(newPayload, {
        secret: this.jwtConfiguration.accessSecret,
        expiresIn: this.jwtConfiguration.accessExpiresIn as any,
      });

      const newRefreshToken = this.jwtService.sign(newPayload, {
        secret: this.jwtConfiguration.refreshSecret,
        expiresIn: this.jwtConfiguration.refreshExpiresIn as any,
      });

      if (res) {
        this.setAuthCookies(res, accessToken, newRefreshToken);
      }

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Attaches the HTTP-only auth cookies to the response.
   * Shared by login() and refreshAccessToken().
   *
   * SameSite is env-driven: 'lax' (same-site frontend+API, e.g. the
   * Cloudflare tunnels or local dev) or 'none' for cross-site deploys
   * (Vercel frontend → Render API).
   *
   * Secure is forced on whenever sameSite is 'none' — the browser spec
   * rejects SameSite=None cookies that aren't Secure — and also on in
   * production. This keeps cross-site logins working even when
   * NODE_ENV isn't literally 'production' (e.g. `npm run start:prod`).
   */
  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const sameSite = (process.env.COOKIE_SAME_SITE || 'lax') as
      | 'lax'
      | 'none';
    const secure = sameSite === 'none' || process.env.NODE_ENV === 'production';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 30 * 60 * 1000, // 30 minutes in milliseconds
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    });
  }

  /**
   * Logs out user by clearing authentication cookies.
   *
   * The clear must mirror the set options (path, secure, sameSite), or the
   * browser rejects the deletion cookie — a non-secure cookie cannot
   * overwrite a Secure one, so the session would silently survive logout.
   */
  logout(res: Response) {
    const sameSite = (process.env.COOKIE_SAME_SITE || 'lax') as
      | 'lax'
      | 'none';
    const cookieOptions = {
      path: '/',
      secure: sameSite === 'none' || process.env.NODE_ENV === 'production',
      sameSite,
    };
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);
    return { message: 'Successfully logged out' };
  }
}
