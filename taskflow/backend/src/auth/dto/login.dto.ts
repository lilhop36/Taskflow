import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Data Transfer Object (DTO) for User Authentication (Login).
 *
 * Validates incoming login request bodies before passing them to AuthService.
 * Ensures the email is formatted correctly and that neither email nor password are empty.
 */
export class LoginDto {
  @IsNotEmpty({ message: 'Email address is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString({ message: 'Password must be a string' })
  password: string;
}
