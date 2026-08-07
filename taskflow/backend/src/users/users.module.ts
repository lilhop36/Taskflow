import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { User, UserSchema } from './schemas/user.schema';

/**
 * Feature module encapsulating all components of the Users domain.
 *
 * Responsibilities:
 * - Provide and wire UsersService and UsersRepository into the NestJS DI container.
 * - Declare UsersController to handle HTTP endpoints under /api/users.
 * - Register the User model locally (per-feature forFeature, no global registry).
 * - Export UsersService so other modules (e.g. AuthModule) can inject it.
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
