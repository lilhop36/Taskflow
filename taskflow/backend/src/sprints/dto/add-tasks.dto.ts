import { ArrayNotEmpty, IsMongoId } from 'class-validator';

export class AddTasksDto {
  @ArrayNotEmpty({ message: 'At least one task is required' })
  @IsMongoId({ each: true, message: 'Each task must be a valid MongoDB ID' })
  taskIds: string[];
}
