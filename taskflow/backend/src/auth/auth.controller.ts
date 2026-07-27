import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

/**
 * Controller handling HTTP authentication endpoints under /api/auth.
 *
 * Responsibilities:
 * - Handle user login (POST /api/auth/login).
 * - Handle access token refresh (POST /api/auth/refresh).
 * - Handle user logout (POST /api/auth/logout).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * FR-001.1 / FR-001.4: Authenticate user & establish session.
   * Exposes POST /api/auth/login
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(loginDto);
    return this.authService.login(user, res);
  }

  /**
   * Re-issues access token using refresh token from HTTP-only cookie or request body.
   * Exposes POST /api/auth/refresh
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body('refreshToken') bodyToken?: string,
  ) {
    const token = req.cookies?.refresh_token || bodyToken;
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return this.authService.refreshAccessToken(token);
  }

  /**
   * FR-001.5: Terminate active user session & clear cookies.
   * Exposes POST /api/auth/logout
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }
}
