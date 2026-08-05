import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';

/**
 * Business logic for notifications.
 *
 * SRS: FR-008.4 — notification center
 * - Users can view current notifications
 * - Users can clear/dismiss individual or all notifications
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  /**
   * Returns the number of the user's unread notifications — feeds the
   * sidebar badge without downloading the full list.
   * FR-008.4: "view current notifications" (badge count).
   */
  async countUnreadByUser(userId: string) {
    return this.notificationsRepository.countUnreadByUser(userId);
  }

  /**
   * Returns all unread notifications for a user (newest-first).
   * FR-008.4: "Notification Center — view current notifications."
   */
  async findUnreadByUser(userId: string) {
    return this.notificationsRepository.findUnreadByUser(userId);
  }

  /**
   * Returns the user's full notification history (read + unread), newest
   * first — used by the "history" view of the notification center.
   */
  async findByUser(userId: string) {
    return this.notificationsRepository.findByUser(userId);
  }

  /**
   * Marks a single notification as read.
   * FR-008.4: "clear/dismiss individual notifications."
   *
   * Scoped to the current user: a notification that does not exist or
   * belongs to another user yields a 404 (never reveals its existence).
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationsRepository.markAsRead(
      id,
      userId,
    );
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  /**
   * Marks all of a user's unread notifications as read.
   * FR-008.4: "clear/dismiss all notifications with one action."
   */
  async markAllAsRead(userId: string) {
    return this.notificationsRepository.markAllAsRead(userId);
  }
}
