import {
  Body,
  Controller,
  Get,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/guards/jwt-auth.guard';
import type { UserDocument } from '../users/schemas/user.schema';

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
  @Public()
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
   * Returns the currently authenticated user.
   * Called by the frontend AuthProvider on mount to restore session from cookie.
   * Exposes GET /api/auth/session
   */
  @Get('session')
  session(@CurrentUser() user: UserDocument) {
    const userObject = user.toObject();
    const { passwordHash: _, ...userWithoutPassword } = userObject;
    return userWithoutPassword;
  }

  /**
   * Re-issues access token using refresh token from HTTP-only cookie or request body.
   * Exposes POST /api/auth/refresh
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refreshToken') bodyToken?: string,
  ) {
    const cookies = req.cookies as Record<string, string | undefined>;
    const token = cookies?.refresh_token || bodyToken;
    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }
    return this.authService.refreshAccessToken(token, res);
  }

  /**
   * FR-001.5: Terminate active user session & clear cookies.
   * Exposes POST /api/auth/logout
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }
}
