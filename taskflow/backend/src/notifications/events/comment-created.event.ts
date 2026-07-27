/**
 * Event payload emitted when a comment is posted on a task.
 *
 * Includes the task title and assignee ID so the NotificationListener
 * can create a notification without querying the database again.
 */
export class CommentCreatedEvent {
  constructor(
    public readonly taskId: string,
    public readonly commentId: string,
    public readonly authorId: string,
    public readonly assigneeId: string | undefined,
    public readonly taskTitle: string,
  ) {}
}
