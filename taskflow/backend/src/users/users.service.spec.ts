import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UserStatus, UserRole } from './schemas/user.schema';
import * as bcrypt from 'bcrypt';

// bcrypt v5+ exposes non-configurable properties — jest.spyOn(bcrypt, …)
// throws "Cannot redefine property". Mock the module instead.
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

/**
 * Unit Tests — UsersService
 *
 * SRS: FR-002 (User Management), BR-007 (Unique Email), BR-004 (Deactivation)
 *
 * Strategy:
 * - We mock UsersRepository entirely — no real database is touched.
 * - Each test isolates one behaviour of UsersService.
 * - Tests verify that the SERVICE layer (business logic) behaves correctly,
 *   not that MongoDB works — the repository handles that.
 */
describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<UsersRepository>;

  // A reusable mock user document that mimics a Mongoose document
  const mockUser = {
    _id: { toString: () => 'user-id-123' },
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    passwordHash: 'hashed-password',
    role: UserRole.TEAM_MEMBER,
    status: UserStatus.ACTIVE,
    toObject: () => ({
      _id: 'user-id-123',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      passwordHash: 'hashed-password',
      role: UserRole.TEAM_MEMBER,
      status: UserStatus.ACTIVE,
    }),
  } as any;

  beforeEach(async () => {
    // Build a NestJS testing module with a mocked repository
    // jest.fn() creates a mock function that does nothing by default.
    // We override return values per test using .mockResolvedValue()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            findByEmail: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findAll: jest.fn(),
            deactivate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(UsersRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── create() ────────────────────────────────────────────────────────────

  describe('create()', () => {
    const createDto = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      password: 'StrongPass123!',
      role: UserRole.TEAM_MEMBER,
    };

    it('should hash the password and create the user (FR-002.1, NFR-007)', async () => {
      // Arrange: no existing user, creation succeeds
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockUser);

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(repository.findByEmail).toHaveBeenCalledWith(createDto.email);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: createDto.email,
          firstName: createDto.firstName,
          // passwordHash must exist — the plain password must NOT be passed
          passwordHash: expect.any(String),
        }),
      );
      // The returned object must NOT expose the hash
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw ConflictException when email already exists (BR-007)', async () => {
      // Arrange: a user with this email already exists
      repository.findByEmail.mockResolvedValue(mockUser);

      // Act + Assert
      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException on MongoDB E11000 race condition (BR-007)', async () => {
      // Arrange: email check passes, but DB throws a duplicate key error
      // This simulates two concurrent requests that both pass the email check
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockRejectedValue({ code: 11000 });

      // Act + Assert
      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should use bcrypt with salt rounds >= 10 (NFR-007)', async () => {
      // Arrange
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue(mockUser);

      // Act
      await service.create(createDto);

      // Assert: bcrypt.hash was called with the plain password and >= 10 rounds
      const [, saltRounds] = (bcrypt.hash as jest.Mock).mock.calls[0];
      expect(
        typeof saltRounds === 'number' ? saltRounds : 0,
      ).toBeGreaterThanOrEqual(10);
    });
  });

  // ─── findById() ───────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('should return the user when found', async () => {
      repository.findById.mockResolvedValue(mockUser);

      const result = await service.findById('user-id-123');

      expect(result).toBe(mockUser);
      expect(repository.findById).toHaveBeenCalledWith('user-id-123');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── deactivate() ─────────────────────────────────────────────────────────

  describe('deactivate()', () => {
    it('should deactivate an active user (BR-004, FR-002.3)', async () => {
      repository.findById.mockResolvedValue(mockUser);
      const deactivatedUser = { ...mockUser, status: UserStatus.INACTIVE };
      repository.deactivate.mockResolvedValue(deactivatedUser);

      const result = await service.deactivate('user-id-123');

      expect(repository.deactivate).toHaveBeenCalledWith('user-id-123');
      expect(result.status).toBe(UserStatus.INACTIVE);
    });

    it('should throw BadRequestException when user is already inactive (BR-004)', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      repository.findById.mockResolvedValue(inactiveUser);

      await expect(service.deactivate('user-id-123')).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.deactivate).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.deactivate('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update user when valid data is provided (FR-002.2)', async () => {
      repository.findById.mockResolvedValue(mockUser);
      repository.findByEmail.mockResolvedValue(null);
      repository.update.mockResolvedValue({
        ...mockUser,
        firstName: 'Janet',
      });

      const result = await service.update('user-id-123', {
        firstName: 'Janet',
      });

      expect(repository.update).toHaveBeenCalledWith('user-id-123', {
        firstName: 'Janet',
      });
      expect(result.firstName).toBe('Janet');
    });

    it('should throw ConflictException if new email belongs to another user (BR-007)', async () => {
      const differentUser = {
        ...mockUser,
        _id: { toString: () => 'other-user-id' },
      };
      repository.findById.mockResolvedValue(mockUser);
      repository.findByEmail.mockResolvedValue(differentUser);

      await expect(
        service.update('user-id-123', { email: 'other@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
