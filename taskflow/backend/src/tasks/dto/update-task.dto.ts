import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { TaskPriority } from '../schemas/task.schema';

export class UpdateTaskDto {
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  title?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority, {
    message: `Priority must be one of: ${Object.values(TaskPriority).join(', ')}`,
  })
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString({}, { message: 'Due date must be a valid date' })
  dueDate?: string;

  @IsOptional()
  @IsMongoId({ message: 'Assignee must be a valid Mongo ID' })
  assignee?: string;
}
