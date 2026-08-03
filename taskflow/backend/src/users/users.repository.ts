import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserStatus } from './schemas/user.schema';

// The Repository Pattern: this class is the only place in the codebase
// that talks directly to the MongoDB users collection.
// Services never import Model or call Mongoose methods directly —
// they call this repository instead.
//
// Benefits:
// 1. Swapping databases only requires changing the repository
// 2. Services can be tested by mocking the repository (no real DB needed)
// 3. All database queries are in one place — easy to audit and optimize
@Injectable()
export class UsersRepository {
  constructor(
    // @InjectModel(User.name) retrieves the Mongoose Model registered
    // in UsersModule via MongooseModule.forFeature().
    // Model<UserDocument> gives us full TypeScript types for Mongoose operations.
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // Creates a new user document in MongoDB.
  // Receives plain data (already validated by DTO, password already hashed by service).
  async create(data: Partial<User>): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }

  // Finds a user by their email address.
  // Used by AuthService to look up a user during login.
  // Returns null if not found — the caller decides how to handle that.
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  // Finds a user by their MongoDB _id.
  // Used by JwtStrategy to hydrate the user from the JWT payload.
  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  // Returns all users — used by the admin user management interface.
  // .select('-passwordHash') excludes the password hash from the result.
  // Never return password hashes to the client — not even to admins.
  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-passwordHash').exec();
  }

  // Updates a user's profile fields.
  // { new: true } returns the updated document, not the original.
  // { runValidators: true } runs schema validators on the update.
  async update(
    id: string,
    data: Partial<User>,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .select('-passwordHash')
      .exec();
  }

  // Deactivates a user by setting their status to Inactive.
  // BR-004: this must NOT delete the user or their historical records.
  // The user's name stays attached to all tasks, comments, and status changes
  // they made — the audit trail is preserved.
  async deactivate(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { status: UserStatus.INACTIVE },
        { new: true },
      )
      .select('-passwordHash')
      .exec();
  }

  // Increments the user's refresh-token version, invalidating every
  // previously issued refresh token (rotation/revocation, NFR-005).
  // Called by AuthService during refresh-token rotation.
  async bumpRefreshTokenVersion(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $inc: { refreshTokenVersion: 1 } },
        { new: true },
      )
      .select('-passwordHash')
      .exec();
  }
}
