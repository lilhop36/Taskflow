import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Feature module encapsulating all components of the Users domain.
 *
 * Responsibilities:
 * - Provide and wire UsersService and UsersRepository into the NestJS DI container.
 * - Declare UsersController to handle HTTP endpoints under /api/users.
 * - Export UsersService so other modules (e.g. AuthModule) can inject it.
 */
@Module({
  imports: [],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
