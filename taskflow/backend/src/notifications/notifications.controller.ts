import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ParseMongoIdPipe } from '../common/pipes/parse-mongo-id.pipe';

/**
 * Controller for notification endpoints.
 *
 * Routes are under /api/notifications (user-scoped).
 * userId is resolved from the JWT token via @CurrentUser().
 *
 * SRS: FR-008.4 — Notification Center
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * FR-008.4: View notifications for the current user.
   * GET /api/notifications?includeRead=true
   *
   * Default (no param) returns only unread — the notification center's
   * inbox. `?includeRead=true` returns the full read + unread history so
   * the UI can offer a history view of already-dismissed alerts.
   */
  @Get()
  async find(
    @CurrentUser('_id') userId: string,
    @Query('includeRead') includeRead?: string,
  ) {
    if (includeRead === 'true' || includeRead === '1') {
      return this.notificationsService.findByUser(userId);
    }
    return this.notificationsService.findUnreadByUser(userId);
  }

  /**
   * FR-008.4: Unread count for the sidebar badge.
   * GET /api/notifications/unread-count
   *
   * Returns just the count, so the UI badge never has to download the
   * full unread list. Ownership-scoped to the authenticated user.
   */
  @Get('unread-count')
  async unreadCount(@CurrentUser('_id') userId: string) {
    const count = await this.notificationsService.countUnreadByUser(userId);
    return { count };
  }

  /**
   * FR-008.4: Mark a single notification as read.
   * PATCH /api/notifications/:id/read
   *
   * Scoped to the authenticated user (from the JWT) — a user can only
   * dismiss their own notifications.
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id', ParseMongoIdPipe) id: string,
    @CurrentUser('_id') userId: string,
  ) {
    return this.notificationsService.markAsRead(id, userId);
  }

  /**
   * FR-008.4: Mark all notifications as read.
   * PATCH /api/notifications/read-all
   */
  @Patch('read-all')
  async markAllAsRead(@CurrentUser('_id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}
