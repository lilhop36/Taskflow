import { IsEnum, IsNotEmpty } from 'class-validator';
import { TaskStatus } from '../schemas/task.schema';

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.TODO, TaskStatus.DONE],
  [TaskStatus.DONE]: [TaskStatus.IN_PROGRESS],
};

export { VALID_TRANSITIONS };

export class UpdateTaskStatusDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(TaskStatus, {
    message: `Status must be one of: ${Object.values(TaskStatus).join(', ')}`,
  })
  status: TaskStatus;
}
