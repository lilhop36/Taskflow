export class TaskDeadlineUrgentEvent {
  constructor(
    public readonly taskId: string,
    public readonly taskTitle: string,
    public readonly assigneeId: string,
    public readonly dueDate: Date,
    public readonly hoursRemaining: number,
  ) {}
}