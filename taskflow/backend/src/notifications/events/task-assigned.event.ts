/**
 * Event payload emitted when a task is assigned to a user.
 *
 * This is an event-object class (not just a string name) so NestJS EventEmitter
 * can leverage class-based serialization and type safety if needed later.
 *
 * FR-008.1: "The system shall automatically notify the user when a task is
 * assigned to them."
 */
export class TaskAssignedEvent {
  constructor(
    public readonly taskId: string,
    public readonly assigneeId: string,
    public readonly taskTitle: string,
    public readonly assignedBy: string,
  ) {}
}
