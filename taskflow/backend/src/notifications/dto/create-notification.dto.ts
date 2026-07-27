import { IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { NotificationType } from '../schemas/notification.schema';

/**
 * DTO for programmatic notification creation (used by the listener, not by API clients).
 * The only user-facing operation is GET (read notifications) and PATCH (mark read).
 */
export class CreateNotificationDto {
  @IsMongoId()
  recipient: string;

  @IsEnum(NotificationType, { message: 'Invalid notification type' })
  type: NotificationType;

  @IsNotEmpty()
  @IsString()
  message: string;

  @IsOptional()
  @IsMongoId()
  task?: string;
}
