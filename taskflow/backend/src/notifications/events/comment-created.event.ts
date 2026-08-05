/**
 * Event payload emitted when a comment is posted on a task.
 *
 * The single explicit contract for the `comment.created` event: emitters
 * construct this class (so the payload shape is compile-checked) and the
 * NotificationListener subscribes via {@link CommentCreatedEvent.eventName}.
 *
 * Includes the task title and assignee ID so the NotificationListener
 * can create a notification without querying the database again.
 *
 * Threaded comments: when `replyTo` is set, `parentAuthorId` carries the
 * author of the parent comment so the listener can notify them too.
 */
export class CommentCreatedEvent {
  /** Event key shared by the emitter and the listener. */
  static readonly eventName = 'comment.created';

  constructor(
    public readonly taskId: string,
    public readonly commentId: string,
    public readonly authorId: string,
    public readonly assigneeId: string | undefined,
    public readonly taskTitle: string,
    /** Display name of the comment author, so notifications can say who
     *  commented/replied (e.g. "Liya replied to your comment…"). */
    public readonly authorName?: string,
    public readonly replyTo?: string,
    public readonly parentAuthorId?: string,
  ) {}
}
