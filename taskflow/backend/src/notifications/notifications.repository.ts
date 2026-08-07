import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CreateNotificationInput,
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';

/**
 * Repository for Notification documents.
 *
 * Data-access layer — no business logic, only CRUD.
 */
@Injectable()
export class NotificationsRepository {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  /**
   * Persist a new notification record from the shared notification
   * contract ({@link CreateNotificationInput}). This is the persistence
   * seam: hex-string ids arrive from the event layer and are converted to
   * ObjectIds here — callers never cast strings into the schema's ObjectId
   * fields.
   */
  async create(input: CreateNotificationInput): Promise<NotificationDocument> {
    const notification = new this.notificationModel({
      recipient: new Types.ObjectId(input.recipient),
      type: input.type,
      message: input.message,
      ...(input.task ? { task: new Types.ObjectId(input.task) } : {}),
      ...(input.comment ? { comment: new Types.ObjectId(input.comment) } : {}),
      ...(input.sprint ? { sprint: new Types.ObjectId(input.sprint) } : {}),
      // sender is optional attribution: the events are the typed source —
      // they carry a real user id when a human actor is known and omit the
      // field entirely otherwise (system-generated). The repository simply
      // stores what it is given; no sentinel guessing.
      ...(input.sender ? { sender: new Types.ObjectId(input.sender) } : {}),
    });
    return notification.save();
  }

  /**
   * Count the user's unread notifications — powers the sidebar badge
   * without shipping the full list. Ownership-scoped to the recipient,
   * matching findUnreadByUser so the badge can never leak another user's
   * count.
   *
   * FR-008.4: "view current notifications" (badge count).
   */
  async countUnreadByUser(userId: string): Promise<number> {
    if (!userId) return 0;
    return this.notificationModel
      .countDocuments({
        recipient: new Types.ObjectId(userId),
        read: false,
      })
      .exec();
  }

  /**
   * Fetch all unread notifications for a user, newest first.
   * FR-008.4: "view current notifications."
   *
   * Returns empty array when userId is falsy (auth not wired yet).
   */
  async findUnreadByUser(userId: string): Promise<NotificationDocument[]> {
    if (!userId) return [];
    return this.notificationModel
      .find({
        recipient: new Types.ObjectId(userId),
        read: false,
      })
      .sort({ createdAt: -1 })
      .populate('task', 'title')
      .populate('sprint', 'name')
      .exec();
  }

  /**
   * Fetch all notifications for a user (read + unread), newest first.
   * Useful for a "notification history" view.
   */
  async findByUser(userId: string): Promise<NotificationDocument[]> {
    if (!userId) return [];
    return this.notificationModel
      .find({ recipient: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .populate('task', 'title')
      .populate('sprint', 'name')
      .exec();
  }

  /**
   * Find a single notification by ID (used for ownership check before updating).
   */
  /**
   * Mark a single notification as read.
   * FR-008.4: "clear/dismiss individual notifications."
   *
   * Scoped by recipient so a user can only dismiss their own notifications
   * (prevents IDOR via PATCH /notifications/:id/read).
   */
  async markAsRead(
    id: string,
    userId: string,
  ): Promise<NotificationDocument | null> {
    return this.notificationModel
      .findOneAndUpdate(
        { _id: id, recipient: new Types.ObjectId(userId) },
        { read: true },
        { new: true },
      )
      .exec();
  }

  /**
   * Mark all notifications for a user as read.
   * FR-008.4: "clear/dismiss all notifications with one action."
   *
   * No-op when userId is falsy (auth not wired yet).
   */
  async markAllAsRead(userId: string) {
    if (!userId) return { modifiedCount: 0 };
    return this.notificationModel
      .updateMany(
        { recipient: new Types.ObjectId(userId), read: false },
        { read: true },
      )
      .exec();
  }
}
