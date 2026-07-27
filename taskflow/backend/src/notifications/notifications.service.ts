import { Injectable } from '@nestjs/common';
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
   * Returns all unread notifications for a user (newest-first).
   * FR-008.4: "Notification Center — view current notifications."
   */
  async findUnreadByUser(userId: string) {
    return this.notificationsRepository.findUnreadByUser(userId);
  }

  /**
   * Marks a single notification as read.
   * FR-008.4: "clear/dismiss individual notifications."
   */
  async markAsRead(id: string) {
    return this.notificationsRepository.markAsRead(id);
  }

  /**
   * Marks all of a user's unread notifications as read.
   * FR-008.4: "clear/dismiss all notifications with one action."
   */
  async markAllAsRead(userId: string) {
    return this.notificationsRepository.markAllAsRead(userId);
  }
}
