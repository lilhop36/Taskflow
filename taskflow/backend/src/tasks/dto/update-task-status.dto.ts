import { IsEnum, IsNotEmpty } from 'class-validator';
import { TaskStatus } from '../schemas/task.schema';

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.BACKLOG]: [TaskStatus.TODO],
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.BACKLOG],
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.TODO,
    TaskStatus.IN_REVIEW,
    TaskStatus.DONE,
  ],
  [TaskStatus.IN_REVIEW]: [TaskStatus.IN_PROGRESS, TaskStatus.DONE],
  [TaskStatus.DONE]: [TaskStatus.IN_PROGRESS, TaskStatus.ARCHIVED],
  [TaskStatus.ARCHIVED]: [TaskStatus.TODO],
};

export { VALID_TRANSITIONS };

export class UpdateTaskStatusDto {
  @IsNotEmpty({ message: 'Status is required' })
  @IsEnum(TaskStatus, {
    message: `Status must be one of: ${Object.values(TaskStatus).join(', ')}`,
  })
  status: TaskStatus;
}
