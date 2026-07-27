import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class CreateUserDto {
  // @IsNotEmpty() — rejects empty strings ("") and whitespace-only strings
  // @IsString()   — rejects numbers, booleans, arrays
  @IsNotEmpty({ message: 'First name is required' })
  @IsString({ message: 'First name must be a string' })
  firstName: string;

  @IsNotEmpty({ message: 'Last name is required' })
  @IsString({ message: 'Last name must be a string' })
  lastName: string;

  // @IsEmail() validates format: must have @ and a valid domain
  // This satisfies BR-007 (unique identity) at the format level.
  // The uniqueness constraint is enforced at the database level via the schema.
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email: string;

  // NFR-006: password must be at least 8 characters, include one number
  // and one special character.
  // @Matches() takes a regex and a custom error message.
  // The regex (?=.*[0-9]) means "must contain at least one digit"
  // The regex (?=.*[!@#$%^&*]) means "must contain at least one special character"
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/(?=.*[0-9])/, { message: 'Password must contain at least one number' })
  @Matches(/(?=.*[!@#$%^&*])/, {
    message: 'Password must contain at least one special character (!@#$%^&*)',
  })
  password: string;

  // @IsEnum() ensures only valid roles from the UserRole enum are accepted.
  // BR-001: role assignment determines what the user can access.
  // If no role is provided, the schema default (TeamMember) applies —
  // but the Admin creating the user should explicitly set the role.
  @IsNotEmpty({ message: 'Role is required' })
  @IsEnum(UserRole, {
    message: `Role must be one of: ${Object.values(UserRole).join(', ')}`,
  })
  role: UserRole;
}
