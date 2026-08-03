/**
 * Event payload emitted when a comment is posted on a task.
 *
 * Includes the task title and assignee ID so the NotificationListener
 * can create a notification without querying the database again.
 *
 * Threaded comments: when `replyTo` is set, `parentAuthorId` carries the
 * author of the parent comment so the listener can notify them too.
 */
export class CommentCreatedEvent {
  constructor(
    public readonly taskId: string,
    public readonly commentId: string,
    public readonly authorId: string,
    public readonly assigneeId: string | undefined,
    public readonly taskTitle: string,
    public readonly replyTo?: string,
    public readonly parentAuthorId?: string,
  ) {}
}
