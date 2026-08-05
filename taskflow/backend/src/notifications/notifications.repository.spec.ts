import { Model, Types } from 'mongoose';
import { NotificationsRepository } from './notifications.repository';
import {
  CreateNotificationInput,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';

/**
 * Unit Tests — NotificationsRepository.create
 *
 * Proves the persistence seam converts the shared notification contract
 * (hex-string ids from the event layer) into the schema's ObjectId fields
 * — the behavior that previously forced `as any` casts in the listener.
 */
// Valid 24-char hex ObjectIds (BSONError otherwise when casting in the repo)
const RECIPIENT = '507f1f77bcf86cd799439011';
const TASK_ID = '507f1f77bcf86cd799439014';
const COMMENT_ID = '507f1f77bcf86cd799439015';
const SENDER = '507f1f77bcf86cd799439016';
const REPLY_RECIPIENT = '507f1f77bcf86cd799439012';
const REPLY_COMMENT_ID = '507f1f77bcf86cd799439017';
const REPLIER = '507f1f77bcf86cd799439013';

describe('NotificationsRepository.create — the persistence seam', () => {
  let notificationModel: jest.Mock;
  let save: jest.Mock;
  let repository: NotificationsRepository;

  beforeEach(() => {
    save = jest.fn().mockResolvedValue({ _id: 'n1' });
    notificationModel = jest.fn().mockReturnValue({ save });
    repository = new NotificationsRepository(
      notificationModel as unknown as Model<NotificationDocument>,
    );
  });

  /** Shape the model constructor receives for the created notification. */
  type CreatedDoc = {
    recipient: Types.ObjectId;
    type: NotificationType;
    message: string;
    task?: Types.ObjectId;
    comment?: Types.ObjectId;
    sender?: Types.ObjectId;
  };

  const create = async (
    input: CreateNotificationInput,
  ): Promise<CreatedDoc> => {
    await repository.create(input);
    // The doc handed to the model constructor is the typed surface to assert.
    const firstCallArgs = notificationModel.mock.calls[0] as unknown as [
      CreatedDoc,
    ];
    return firstCallArgs[0];
  };

  it('converts every string id from the contract into an ObjectId', async () => {
    const doc = await create({
      recipient: RECIPIENT,
      type: NotificationType.TASK_ASSIGNED,
      message: 'You have been assigned to task: "Build API"',
      task: TASK_ID,
      comment: COMMENT_ID,
      sender: SENDER,
    });

    expect(doc.recipient).toBeInstanceOf(Types.ObjectId);
    expect(doc.recipient.toString()).toBe(RECIPIENT);
    expect(doc.task?.toString()).toBe(TASK_ID);
    expect(doc.comment?.toString()).toBe(COMMENT_ID);
    expect(doc.sender?.toString()).toBe(SENDER);
    expect(doc.type).toBe(NotificationType.TASK_ASSIGNED);
    expect(doc.message).toBe('You have been assigned to task: "Build API"');
    expect(save).toHaveBeenCalled();
  });

  it('omits optional linked-entity and sender fields when not provided', async () => {
    const doc = await create({
      recipient: RECIPIENT,
      type: NotificationType.DEADLINE_URGENT,
      message: 'URGENT: Task "Ship" is due in 5 hour(s)',
    });

    expect(doc.recipient.toString()).toBe(RECIPIENT);
    expect(doc.task).toBeUndefined();
    expect(doc.comment).toBeUndefined();
    expect(doc.sender).toBeUndefined();
  });

  it('round-trips the comment-reply shape (recipient, task, comment, sender)', async () => {
    const doc = await create({
      recipient: REPLY_RECIPIENT,
      type: NotificationType.COMMENT,
      message: 'Liya Tesfaye replied to your comment on task "Build API"',
      task: TASK_ID,
      comment: REPLY_COMMENT_ID,
      sender: REPLIER,
    });

    expect(doc.recipient.toString()).toBe(REPLY_RECIPIENT);
    expect(doc.task?.toString()).toBe(TASK_ID);
    expect(doc.comment?.toString()).toBe(REPLY_COMMENT_ID);
    expect(doc.sender?.toString()).toBe(REPLIER);
    expect(doc.type).toBe(NotificationType.COMMENT);
  });
});
