import {
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
      res.cookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 60 * 1000, // 30 minutes in milliseconds
      });

      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      });
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
   * Re-issues a new Access Token using a valid Refresh Token.
   *
   * @param refreshToken Refresh token string
   */
  async refreshAccessToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.jwtConfiguration.refreshSecret,
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user || user.status === UserStatus.INACTIVE) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const newPayload: JwtPayload = {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
      };

      const newAccessToken = this.jwtService.sign(newPayload, {
        secret: this.jwtConfiguration.accessSecret,
        expiresIn: this.jwtConfiguration.accessExpiresIn as any,
      });

      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Logs out user by clearing authentication cookies.
   */
  logout(res: Response) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return { message: 'Successfully logged out' };
  }
}
