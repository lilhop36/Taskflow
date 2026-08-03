import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { TaskPriority } from '../schemas/task.schema';

export class CreateTaskDto {
  @IsNotEmpty({ message: 'Task title is required' })
  @IsString({ message: 'Title must be a string' })
  title: string;

  @IsNotEmpty({ message: 'Task description is required' })
  @IsString({ message: 'Description must be a string' })
  description: string;

  @IsNotEmpty({ message: 'Priority is required' })
  @IsEnum(TaskPriority, {
    message: `Priority must be one of: ${Object.values(TaskPriority).join(', ')}`,
  })
  priority: TaskPriority;

  @IsNotEmpty({ message: 'Due date is required' })
  @IsDateString({}, { message: 'Due date must be a valid date' })
  dueDate: string;

  @IsNotEmpty({ message: 'Project ID is required' })
  @IsMongoId({ message: 'Project must be a valid Mongo ID' })
  project: string;

  @IsNotEmpty({ message: 'Assignee ID is required' })
  @IsMongoId({ message: 'Assignee must be a valid Mongo ID' })
  assignee: string;
}
