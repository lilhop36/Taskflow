import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/schemas/user.schema';
import * as bcrypt from 'bcrypt';
import jwtConfig from '../config/jwt.config';

/**
 * Unit Tests — AuthService
 *
 * SRS: FR-001 (Authentication), BR-004 (Inactive user cannot log in)
 *
 * Strategy:
 * - Mock UsersService and JwtService.
 * - Test validateUser() and login() isolation from the HTTP layer.
 */
describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    _id: { toString: () => 'user-id-123' },
    email: 'jane@example.com',
    passwordHash: 'hashed-password',
    role: UserRole.EMPLOYEE,
    status: UserStatus.ACTIVE,
    toObject: () => ({
      _id: 'user-id-123',
      email: 'jane@example.com',
      role: UserRole.EMPLOYEE,
      status: UserStatus.ACTIVE,
      passwordHash: 'hashed-password',
    }),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmailWithPassword: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
            verify: jest.fn(),
          },
        },
        // Provide the jwtConfig token with test values
        {
          provide: jwtConfig.KEY,
          useValue: {
            accessSecret: 'test-access-secret',
            accessExpiresIn: '30m',
            refreshSecret: 'test-refresh-secret',
            refreshExpiresIn: '7d',
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateUser() ───────────────────────────────────────────────────────

  describe('validateUser()', () => {
    const loginDto = { email: 'jane@example.com', password: 'correct-password' };

    it('should return user when credentials are valid (FR-001.1)', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const result = await service.validateUser(loginDto);

      expect(result).toBe(mockUser);
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null as any);

      await expect(service.validateUser(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user is INACTIVE (BR-004)', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      usersService.findByEmailWithPassword.mockResolvedValue(inactiveUser);

      await expect(service.validateUser(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when password is wrong (FR-001.1)', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.validateUser(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should not reveal whether email or password was wrong (security)', async () => {
      // Both "email not found" and "wrong password" must return the SAME error message
      // to prevent user enumeration attacks
      usersService.findByEmailWithPassword.mockResolvedValue(null as any);
      let emailError: UnauthorizedException;
      try {
        await service.validateUser(loginDto);
      } catch (e) {
        emailError = e;
      }

      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
      let passwordError: UnauthorizedException;
      try {
        await service.validateUser(loginDto);
      } catch (e) {
        passwordError = e;
      }

      // Both errors should have the same message to prevent user enumeration
      expect(emailError!.message).toBe(passwordError!.message);
    });
  });

  // ─── login() ──────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('should return accessToken, refreshToken and user without passwordHash (FR-001)', async () => {
      const result = await service.login(mockUser);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      // passwordHash must NEVER be returned to the client
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should call JwtService.sign twice — once for access, once for refresh', async () => {
      await service.login(mockUser);

      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });
  });
});
