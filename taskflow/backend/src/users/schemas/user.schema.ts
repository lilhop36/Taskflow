import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// UserDocument is the TypeScript type for a full Mongoose document.
// HydratedDocument<User> means: a User class instance + all Mongoose
// document methods like .save(), .toObject(), etc.
export type UserDocument = HydratedDocument<User>;

// UserRole maps directly to the enumeration defined in the SRS (Section 2.2)
// and the class diagram. Three roles, three levels of access.
export enum UserRole {
  ADMIN = 'Administrator',
  PROJECT_MANAGER = 'ProjectManager',
  TEAM_MEMBER = 'TeamMember',
}

// UserStatus maps to the UserStatus enumeration in the class diagram.
// BR-004: deactivating a user must not delete their historical data.
export enum UserStatus {
  ACTIVE = 'Active',
  INACTIVE = 'Inactive',
}

// @Schema() tells Mongoose this class defines a collection schema.
// timestamps: true automatically adds createdAt and updatedAt fields
// to every document — we get this for free without declaring the fields.
@Schema({ timestamps: true })
export class User {
  // @Prop() marks a class property as a MongoDB field.
  // required: true means MongoDB will reject a document without this field.
  // trim: true removes leading/trailing whitespace automatically.
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  // unique: true creates a MongoDB unique index on this field.
  // This enforces BR-007: no two users can share the same email address.
  // lowercase: true stores emails in lowercase to prevent case-sensitivity issues.
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // This stores the bcrypt hash, never the plain-text password.
  // NFR-007: passwords must be stored using a secure one-way hashing algorithm.
  @Prop({ required: true })
  passwordHash: string;

  // enum: restricts the value to one of the defined UserRole values.
  // default: sets the value when none is provided.
  @Prop({ required: true, enum: UserRole, default: UserRole.TEAM_MEMBER })
  role: UserRole;

  @Prop({ required: true, enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;
}

// SchemaFactory.createForClass() converts the decorated class into
// a real Mongoose schema object that can be registered with MongoDB.
export const UserSchema = SchemaFactory.createForClass(User);
