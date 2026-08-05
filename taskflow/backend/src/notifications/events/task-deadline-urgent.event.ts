/**
 * Event payload emitted when an incomplete task is due within 24 hours.
 *
 * The single explicit contract for the `task.deadline-urgent` event: emitters
 * construct this class (so the payload shape is compile-checked) and the
 * NotificationListener subscribes via {@link TaskDeadlineUrgentEvent.eventName}.
 *
 * FR-008.3: "The system shall automatically trigger an urgent deadline alert
 * to the assignee when an incomplete task is within 24 hours of its due date."
 */
export class TaskDeadlineUrgentEvent {
  /** Event key shared by the emitter and the listener. */
  static readonly eventName = 'task.deadline-urgent';

  constructor(
    public readonly taskId: string,
    public readonly taskTitle: string,
    public readonly assigneeId: string,
    public readonly dueDate: Date,
    public readonly hoursRemaining: number,
  ) {}
}
