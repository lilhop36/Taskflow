import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserStatus } from './schemas/user.schema';
import { UsersRepository } from './users.repository';

// The service layer owns all business logic for the Users domain.
// It has no knowledge of HTTP (no Request, Response, status codes).
// It has no knowledge of MongoDB (no Model, no Mongoose queries).
// It speaks in domain terms: createUser, deactivateUser, findByEmail.
@Injectable()
export class UsersService {
  // The repository is injected by NestJS DI — UsersService never
  // instantiates it directly. This means in tests, we can inject a
  // mock repository and test the service logic in complete isolation.
  constructor(private readonly usersRepository: UsersRepository) {}

  // FR-002.1: Create a new user account.
  // Steps:
  //   1. Check for duplicate email (BR-007)
  //   2. Hash the plain-text password (NFR-007)
  //   3. Persist via repository
  async create(createUserDto: CreateUserDto) {
    // Step 1 — BR-007: email must be unique across all users.
    // We check at the service level for a clean error message.
    // The database unique index is a second line of defense against
    // race conditions (two simultaneous requests with the same email).
    const existingUser = await this.usersRepository.findByEmail(
      createUserDto.email,
    );
    if (existingUser) {
      throw new ConflictException(
        'An account with this email address already exists',
      );
    }

    // Step 2 — NFR-007: hash the password using bcrypt.
    // The number 12 is the "salt rounds" — how many times bcrypt
    // processes the password. Higher = more secure but slower.
    // 12 is the industry standard for production applications in 2024.
    // 10 rounds = ~100ms, 12 rounds = ~400ms — acceptable for login.
    // Never use less than 10 in production.
    const passwordHash = await bcrypt.hash(createUserDto.password, 12);

    // Step 3 — persist the user. We pass passwordHash, not the plain password.
    // The DTO field 'password' is intentionally excluded via destructuring.
    // We catch MongoDB duplicate key error 11000 to defend against race conditions.
    const { password, ...userData } = createUserDto;
    try {
      const user = await this.usersRepository.create({
        ...userData,
        passwordHash,
      });

      // Return the user object without the password hash.
      // toObject() converts the Mongoose document to a plain JS object.
      // We then destructure to remove passwordHash before returning.
      const { passwordHash: _, ...result } = user.toObject();
      return result;
    } catch (error: unknown) {
      // MongoDB duplicate-key error (code 11000) — the unique index raced us.
      if ((error as { code?: number } | null)?.code === 11000) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
      throw error;
    }
  }

  // Returns all users for the admin user management view.
  // passwordHash is already excluded at the repository level.
  async findAll() {
    return this.usersRepository.findAll();
  }

  // Finds a single user by ID — used by controllers and auth guards.
  async findById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  // Finds a user by email — used by AuthService during login.
  // Returns the full document INCLUDING passwordHash so AuthService
  // can compare the submitted password against the stored hash.
  // This is the only method that intentionally returns the hash.
  async findByEmailWithPassword(email: string) {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException(`No account found with this email address`);
    }
    return user;
  }

  // FR-002.2: Update user profile details.
  async update(id: string, updateUserDto: UpdateUserDto) {
    // Verify the user exists before attempting update.
    await this.findById(id);

    // If the update includes an email change, check the new email
    // isn't already taken by another user (BR-007).
    if (updateUserDto.email) {
      const existingUser = await this.usersRepository.findByEmail(
        updateUserDto.email,
      );
      // existingUser._id.toString() !== id means the email belongs
      // to a DIFFERENT user — that's a conflict.
      if (existingUser && existingUser._id.toString() !== id) {
        throw new ConflictException(
          'An account with this email address already exists',
        );
      }
    }

    const updated = await this.usersRepository.update(id, updateUserDto);
    if (!updated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return updated;
  }

  // NFR-005: Increment the refresh-token version, revoking all previously
  // issued refresh tokens. Called by AuthService during rotation.
  async bumpRefreshTokenVersion(id: string) {
    const user = await this.usersRepository.bumpRefreshTokenVersion(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  // FR-002.3: Deactivate a user account.
  // BR-004: this sets status to Inactive — it does NOT delete anything.
  // All tasks, comments, and audit records authored by this user are preserved.
  async deactivate(id: string) {
    const user = await this.findById(id);

    // Guard against deactivating an already-inactive user.
    // This provides a clear error rather than a silent no-op.
    if (user.status === UserStatus.INACTIVE) {
      throw new BadRequestException('This user account is already inactive');
    }

    const deactivated = await this.usersRepository.deactivate(id);
    if (!deactivated) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return deactivated;
  }
}
