/**
 * Event payload emitted when a task is assigned to a user.
 *
 * The single explicit contract for the `task.assigned` event: emitters
 * construct this class (so the payload shape is compile-checked) and the
 * NotificationListener subscribes via {@link TaskAssignedEvent.eventName}.
 *
 * FR-008.1: "The system shall automatically notify the user when a task is
 * assigned to them."
 *
 * `assignedBy` is REQUIRED: every task assignment has an authenticated
 * actor (TasksService.create/update require actorId), so the notification
 * always carries a real sender. The listener maps it to `sender`.
 */
export class TaskAssignedEvent {
  /** Event key shared by the emitter and the listener. */
  static readonly eventName = 'task.assigned';

  constructor(
    public readonly taskId: string,
    public readonly assigneeId: string,
    public readonly taskTitle: string,
    public readonly assignedBy: string,
  ) {}
}
