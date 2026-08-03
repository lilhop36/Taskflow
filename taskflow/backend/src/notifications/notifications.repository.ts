import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';

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
   * Persist a new notification record.
   * Used by the NotificationListener when events are fired.
   */
  async create(data: Partial<Notification>): Promise<NotificationDocument> {
    const notification = new this.notificationModel(data);
    return notification.save();
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
