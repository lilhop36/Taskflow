/**
 * Event payload emitted when a task's status transitions.
 *
 * The single explicit contract for the `task.status-changed` event: emitters
 * construct this class (so the payload shape is compile-checked) and the
 * NotificationListener subscribes via {@link TaskStatusChangedEvent.eventName}.
 *
 * FR-008.2: "The system shall notify assigned users when a task status
 * changes."
 *
 * `changedBy` is REQUIRED: every status transition has an authenticated
 * actor (TasksService.updateStatus requires actorId), so the notification
 * always carries a real sender. The listener maps it to `sender`.
 */
export class TaskStatusChangedEvent {
  /** Event key shared by the emitter and the listener. */
  static readonly eventName = 'task.status-changed';

  constructor(
    public readonly taskId: string,
    public readonly assigneeId: string,
    public readonly taskTitle: string,
    public readonly oldStatus: string,
    public readonly newStatus: string,
    public readonly changedBy: string,
  ) {}
}
