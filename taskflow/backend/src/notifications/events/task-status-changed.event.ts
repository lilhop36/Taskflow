/**
 * Event payload emitted when a task's status transitions.
 *
 * FR-008.2: "The system shall notify assigned users when a task status
 * changes."
 */
export class TaskStatusChangedEvent {
  constructor(
    public readonly taskId: string,
    public readonly assigneeId: string,
    public readonly taskTitle: string,
    public readonly oldStatus: string,
    public readonly newStatus: string,
    public readonly changedBy: string,
  ) {}
}
