import {
  Controller,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * FR-008.4: View all unread notifications.
   * GET /api/notifications
   */
  @Get()
  async findUnread(@CurrentUser('_id') userId: string) {
    return this.notificationsService.findUnreadByUser(userId);
  }

  /**
   * FR-008.4: Mark a single notification as read.
   * PATCH /api/notifications/:id/read
   */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
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
